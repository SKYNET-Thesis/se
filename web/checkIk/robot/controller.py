"""LeRobot adapter for one SO-101 follower instance.

The class has no global state and can therefore be instantiated independently
for left and right arms. LeRobot uses degrees; kinematics uses radians.
"""

from __future__ import annotations

import time
import numpy as np

from .ik import IKResult, solve_ik
from .kinematics import Pose, SO101Kinematics
from .safety import validate_finite, validate_joint_delta, validate_joint_limits


class RobotController:
    def __init__(self, model: SO101Kinematics, *, port: str, robot_id: str) -> None:
        from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

        config = SO101FollowerConfig(
            port=port,
            id=robot_id,
            use_degrees=True,
            max_relative_target=1.0,
        )
        self.robot = SO101Follower(config)
        self.model = model

    @property
    def is_connected(self) -> bool:
        return self.robot.is_connected

    def connect(self) -> None:
        # Never start an interactive recalibration from a motion test.
        self.robot.connect(calibrate=False)

    def disconnect(self) -> None:
        if self.robot.is_connected:
            self.robot.disconnect()  # LeRobot disables torque by default.

    def get_joint_positions(self) -> tuple[np.ndarray, float]:
        observation = self.robot.get_observation()
        degrees = np.array([observation[f"{name}.pos"] for name in self.model.joint_names], dtype=float)
        gripper = float(observation["gripper.pos"])
        q = np.radians(degrees)
        if not validate_finite(q):
            raise RuntimeError("Robot returned non-finite joint positions")
        return q, gripper

    def get_end_effector_pose(self) -> Pose:
        q, _ = self.get_joint_positions()
        return self.model.forward_kinematics(q)

    def move_joints(
        self,
        target_q,
        *,
        start_q=None,
        gripper: float | None = None,
        max_total_delta_deg: float = 10.0,
        speed_deg_s: float = 3.0,
        rate_hz: float = 20.0,
    ) -> None:
        target = np.asarray(target_q, dtype=float)
        measured_q, measured_gripper = self.get_joint_positions()
        start = measured_q if start_q is None else np.asarray(start_q, dtype=float)
        if np.max(np.abs(start - measured_q)) > np.radians(1.0):
            raise RuntimeError("Provided trajectory start differs from measured robot state")
        if not validate_joint_limits(target, self.model.lower_limits, self.model.upper_limits):
            raise RuntimeError("Target joints violate URDF limits")
        max_delta = np.radians(max_total_delta_deg)
        if not validate_joint_delta(start, target, max_delta):
            raise RuntimeError(f"Joint trajectory exceeds {max_total_delta_deg:g} degree safety limit")
        grip = measured_gripper if gripper is None else float(gripper)
        if not np.isfinite(grip) or not 0.0 <= grip <= 100.0:
            raise RuntimeError("Gripper must be finite and within [0, 100]")

        largest_delta_deg = float(np.max(np.abs(np.degrees(target - start))))
        duration = max(1.0, largest_delta_deg / speed_deg_s)
        steps = max(2, round(duration * rate_hz))

        def action_for(q: np.ndarray) -> dict[str, float]:
            action = {
                f"{name}.pos": float(value)
                for name, value in zip(self.model.joint_names, np.degrees(q), strict=True)
            }
            action["gripper.pos"] = grip
            return action

        for step in range(1, steps + 1):
            phase = step / steps
            alpha = 10 * phase**3 - 15 * phase**4 + 6 * phase**5
            q = start + alpha * (target - start)
            self.robot.send_action(action_for(q))
            time.sleep(duration / steps)

        # A time-based trajectory may finish before a loaded servo catches up.
        # Keep requesting the already-validated final target and require measured
        # convergence rather than treating "command sent" as "motion complete".
        deadline = time.monotonic() + 4.0
        final_error_deg = float("inf")
        while time.monotonic() < deadline:
            self.robot.send_action(action_for(target))
            time.sleep(0.1)
            feedback_q, _ = self.get_joint_positions()
            final_error_deg = float(np.max(np.abs(np.degrees(target - feedback_q))))
            if final_error_deg <= 0.75:
                break
        if final_error_deg > 0.75:
            raise RuntimeError(
                f"Robot did not settle at joint target (max error {final_error_deg:.3f} deg)"
            )

    def solve_end_effector(self, position, *, initial_q=None) -> IKResult:
        if initial_q is None:
            initial_q, _ = self.get_joint_positions()
        return solve_ik(self.model, position, initial_q=initial_q)
