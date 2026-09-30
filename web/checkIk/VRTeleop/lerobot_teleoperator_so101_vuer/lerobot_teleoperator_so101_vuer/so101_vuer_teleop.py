import numpy as np
import threading
import time
import asyncio
from typing import Any
from scipy.spatial.transform import Rotation as R

from lerobot.teleoperators.teleoperator import Teleoperator
from .config_so101_vuer_teleop import So101VuerTeleopConfig

from vuer import Vuer, VuerSession
from vuer.schemas import CoordsMarker, Hands, Head, ImageBackground, MotionControllers, Scene
import cv2
import pyroki as pk
from robot_descriptions.loaders.yourdfpy import load_robot_description
from .pyroki_snippets import solve_ik

class So101VuerTeleop(Teleoperator):
    config_class = So101VuerTeleopConfig
    name = "so101_vuer"

    def __init__(self, config: So101VuerTeleopConfig):
        super().__init__(config)
        self.config = config
        self._is_connected = False
        
        # Threading mechanisms
        self._ik_thread = None
        self._vuer_thread = None
        self._vuer_loop = None
        self._lock = threading.Lock()
        
        # Start at a safe default position (from your IK script)
        self._target_pos = np.array([0.00931305, -0.27034248, 0.26730747])
        self._target_wxyz = np.array([0.707, -0.707, 0.0, 0.0])
        self._target_gripper = 0.0
        self._head_matrix_vr = None
        self._hand_matrix_robot = None
        self._hand_anchor_matrix = None
        self._robot_anchor_matrix = None
        self._latest_robot_matrix = None
        self._ik_rest_q = None
        self._last_tracking_time = 0.0
        
        # --- NEW: Visualizer State ---
        self._viz_pos = np.array([0.0, 0.0, 0.0])
        self._viz_rot = np.array([0.0, 0.0, 0.0])
        # -----------------------------
        
        self._latest_q_sol = None
        self._latest_frame = None
        self._has_tracking = threading.Event()
        self._has_head_tracking = threading.Event()
        self._tracking_announced = False
        self._missing_hand_announced = False

        self.ik_joint_mapping = {
            "1": "shoulder_pan", "2": "shoulder_lift", "3": "elbow_flex",
            "4": "wrist_flex", "5": "wrist_roll"
        }

    def compute_robot_target_matrix(self, hand_matrix_vr):
        """
        Transform the hand from headset-relative VR axes into robot base axes.

        Only headset yaw is used, so looking up/down does not tilt the robot's
        workspace. This lets the operator face any direction after entering VR.
        """
        with self._lock:
            head_matrix_vr = None if self._head_matrix_vr is None else self._head_matrix_vr.copy()

        if head_matrix_vr is None:
            head_pos = np.array([0.0, self.config.user_height, 0.0])
            head_yaw = np.eye(3)
        else:
            head_pos = head_matrix_vr[:3, 3]
            head_right = head_matrix_vr[:3, 0].copy()
            head_right[1] = 0.0
            norm = np.linalg.norm(head_right)
            head_right = head_right / norm if norm > 1e-6 else np.array([1.0, 0.0, 0.0])
            head_back = np.array([-head_right[2], 0.0, head_right[0]])
            head_yaw = np.column_stack((head_right, np.array([0.0, 1.0, 0.0]), head_back))

        shoulder_x = -0.20 if self.config.user_hand == "left" else 0.20
        vertical_offset = {
            "headset": 0.0,
            "ribs": -0.40,
            "hip": -0.70,
            "floor": -self.config.user_height,
        }.get(self.config.target_coord_sys, -0.40)
        origin_local = np.array([shoulder_x, vertical_offset, 0.10])
        origin_pos = head_pos + head_yaw @ origin_local

        # Express the hand in yaw-aligned headset coordinates first.
        T_yaw_vr = np.eye(4)
        T_yaw_vr[:3, :3] = head_yaw
        T_yaw_vr[:3, 3] = origin_pos
        T_hand_torso = np.linalg.inv(T_yaw_vr) @ hand_matrix_vr

        # Headset: +X=right, +Y=up, -Z=forward.
        # Robot: +X=forward, +Y=left, +Z=up.
        R_vr_to_robot = np.array([
            [ 0,  0, -1],
            [-1,  0,  0],
            [ 0,  1,  0]
        ])

        T_vr_to_robot = np.eye(4)
        T_vr_to_robot[:3, :3] = R_vr_to_robot
        
        # Final Hand relative to Robot Base
        T_hand_robot = T_vr_to_robot @ T_hand_torso
        
        # Apply a local rotation offset to align the hand's grip with the robot gripper
        # Adjusting roll/pitch/yaw locally so the thumbs align
        hand_offset = R.from_euler('z', -np.pi / 2).as_matrix() # 90 degree correction around Z (local forward in VR)
        T_offset = np.eye(4)
        T_offset[:3, :3] = hand_offset
        T_hand_robot = T_hand_robot @ T_offset
        
        return T_hand_robot

    def _update_target_from_hand(self, hand_matrix_robot: np.ndarray) -> None:
        """Map hand displacement from the latch point onto the measured robot pose."""
        now = time.monotonic()
        with self._lock:
            if now - self._last_tracking_time > self.config.tracking_timeout_s:
                self._hand_anchor_matrix = None
                self._robot_anchor_matrix = None
                self._latest_q_sol = None
                self._has_tracking.clear()
            self._last_tracking_time = now
            self._hand_matrix_robot = hand_matrix_robot.copy()

            if self._hand_anchor_matrix is None or self._robot_anchor_matrix is None:
                return

            hand_delta = hand_matrix_robot[:3, 3] - self._hand_anchor_matrix[:3, 3]
            self._target_pos = (
                self._robot_anchor_matrix[:3, 3] + self.config.position_scale * hand_delta
            )
            rotation_delta = (
                hand_matrix_robot[:3, :3] @ self._hand_anchor_matrix[:3, :3].T
            )
            target_rotation = rotation_delta @ self._robot_anchor_matrix[:3, :3]
            quat_xyzw = R.from_matrix(target_rotation).as_quat()
            self._target_wxyz = np.array(
                [quat_xyzw[3], quat_xyzw[0], quat_xyzw[1], quat_xyzw[2]]
            )
            self._has_tracking.set()

    def update_robot_observation(self, observation: dict[str, float]) -> None:
        """Update measured EE pose and latch a jump-free hand/robot origin when needed."""
        if not hasattr(self, "robot"):
            return
        q = np.zeros(len(self.urdf_joints), dtype=float)
        motor_names = {
            "1": "shoulder_pan.pos",
            "2": "shoulder_lift.pos",
            "3": "elbow_flex.pos",
            "4": "wrist_flex.pos",
            "5": "wrist_roll.pos",
            "6": "gripper.pos",
        }
        for index, joint_name in enumerate(self.urdf_joints):
            key = motor_names.get(joint_name)
            if key in observation:
                q[index] = np.deg2rad(float(observation[key]))

        poses = np.asarray(self.robot.forward_kinematics(q))
        pose = poses[self.robot.links.names.index(self.config.target_link)]
        robot_matrix = np.eye(4)
        robot_matrix[:3, :3] = R.from_quat(
            [pose[1], pose[2], pose[3], pose[0]]
        ).as_matrix()
        robot_matrix[:3, 3] = pose[4:7]

        announced = False
        with self._lock:
            self._latest_robot_matrix = robot_matrix
            self._ik_rest_q = q.copy()
            fresh = time.monotonic() - self._last_tracking_time <= self.config.tracking_timeout_s
            if fresh and self._hand_matrix_robot is not None and self._hand_anchor_matrix is None:
                self._hand_anchor_matrix = self._hand_matrix_robot.copy()
                self._robot_anchor_matrix = robot_matrix.copy()
                self._target_pos = robot_matrix[:3, 3].copy()
                self._target_wxyz = pose[:4].copy()
                announced = True
        if announced:
            print("Hand/robot origin latched. Move the hand; pinch controls the gripper.")

    def _vuer_worker(self):
        """Background thread for the Vuer asyncio event loop."""
        loop = asyncio.new_event_loop()
        self._vuer_loop = loop
        asyncio.set_event_loop(loop)
        
        app = Vuer(host=self.config.vuer_host, cert=self.config.vuer_cert, key=self.config.vuer_key)

        @app.add_handler("HAND_MOVE")
        async def on_hand_move(event, session):
            hand_data = event.value.get(self.config.user_hand)
            if hand_data is None or len(hand_data) < 16:
                if not self._missing_hand_announced:
                    print(
                        f"HAND_MOVE received, but no {self.config.user_hand} hand was present. "
                        f"Payload keys: {sorted(event.value.keys())}"
                    )
                    self._missing_hand_announced = True
                return
                
            wrist_flat_array = hand_data[:16]
            hand_matrix_vr = np.array(wrist_flat_array).reshape(4, 4).T

            # --- THE GIZMO MATH (VR Space) ---
            # Completely raw, unperturbed hand coordinates directly from the headset
            viz_pos = hand_matrix_vr[:3, 3]
            viz_euler = R.from_matrix(hand_matrix_vr[:3, :3]).as_euler('xyz')
            # ---------------------------------
            
            # Extract pinch strength for the gripper
            hand_state = event.value.get(f"{self.config.user_hand}State", {})
            # Some WebXR implementations use 'pinch', others use 'pinchStrength'
            pinch_val = hand_state.get(
                "pinchValue",
                hand_state.get("pinchStrength", float(hand_state.get("pinch", False))),
            )
            
            # Transform matrix
            T_robot = self.compute_robot_target_matrix(hand_matrix_vr)
            with self._lock:
                # --- NEW: Save visualizer state ---
                self._viz_pos = viz_pos
                self._viz_rot = viz_euler
                # ----------------------------------
                self._target_gripper = 1.0 - float(pinch_val)
            if self._has_head_tracking.is_set():
                self._update_target_from_hand(T_robot)
            if self._has_tracking.is_set() and not self._tracking_announced:
                print(f"Tracking active: {self.config.user_hand} hand. Sending IK targets to the follower.")
                self._tracking_announced = True

        @app.add_handler("HEAD_MOVE")
        async def on_head_move(event, session):
            matrix = event.value.get("matrix")
            if matrix is None or len(matrix) < 16:
                return
            head_matrix_vr = np.asarray(matrix[:16], dtype=float).reshape(4, 4).T
            with self._lock:
                self._head_matrix_vr = head_matrix_vr
            self._has_head_tracking.set()

        @app.add_handler("CONTROLLER_MOVE")
        async def on_controller_move(event, session):
            controller_data = event.value.get(self.config.user_hand)
            if not controller_data or len(controller_data) < 16:
                return
                
            wrist_flat_array = controller_data[:16]
            hand_matrix_vr = np.array(wrist_flat_array).reshape(4, 4).T

            # --- THE GIZMO MATH (VR Space) ---
            # Completely raw, unperturbed controller coordinates
            viz_pos = hand_matrix_vr[:3, 3]
            viz_euler = R.from_matrix(hand_matrix_vr[:3, :3]).as_euler('xyz')
            # ---------------------------------
            
            # Extract trigger value for the gripper
            state = event.value.get(f"{self.config.user_hand}State", {})
            pinch_val = state.get("triggerValue", state.get("squeezeValue", 0.0))
            
            # Transform matrix (Note: compute_robot_target_matrix still has one Z-axis hand_offset inside it)
            T_robot = self.compute_robot_target_matrix(hand_matrix_vr)
            
            # ALL extra controller rotation perturbations have been removed from here!
            
            with self._lock:
                # --- NEW: Save visualizer state ---
                self._viz_pos = viz_pos
                self._viz_rot = viz_euler
                # ----------------------------------
                self._target_gripper = 1.0 - float(pinch_val)
            if self._has_head_tracking.is_set():
                self._update_target_from_hand(T_robot)
            if self._has_tracking.is_set() and not self._tracking_announced:
                print(f"Tracking active: {self.config.user_hand} controller. Sending IK targets to the follower.")
                self._tracking_announced = True

        @app.spawn(start=True)
        async def main(session: VuerSession):
            print("Quest connected to Vuer. Enter VR and show the left hand.")
            session.set(Scene())
            session.upsert(
                Hands(
                    fps=30,
                    stream=True,
                    key="hands",
                    disableLeft=self.config.user_hand != "left",
                    disableRight=self.config.user_hand != "right",
                ),
                to="bgChildren",
            )
            session.upsert(Head(stream=True, fps=30, show=False, key="head_tracking"), to="bgChildren")
            session.upsert(MotionControllers(stream=True, key="motionControllers", left=True, right=True), to="bgChildren")
            while self._is_connected:
                with self._lock:
                    current_img = self._latest_frame
                    # Safely copy the gizmo state
                    viz_pos = self._viz_pos.copy()
                    viz_rot = self._viz_rot.copy()
                    
                # --- NEW: Render the Vector Gizmo ---
                session.upsert(
                    CoordsMarker(
                        position=viz_pos.tolist(),
                        rotation=viz_rot.tolist(),
                        scale=0.15, # Sets the vectors to be 15cm long
                        key="ik_gizmo"
                    ),
                    to="bgChildren"
                )
                
                if current_img is not None:
                    session.upsert(
                        ImageBackground(
                            current_img,
                            format="jpeg",
                            quality=50,
                            fixed=True,             
                            # Pushes the screen further away from your face (80cm)
                            distanceToCamera=1,   
                            key="camera_feed",
                            # X=0 (centered)
                            # Y= drops the screen 60cm below your eye level
                            # Z=0 (depth is handled by distanceToCamera)
                            position=[0, self.config.user_height - 0.6, -3],
                        ),
                        to="bgChildren"
                    )
                    
                await asyncio.sleep(1.0 / self.config.scene_hz)

        print("VR Server Started. Waiting for headset connection...")
        app.run()

    def _ik_worker(self):
        """Background thread that continuously solves IK based on the VR state."""
        while self._is_connected:
            if not self._has_tracking.wait(timeout=0.1):
                continue
            with self._lock:
                target_pos = self._target_pos.copy()
                target_quat = self._target_wxyz.copy()
                rest_pose = None if self._ik_rest_q is None else self._ik_rest_q.copy()

            if rest_pose is None:
                time.sleep(1.0 / self.config.ik_hz)
                continue

            q_sol = solve_ik(
                robot=self.robot,
                target_link_name=self.config.target_link,
                target_position=target_pos,
                target_wxyz=target_quat,
                rest_pose=rest_pose,
            )

            if q_sol is not None:
                with self._lock:
                    self._latest_q_sol = q_sol

            time.sleep(1.0 / self.config.ik_hz)

    def _camera_worker(self):
        """Autonomously searches for the active robot in memory to copy its camera feed, bypassing LeRobot's closed CLI loop."""
        import gc
        from lerobot.robots.robot import Robot as BaseRobot
        active_robot = None
        
        while self._is_connected:
            try:
                if active_robot is None:
                    # Dynamically find the active robot initialized by the CLI
                    for obj in gc.get_objects():
                        if isinstance(obj, BaseRobot) and getattr(obj, "is_connected", False):
                            active_robot = obj
                            break
                
                if active_robot is not None and hasattr(active_robot, "get_observation"):
                    obs = active_robot.get_observation()
                    selected_img = None
                    # Find any camera matrix from MuJoCo or Realsense
                    for key, val in obs.items():
                        if isinstance(val, np.ndarray) and val.ndim == 3:
                            selected_img = val
                            break
                            
                    if selected_img is not None:
                        # Convert to uint8 if necessary
                        if selected_img.dtype != np.uint8:
                            selected_img = (np.clip(selected_img, 0, 1) * 255).astype(np.uint8)

                        # Deep copy and resize to save bandwidth (fixes the SegFault and Network Choking)
                        selected_img = cv2.resize(selected_img.copy(), (320, 240))
                        
                        with self._lock:
                            # Pass the raw numpy array directly! No Base64 or OpenCV conversion needed.
                            self._latest_frame = selected_img
            except Exception:
                pass
            time.sleep(0.033) # ~30 FPS polling

    def connect(self) -> None:
        self.urdf = load_robot_description(self.config.urdf_name)
        self.robot = pk.Robot.from_urdf(self.urdf)
        self.urdf_joints = [j.name for j in self.urdf.actuated_joints]
        
        print("\n--- Compiling JAX IK Solver ---")
        dummy_pos = np.array([0.3, 0.0, 0.2])
        dummy_quat = np.array([1.0, 0.0, 0.0, 0.0])
        solve_ik(
            robot=self.robot, target_link_name=self.config.target_link,
            target_position=dummy_pos, target_wxyz=dummy_quat,
            rest_pose=np.zeros(len(self.urdf_joints)),
        )
        print("--- JAX Compilation Complete! ---\n")

        self._is_connected = True

        self._ik_thread = threading.Thread(target=self._ik_worker, daemon=True)
        self._vuer_thread = threading.Thread(target=self._vuer_worker, daemon=True)
        
        self._ik_thread.start()
        self._vuer_thread.start()
        if self.config.stream_camera:
            self._cam_thread = threading.Thread(target=self._camera_worker, daemon=True)
            self._cam_thread.start()

    def disconnect(self) -> None:
        self._is_connected = False
        if self._ik_thread:
            self._ik_thread.join(timeout=1.0)
        if self._vuer_loop and self._vuer_loop.is_running():
            self._vuer_loop.call_soon_threadsafe(self._vuer_loop.stop)
        if self._vuer_thread:
            self._vuer_thread.join(timeout=3.0)

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    def get_action(self) -> dict:
        with self._lock:
            q_sol = self._latest_q_sol
            gripper_val = self._target_gripper

        action_dict = {
            "shoulder_pan.pos": 0.0, "shoulder_lift.pos": 0.0, "elbow_flex.pos": 0.0,
            "wrist_flex.pos": 0.0, "wrist_roll.pos": 0.0,
            "gripper.pos": gripper_val * 100.0,
        }

        if q_sol is not None:
            if "1" in self.urdf_joints: action_dict["shoulder_pan.pos"] = float(np.rad2deg(q_sol[self.urdf_joints.index("1")]))
            if "2" in self.urdf_joints: action_dict["shoulder_lift.pos"] = float(np.rad2deg(q_sol[self.urdf_joints.index("2")]))
            if "3" in self.urdf_joints: action_dict["elbow_flex.pos"] = float(np.rad2deg(q_sol[self.urdf_joints.index("3")]))
            if "4" in self.urdf_joints: action_dict["wrist_flex.pos"] = float(np.rad2deg(q_sol[self.urdf_joints.index("4")]))
            if "5" in self.urdf_joints: action_dict["wrist_roll.pos"] = float(np.rad2deg(q_sol[self.urdf_joints.index("5")]))
            
        return action_dict

    @property
    def has_tracking(self) -> bool:
        fresh = time.monotonic() - self._last_tracking_time <= self.config.tracking_timeout_s
        return fresh and self._has_tracking.is_set() and self._latest_q_sol is not None
    
    @property
    def action_features(self) -> dict:
        return {
            "shoulder_pan.pos": float, "shoulder_lift.pos": float, "elbow_flex.pos": float,
            "wrist_flex.pos": float, "wrist_roll.pos": float, "gripper.pos": float,
        }

    @property
    def feedback_features(self) -> dict: return {}
    @property
    def is_calibrated(self) -> bool: return True
    def calibrate(self) -> None: pass
    def configure(self) -> None: pass
    
    def send_feedback(self, feedback: dict[str, Any]) -> None: pass
