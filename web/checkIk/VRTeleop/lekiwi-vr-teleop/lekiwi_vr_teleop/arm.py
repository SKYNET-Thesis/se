"""Arm control: clutch -> hand axes -> closed-form kinematics -> joint targets.

The operator's hand carries six numbers. The arm can use five of them, and which five is
not negotiable (:mod:`so101_chain`): position takes three, tool pitch and tool roll take
two, and the hand's yaw has nowhere to go. This module decides that split explicitly, and
each surviving channel drives exactly one thing:

===========================  ==========================================================
move the hand                the jaw goes there; the shoulder turns to follow
tilt the hand up or down     the jaw tilts with it
roll the hand over           the jaw rolls with it
turn the hand left or right  nothing — the arm cannot, and now does not pretend to
===========================  ==========================================================

The previous version asked an iterative solver for a full pose and let it spend the
resulting redundancy however it liked, which is why "which joint will move" had no answer.
It also drove the wrist joints directly *on top of* an IK solution that had already used
those same joints to place the tool, so position and orientation fought every frame.

The safety contract, in one place:

* the arm is commanded ONLY while the clutch is held; otherwise :meth:`ArmController.compute`
  returns ``None`` and the caller holds a latched pose;
* the engage edge re-latches everything — tool pose, hand origin, jaw, and both limiter
  anchors — from the MEASURED arm, so a re-engage can never replay a stale target;
* the target is clipped to an absolute workspace box, then rate-limited in Cartesian space,
  then solved, then rate-limited per joint against the last command, then checked against
  the measured arm for a runaway. An unreachable request degrades and is reported; nothing
  in this path raises, because an exception here leaves the arm uncommanded mid-motion.
"""

from __future__ import annotations

import logging

import numpy as np

from lerobot.lerobot_types import RobotAction, RobotObservation
from lerobot.utils.rotation import Rotation

from . import so101_chain as chain
from .config import ARM_MOTORS, ArmConfig
from .operator import HandOrientation, forward_axis
from .state import ControllerState

logger = logging.getLogger(__name__)

# SO-101 gripper calibration: RANGE_0_100 with 100 = fully open.
GRIPPER_MOTOR_SCALE = 100.0

# How close the trigger's commanded jaw position must come to the jaw's actual position
# before it takes control after an engage. Wide enough that the ordinary case — engaging
# with an open jaw and a relaxed finger — takes over on the first frame, and no wider.
GRIPPER_TAKEOVER_TOLERANCE = 6.0

FLEX_JOINTS = tuple(name for name in ARM_MOTORS if name != "gripper")


class HoldLatch:
    """Hold one latched pose while the arm is idle.

    Re-sending freshly measured joints every idle frame would ratchet the arm downward:
    the P-only servo settles below its goal under gravity, so each re-command lowers the
    goal by that steady-state error again. Latching once on the active->idle transition
    holds a fixed pose instead. (Same reasoning as LeRobot's ``HoldLatch``.)
    """

    def __init__(self, motor_names: tuple[str, ...] = ARM_MOTORS):
        self._motor_names = motor_names
        self._held: dict[str, float] | None = None

    def resolve(self, action: RobotAction | None, observation: RobotObservation) -> RobotAction:
        if action is not None:
            self._held = None
            return action
        if self._held is None:
            self._held = {
                f"{name}.pos": float(observation[f"{name}.pos"]) for name in self._motor_names
            }
        return self._held

    def reset(self) -> None:
        self._held = None


class ArmController:
    """Turns one controller's pose + buttons into SO-101 joint targets."""

    def __init__(self, config: ArmConfig):
        self.config = config
        self._engaged = False
        self._hand: HandOrientation | None = None
        self._origin_hand_pos = np.zeros(3)
        self._last_hand_pos = np.zeros(3)
        self._filtered_hand_displacement = np.zeros(3)
        self._home_tool = np.zeros(3)
        self._home_pitch = 0.0
        self._home_roll = 0.0
        # Anchors for the rate limiters. Both track what was COMMANDED, not what was
        # measured; see ArmConfig for why that distinction is the whole ballgame.
        self._commanded_tool: np.ndarray | None = None
        self._commanded: dict[str, float] = {}
        # Jaw state; see _gripper_target. _gripper_command is the single source of
        # truth — the takeover, the rate limit and the force limit all act on it.
        self._gripper_command = GRIPPER_MOTOR_SCALE
        self._gripper_taken = False
        self._gripper_holding = False
        self._ready = False
        # Diagnostics the headset draws, so the operator can see the arm refusing a
        # request instead of inferring it from the arm not moving.
        self._rate_limited = False
        self._reach_error_m = 0.0
        self._pitch_error_deg = 0.0
        self._tracking_error_deg = 0.0

    # ------------------------------------------------------------------ state

    @property
    def engaged(self) -> bool:
        return self._engaged

    @property
    def gripper_taken(self) -> bool:
        """True once the trigger has caught up to the jaw and controls it."""
        return self._gripper_taken

    @property
    def gripper_holding(self) -> bool:
        """True while the jaw is commanded shut against something that will not close.

        The only contact sense this arm has, and it costs nothing: a free jaw tracks its
        command, a blocked one does not."""
        return self._gripper_holding

    def diagnostics(self) -> dict[str, float | bool]:
        """Why the arm is not exactly where the hand is. All four causes are distinct."""
        return {
            "rateLimited": self._rate_limited,
            "reachErrorM": round(self._reach_error_m, 4),
            "pitchErrorDeg": round(self._pitch_error_deg, 1),
            "trackingErrorDeg": round(self._tracking_error_deg, 1),
        }

    def seed(self, observation: RobotObservation) -> None:
        """Latch the startup home from the arm's measured pose.

        Call once before the loop starts, so the very first engage is jump-free even if
        the operator squeezes the grip immediately.
        """
        self._latch(observation)
        self._engaged = False

    def release(self) -> None:
        """Force the clutch open (lost tracking, emergency stop, operator removed the headset)."""
        self._engaged = False

    # ---------------------------------------------------------------- control

    def compute(
        self,
        controller: ControllerState,
        observation: RobotObservation,
        dt_s: float | None = None,
    ) -> RobotAction | None:
        """Return joint targets while the clutch is held, else ``None`` (hold).

        ``observation`` must use bare ``<motor>.pos`` keys — strip LeKiwi's ``arm_``
        prefix before calling.
        """
        position, orientation = self._apply_base_yaw(controller.position, controller.orientation)
        # hand_pivot_m compensates the Touch controller's grip pose rotating around the
        # operator's wrist. XRHand already reports a palm point built from wrist joints;
        # applying the controller compensation there invents translation whenever the
        # palm rotates and makes a lift look like a reach/dive.
        if controller.kind != "hand":
            position = position - self.config.hand_pivot_m * forward_axis(orientation)
        engaged = controller.tracked and controller.squeeze > self.config.clutch_threshold

        if engaged and not self._engaged:
            self._latch(observation, position, orientation)
        self._engaged = engaged
        if not engaged:
            return None

        rate_scale = self._rate_scale(dt_s)

        if controller.ready:
            # Travel to the ready posture instead of following the hand. Still gated by the
            # clutch, still rate- and fault-limited: releasing the grip stops it dead.
            self._ready = True
            return self._approach_ready(observation, rate_scale)
        if self._ready:
            # Back to following the hand. Re-latch first, or the arm would leap to wherever
            # the operator's hand drifted to while the ramp was running.
            self._latch(observation, position, orientation)
            self._ready = False

        assert self._hand is not None and self._commanded_tool is not None
        if controller.kind == "hand" and not self.config.track_hand_orientation:
            pitch_offset, roll_offset = 0.0, 0.0
        else:
            pitch_offset, roll_offset = self._hand.offsets(orientation)
        pose = chain.inverse(
            tuple(
                self._target_tool(
                    position,
                    rate_scale,
                    lock_axes=controller.kind == "hand",
                )
            ),
            self._home_pitch + pitch_offset * self.config.pitch_gain,
            self._home_roll + roll_offset * self.config.roll_gain,
            elbow_up=self.config.elbow_up,
            # The real arm reports angles outside the URDF's limits; a clamp that ignored
            # that would drag the joint back on the engage frame.
            current={name: float(observation[f"{name}.pos"]) for name in FLEX_JOINTS},
        )
        self._reach_error_m = pose.position_error_m
        self._pitch_error_deg = pose.pitch_error_deg

        joints = self._limit(pose.as_dict(), observation, rate_scale)
        joints["gripper"] = self._gripper_target(controller.trigger, observation, rate_scale)
        self._commanded = dict(joints)
        # Re-derive the commanded tool position from the joints actually commanded, so the
        # Cartesian rate limiter starts the next frame from what the arm was really asked
        # for. Anchoring it to the unclamped request instead would let the two limiters
        # disagree, and the Cartesian one would keep paying out steps the joints never took.
        self._commanded_tool = np.asarray(chain.forward(joints)["tool"], dtype=float)
        return {f"{name}.pos": value for name, value in joints.items()}

    def _approach_ready(self, observation: RobotObservation, rate_scale: float = 1.0) -> RobotAction:
        """One rate-limited step toward the configured ready posture.

        Deliberately a ramp rather than a single command: the arm crosses a large part of
        its workspace to get out of the stowed corner, and it should do that at the same
        speed the operator's own motions are allowed, under the same limiters, so nothing
        about it is a special case that could behave differently.
        """
        target = dict(self.config.ready_pose)
        joints = self._limit(target, observation, rate_scale)
        joints["gripper"] = self._gripper_command
        self._commanded = dict(joints)
        self._commanded_tool = np.asarray(chain.forward(joints)["tool"], dtype=float)
        self._reach_error_m = 0.0
        self._pitch_error_deg = 0.0
        return {f"{name}.pos": value for name, value in joints.items()}

    @property
    def approaching_ready(self) -> bool:
        """True while the arm is travelling to its ready posture rather than following."""
        return self._ready

    # ----------------------------------------------------------------- pieces

    def _latch(
        self,
        observation: RobotObservation,
        position: np.ndarray | None = None,
        orientation: np.ndarray | None = None,
    ) -> None:
        """Re-anchor everything to the measured arm and the current hand pose.

        This is the one place a measurement is allowed to set a command. It happens once,
        on the engage edge, where using the real arm pose is exactly right: it is what
        makes engaging the clutch a no-op instead of a jump.
        """
        measured = {name: float(observation[f"{name}.pos"]) for name in FLEX_JOINTS}
        self._home_tool = np.asarray(chain.forward(measured)["tool"], dtype=float)
        self._home_pitch = chain.tool_pitch(
            measured["shoulder_lift"], measured["elbow_flex"], measured["wrist_flex"]
        )
        self._home_roll = measured["wrist_roll"]
        self._commanded_tool = self._home_tool.copy()
        self._commanded = dict(measured)
        if position is not None and orientation is not None:
            self._origin_hand_pos = np.asarray(position, dtype=float).copy()
            self._last_hand_pos = self._origin_hand_pos.copy()
            self._filtered_hand_displacement = np.zeros(3)
            self._hand = HandOrientation(orientation)
        # Latch the jaw where it physically is, and make the trigger earn control of it.
        self._gripper_command = float(observation["gripper.pos"])
        self._gripper_taken = False
        self._gripper_holding = False

    def _rate_scale(self, dt_s: float | None) -> float:
        if dt_s is None:
            return 1.0
        # Cap a delayed tick to two nominal steps. Paying a long scheduler pause out in
        # one command would turn a harmless stall into a motion spike.
        return float(np.clip(dt_s * self.config.nominal_rate_hz, 0.1, 2.0))

    def _target_tool(
        self, position: np.ndarray, rate_scale: float = 1.0, *, lock_axes: bool = False
    ) -> np.ndarray:
        """Hand displacement since engage -> tool target, boxed and rate-limited."""
        assert self._commanded_tool is not None
        displacement = position - self._origin_hand_pos
        if lock_axes and self.config.hand_axis_lock_ratio > 0:
            # Classify the current motion step, not the total displacement since clutch.
            # Otherwise a previous lift remains dominant forever and suppresses a later
            # deliberate sideways motion, making shoulder_pan appear unresponsive.
            step = position - self._last_hand_pos
            self._last_hand_pos = np.asarray(position, dtype=float).copy()
            magnitudes = np.abs(step)
            dominant = int(np.argmax(magnitudes))
            second = float(np.partition(magnitudes, -2)[-2])
            if magnitudes[dominant] >= self.config.hand_axis_lock_min_m:
                ratio = float(magnitudes[dominant] / max(second, 1e-9))
                blend = float(
                    np.clip(
                        (ratio - 1.0) / max(self.config.hand_axis_lock_ratio - 1.0, 1e-6),
                        0.0,
                        1.0,
                    )
                )
                # Fade secondary axes continuously instead of switching them abruptly at
                # a threshold; an abrupt lock/unlock is itself perceived as erratic motion.
                mask = np.full(3, 1.0 - blend)
                mask[dominant] = 1.0
                step = step * mask
            self._filtered_hand_displacement += step
            displacement = self._filtered_hand_displacement
        displacement = displacement * self.config.position_scale
        target = self._home_tool + displacement
        target = np.clip(
            target,
            np.asarray(self.config.bounds_min, dtype=float),
            np.asarray(self.config.bounds_max, dtype=float),
        )
        step = target - self._commanded_tool
        distance = float(np.linalg.norm(step))
        max_step = self.config.max_ee_step_m * rate_scale
        if distance > max_step:
            target = self._commanded_tool + step * (max_step / distance)
        return target

    def _limit(
        self, joints: dict[str, float], observation: RobotObservation, rate_scale: float = 1.0
    ) -> dict[str, float]:
        """Rate-limit against the last command, then fault-limit against the measurement.

        Order matters. The rate limit decides how fast the arm may be *asked* to move and
        must not depend on how promptly the arm answered. The fault limit then asks a
        different question — is the arm answering at all — and only ever tightens.
        """
        limited: dict[str, float] = {}
        self._rate_limited = False
        worst = 0.0
        for name in FLEX_JOINTS:
            target = float(joints[name])
            previous = self._commanded.get(name, float(observation[f"{name}.pos"]))
            alpha = float(np.clip(self.config.joint_smoothing_alpha, 0.0, 1.0))
            target = previous + alpha * (target - previous)
            step = target - previous
            max_step = self.config.max_joint_step_deg * rate_scale
            if abs(step) > max_step:
                target = previous + np.sign(step) * max_step
                self._rate_limited = True
            measured = float(observation[f"{name}.pos"])
            worst = max(worst, abs(target - measured))
            fault = self.config.max_tracking_error_deg
            limited[name] = float(np.clip(target, measured - fault, measured + fault))
        self._tracking_error_deg = worst
        return limited

    def _gripper_target(
        self, trigger: float, observation: RobotObservation, rate_scale: float = 1.0
    ) -> float:
        """Trigger -> jaw target: soft takeover, then rate-limited, then force-limited.

        The mapping is absolute and proportional (finger pulled = jaw closed; SO-101
        calibrates 100 = open) — the same one LeRobot's own example uses. Three things are
        wrapped around it, and none of them is about linearity:

        **Takeover.** An absolute mapping alone makes the jaw jump to wherever the finger
        happens to be the instant the clutch closes. With a relaxed finger that means "snap
        fully open", so the jaw looked permanently open and re-clutching to reposition the
        hand dropped whatever the robot was holding. So the finger must catch up to the jaw
        before it gains control; opening a loaded jaw is then deliberate.

        **Rate.** A jaw that crosses its whole range in one frame cannot be walked onto an
        object; it arrives already closed.

        **Force.** Past the point of contact the jaw stops moving but the command keeps
        going, and every remaining millimetre of finger travel becomes torque instead of
        motion. Nothing on this arm reports that — there is no force feedback in either
        direction — so "just gripped" and "crushing" feel identical. Refusing to command
        the jaw far below where it actually is caps the wind-up, and the gap that develops
        is also what tells us the jaw is holding something at all.
        """
        span = self.config.gripper_open - self.config.gripper_closed
        wanted = self.config.gripper_open - float(trigger) * span

        if not self._gripper_taken:
            if abs(wanted - self._gripper_command) <= GRIPPER_TAKEOVER_TOLERANCE:
                self._gripper_taken = True
            else:
                wanted = self._gripper_command

        step = wanted - self._gripper_command
        max_step = self.config.gripper_max_step * rate_scale
        if abs(step) > max_step:
            wanted = self._gripper_command + np.sign(step) * max_step

        measured = float(observation["gripper.pos"])
        margin = self.config.gripper_squeeze_margin
        self._gripper_command = float(np.clip(wanted, measured - margin, measured + margin))
        self._gripper_holding = measured - self._gripper_command > self.config.gripper_contact
        return self._gripper_command

    def _apply_base_yaw(
        self, position: np.ndarray, orientation: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        """Turn the operator's frame onto the arm base frame, about the base Z axis."""
        if self.config.base_yaw_offset_deg == 0.0:
            return position, orientation
        yaw = Rotation.from_rotvec([0.0, 0.0, np.deg2rad(self.config.base_yaw_offset_deg)])
        return yaw.as_matrix() @ position, (yaw * Rotation.from_quat(orientation)).as_quat()
