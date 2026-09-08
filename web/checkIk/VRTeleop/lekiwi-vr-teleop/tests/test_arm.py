"""Arm pipeline tests.

These are about the *mapping*: one hand axis in, one predictable thing out. The kinematics
underneath are checked separately, against placo, in ``test_so101_chain.py``.
"""

import math

import numpy as np
import pytest

from lekiwi_vr_teleop import so101_chain as chain
from lekiwi_vr_teleop.arm import ArmController
from lekiwi_vr_teleop.config import ARM_MOTORS, ArmConfig
from lekiwi_vr_teleop.operator import forward_axis
from lekiwi_vr_teleop.state import ControllerState

# A mid-range pose with room to move in every direction: 5 cm each way and 25 deg of pitch
# either side all solve without touching a joint limit. Chosen deliberately — near the
# limits, clamping dominates and these tests would be measuring the clamp rather than the
# mapping.
OBSERVATION = {
    "shoulder_pan.pos": 0.0,
    "shoulder_lift.pos": -40.0,
    "elbow_flex.pos": 50.0,
    "wrist_flex.pos": 20.0,
    "wrist_roll.pos": 0.0,
    "gripper.pos": 30.0,
}


def _rotation(degrees, axis):
    from lerobot.utils.rotation import Rotation

    rotvec = np.zeros(3)
    rotvec[{"x": 0, "y": 1, "z": 2}[axis]] = np.deg2rad(degrees)
    return Rotation.from_rotvec(rotvec).as_quat()


def _turned(pivot=(0.0, 0.0, 0.0), degrees=0.0, axis="x", **kwargs):
    """A hand rotated about the WRIST, which is what a hand actually does.

    A controller does not turn about its own origin — it turns about the operator's wrist,
    several centimetres back along the direction it points, so the grip pose translates as
    it rotates. Feeding a rotation with the grip position pinned models a wrist attached to
    nobody, and it hides exactly the coupling that made turning the jaw in place impossible.
    """
    orientation = _rotation(degrees, axis)
    grip = np.asarray(pivot, dtype=float) + ArmConfig().hand_pivot_m * forward_axis(orientation)
    return _controller(grip, orientation=orientation, **kwargs)


def _controller(position=(0.0, 0.0, 0.0), squeeze=0.9, trigger=0.0, orientation=None):
    return ControllerState(
        position=np.asarray(position, dtype=float),
        orientation=np.array([0.0, 0.0, 0.0, 1.0]) if orientation is None else orientation,
        squeeze=squeeze,
        trigger=trigger,
        tracked=True,
    )


def _hand(position=(0.0, 0.0, 0.0), orientation=None):
    controller = _controller(position, orientation=orientation)
    controller.kind = "hand"
    return controller


def _arm(**overrides):
    controller = ArmController(ArmConfig(**overrides))
    controller.seed(OBSERVATION)
    return controller


def _engaged(**overrides):
    """An arm whose clutch has already closed with the hand at the neutral pose.

    Engaging is what latches the hand origin, so a test that engages with the hand already
    displaced measures a zero displacement and quietly passes for the wrong reason.
    """
    arm = _arm(**overrides)
    _settle(arm, _controller(), frames=1)
    return arm


def _settle(arm, controller, observation=None, frames=40):
    """Hold the hand still for a while and return the command it converges to.

    The rate limiter deliberately spreads a large request over several frames, so a single
    call answers "how fast" rather than "where to"; these tests are about the latter. The
    arm is modelled as a servo that reaches its goal by the next frame, which is the
    uninteresting case for the limiters and the honest one for the mapping.
    """
    observation = dict(OBSERVATION if observation is None else observation)
    action = None
    for _ in range(frames):
        action = arm.compute(controller, observation)
        observation = {**observation, **action}
    return action


def _joints(action):
    return {name: action[f"{name}.pos"] for name in ARM_MOTORS}


def _tool(action):
    return chain.forward(_joints(action))["tool"]


def _pitch(action):
    return chain.tool_pitch(
        action["shoulder_lift.pos"], action["elbow_flex.pos"], action["wrist_flex.pos"]
    )


# ------------------------------------------------------------------ the clutch


def test_disengaged_clutch_commands_nothing():
    arm = _arm()
    assert arm.compute(_controller((1.0, 2.0, 3.0), squeeze=0.0), OBSERVATION) is None
    assert not arm.engaged


def test_untracked_controller_commands_nothing():
    arm = _arm()
    assert arm.compute(ControllerState(squeeze=1.0, tracked=False), OBSERVATION) is None


def test_engage_frame_does_not_move_the_arm():
    """Squeezing the grip must be a no-op, whatever posture the hand happens to be in."""
    arm = _arm()
    engaged = _controller((1.0, 2.0, 3.0), orientation=_rotation(37.0, "x"))
    action = arm.compute(engaged, OBSERVATION)
    for name in ARM_MOTORS:
        if name == "gripper":
            continue
        assert action[f"{name}.pos"] == pytest.approx(OBSERVATION[f"{name}.pos"], abs=0.1)


def test_re_engaging_elsewhere_does_not_move_the_arm():
    """Release, move the hand a long way, re-engage: the arm must stay put.

    This is the whole point of a clutch — repositioning the hand without dragging the arm
    along — and it only holds if the engage edge re-latches the hand origin AND re-reads
    the arm, which is why it is worth a test of its own.
    """
    arm = _arm()
    arm.compute(_controller((0.0, 0.0, 0.0)), OBSERVATION)
    arm.compute(_controller((0.1, 0.1, 0.1)), OBSERVATION)
    arm.compute(_controller((0.4, -0.3, 0.2), squeeze=0.0), OBSERVATION)  # release
    action = arm.compute(_controller((0.4, -0.3, 0.2)), OBSERVATION)  # re-engage
    for name in ARM_MOTORS:
        if name == "gripper":
            continue
        assert action[f"{name}.pos"] == pytest.approx(OBSERVATION[f"{name}.pos"], abs=0.1)


# ------------------------------------------------------- one hand axis, one result


def test_hand_translation_moves_the_tool_the_same_way():
    arm = _arm()
    home = _tool(_settle(arm, _controller((0.0, 0.0, 0.0))))
    moved = _tool(_settle(arm, _controller((0.03, 0.0, 0.0))))
    assert moved[0] - home[0] == pytest.approx(0.03, abs=2e-3)
    assert abs(moved[1] - home[1]) < 2e-3
    assert abs(moved[2] - home[2]) < 2e-3


def test_position_scale_shrinks_the_motion():
    arm = _arm(position_scale=0.5)
    home = _tool(_settle(arm, _controller((0.0, 0.0, 0.0))))
    moved = _tool(_settle(arm, _controller((0.04, 0.0, 0.0))))
    assert moved[0] - home[0] == pytest.approx(0.02, abs=2e-3)


def test_hand_pitch_drives_the_jaw_pitch_one_for_one():
    """Tilting the hand tilts the jaw, in degrees, and does nothing else.

    A hand rotation about base Y is a pure pitch of the controller's forward axis.
    """
    arm = _arm()
    home = _pitch(_settle(arm, _turned()))
    tilted = _settle(arm, _turned(degrees=-15.0, axis="y"))
    assert _pitch(tilted) - home == pytest.approx(15.0, abs=1.0)
    assert tilted["wrist_roll.pos"] == pytest.approx(OBSERVATION["wrist_roll.pos"], abs=1.0)


def test_hand_roll_drives_the_jaw_roll_one_for_one():
    """Rolling the hand rolls the jaw, and leaves the tool where it was.

    The forward axis is base X, so a rotation about X is pure twist about the hand's own
    pointing direction — exactly the channel wrist_roll implements.
    """
    arm = _arm()
    home = _tool(_settle(arm, _turned()))
    rolled = _settle(arm, _turned(degrees=20.0, axis="x"))
    assert rolled["wrist_roll.pos"] == pytest.approx(OBSERVATION["wrist_roll.pos"] + 20.0, abs=1.0)
    assert math.dist(_tool(rolled), home) < 2e-3


def test_bare_hand_translation_does_not_apply_controller_pivot():
    arm = _arm(hand_pivot_m=0.08)
    arm.compute(_hand(), OBSERVATION)
    moved = _settle(arm, _hand((0.0, 0.0, 0.04)))
    home = chain.forward({name: OBSERVATION[f"{name}.pos"] for name in ARM_MOTORS})["tool"]
    assert _tool(moved)[2] - home[2] == pytest.approx(0.04, abs=2e-3)


def test_bare_hand_rotation_is_locked_by_default():
    arm = _arm()
    arm.compute(_hand(), OBSERVATION)
    rotated = _settle(arm, _hand(orientation=_rotation(25.0, "x")))
    assert rotated["wrist_roll.pos"] == pytest.approx(OBSERVATION["wrist_roll.pos"], abs=1.0)
    assert _pitch(rotated) == pytest.approx(_pitch(OBSERVATION), abs=1.0)


def test_bare_hand_rotation_can_be_enabled_explicitly():
    arm = _arm(track_hand_orientation=True)
    arm.compute(_hand(), OBSERVATION)
    rotated = _settle(arm, _hand(orientation=_rotation(20.0, "x")))
    assert rotated["wrist_roll.pos"] == pytest.approx(20.0, abs=1.0)


def test_bare_hand_dominant_vertical_motion_does_not_reach_forward():
    arm = _arm(hand_axis_lock_ratio=1.25)
    arm.compute(_hand(), OBSERVATION)
    moved = _settle(arm, _hand((0.03, 0.0, 0.08)))
    home = chain.forward({name: OBSERVATION[f"{name}.pos"] for name in ARM_MOTORS})["tool"]
    assert _tool(moved)[0] == pytest.approx(home[0], abs=2e-3)
    assert _tool(moved)[2] - home[2] == pytest.approx(0.08, abs=2e-3)


def test_bare_hand_dominant_reach_holds_height():
    arm = _arm(hand_axis_lock_ratio=1.25)
    arm.compute(_hand(), OBSERVATION)
    moved = _settle(arm, _hand((0.08, 0.0, 0.03)))
    home = chain.forward({name: OBSERVATION[f"{name}.pos"] for name in ARM_MOTORS})["tool"]
    assert _tool(moved)[0] - home[0] == pytest.approx(0.08, abs=2e-3)
    assert _tool(moved)[2] == pytest.approx(home[2], abs=2e-3)


def test_sideways_motion_after_a_lift_is_not_suppressed():
    arm = _arm(hand_axis_lock_ratio=1.25)
    observation = dict(OBSERVATION)
    observation.update(arm.compute(_hand(), observation))
    for _ in range(20):
        observation.update(arm.compute(_hand((0.02, 0.0, 0.08)), observation))
    before_sideways = _tool(observation)
    for _ in range(20):
        observation.update(arm.compute(_hand((0.02, 0.06, 0.08)), observation))
    after_sideways = _tool(observation)
    assert after_sideways[1] - before_sideways[1] == pytest.approx(0.06, abs=2e-3)


def test_hand_yaw_is_discarded():
    """Turning the hand about the vertical must do nothing at all.

    The arm's yaw follows from where the tool is; it is not a separate channel. Previously
    this fed a solver that had to spend the request somewhere, and it did — on whichever
    joints it liked.
    """
    arm = _arm()
    home = _joints(_settle(arm, _turned()))
    yawed = _joints(_settle(arm, _turned(degrees=35.0, axis="z")))
    for name, value in home.items():
        assert yawed[name] == pytest.approx(value, abs=1.0)


def test_negative_gain_flips_the_direction():
    arm = _engaged(roll_gain=-1.0)
    rolled = _settle(arm, _turned(degrees=20.0, axis="x"))
    assert rolled["wrist_roll.pos"] == pytest.approx(OBSERVATION["wrist_roll.pos"] - 20.0, abs=1.0)


# ------------------------------------------------------------------- the limits


def test_rate_limit_is_measured_against_the_last_command():
    """The arm must keep advancing while the servos lag, at the full commanded rate.

    Anchoring the rate limit to the measured angle instead caps joint speed at
    limit/feedback_delay and throws the unspent command away every frame, so the arm falls
    behind the hand and never catches up. Here the observation is deliberately frozen at
    the starting pose — a maximally lagging arm — and the command must still march.
    """
    arm = _arm(max_joint_step_deg=3.0, max_tracking_error_deg=1e6)
    arm.compute(_controller(), OBSERVATION)
    reached = []
    for _ in range(6):
        action = arm.compute(_controller((0.25, 0.0, 0.0)), OBSERVATION)
        reached.append(action["shoulder_lift.pos"])
    steps = np.diff([OBSERVATION["shoulder_lift.pos"], *reached])
    assert max(abs(steps)) <= 3.0 + 1e-6, "the rate limit must still bind"
    assert abs(reached[-1] - OBSERVATION["shoulder_lift.pos"]) > 9.0, "and must not stall"


def test_rate_limit_scales_with_actual_tick_duration():
    fast = _arm(max_joint_step_deg=6.0, max_tracking_error_deg=1e6)
    slow = _arm(max_joint_step_deg=6.0, max_tracking_error_deg=1e6)
    fast.compute(_controller(), OBSERVATION, dt_s=1 / 30)
    slow.compute(_controller(), OBSERVATION, dt_s=1 / 30)
    fast_action = fast.compute(_controller((0.25, 0, 0)), OBSERVATION, dt_s=1 / 60)
    slow_action = slow.compute(_controller((0.25, 0, 0)), OBSERVATION, dt_s=1 / 30)
    fast_step = abs(fast_action["shoulder_lift.pos"] - OBSERVATION["shoulder_lift.pos"])
    slow_step = abs(slow_action["shoulder_lift.pos"] - OBSERVATION["shoulder_lift.pos"])
    assert slow_step == pytest.approx(fast_step * 2, abs=1e-5)


def test_joint_smoothing_is_applied_to_the_command_state():
    raw = _arm(joint_smoothing_alpha=1.0, max_tracking_error_deg=1e6)
    smooth = _arm(joint_smoothing_alpha=0.35, max_tracking_error_deg=1e6)
    raw.compute(_controller(), OBSERVATION)
    smooth.compute(_controller(), OBSERVATION)
    raw_action = raw.compute(_controller((0.005, 0, 0)), OBSERVATION)
    smooth_action = smooth.compute(_controller((0.005, 0, 0)), OBSERVATION)
    raw_step = raw_action["shoulder_lift.pos"] - OBSERVATION["shoulder_lift.pos"]
    smooth_step = smooth_action["shoulder_lift.pos"] - OBSERVATION["shoulder_lift.pos"]
    assert smooth_step == pytest.approx(raw_step * 0.35, abs=1e-6)


def test_fault_limit_stops_a_runaway_against_a_stuck_arm():
    """A joint that never moves must not be commanded indefinitely far from where it is."""
    arm = _arm(max_joint_step_deg=90.0, max_tracking_error_deg=5.0)
    arm.compute(_controller(), OBSERVATION)
    for _ in range(20):
        action = arm.compute(_controller((0.3, 0.2, 0.1)), OBSERVATION)
    for name in ARM_MOTORS:
        if name == "gripper":
            continue
        assert abs(action[f"{name}.pos"] - OBSERVATION[f"{name}.pos"]) <= 5.0 + 1e-6


def test_unreachable_target_reports_instead_of_freezing_silently():
    """Reaching past the workspace must be visible in telemetry, not just felt."""
    arm = _engaged(bounds_max=(2.0, 2.0, 2.0))
    _settle(arm, _controller((1.5, 0.0, 0.0)))
    # Saturates at one Cartesian step: the target is rate-limited from the last commanded
    # tool position, so it never runs away from an arm that cannot follow it. Non-zero is
    # the signal — "you are pushing past the workspace" — not the magnitude.
    assert arm.diagnostics()["reachErrorM"] > 0.02


def test_workspace_box_is_absolute():
    arm = _engaged(bounds_max=(0.25, 0.5, 0.6))
    action = _settle(arm, _controller((1.0, 0.0, 0.0)))
    assert _tool(action)[0] <= 0.25 + 1e-3


# ------------------------------------------------------------------ the gripper


def _jaw(arm, trigger, observation, frames=60, blocked_at=None):
    """Run the jaw to rest, with a servo that follows unless something blocks it.

    ``blocked_at`` models an object: the jaw closes onto it and stops there however hard it
    is commanded shut, which is the case the force limit exists for and the case a frozen
    observation cannot express.
    """
    observation = dict(observation)
    action = None
    for _ in range(frames):
        action = arm.compute(_controller(trigger=trigger), observation)
        jaw = action["gripper.pos"]
        if blocked_at is not None:
            jaw = max(jaw, blocked_at)
        observation = {**observation, **action, "gripper.pos": jaw}
    return action["gripper.pos"], observation["gripper.pos"]


def test_the_jaw_follows_the_trigger_proportionally():
    """Half a trigger pull is half a jaw. The mapping was never the problem — but the
    finger's whole travel was spread over a jaw range that is mostly empty air."""
    arm = _arm()
    open_jaw = {**OBSERVATION, "gripper.pos": 100.0}
    arm.compute(_controller(trigger=0.0), open_jaw)
    for trigger, expected in ((0.0, 100.0), (0.25, 75.0), (0.5, 50.0), (0.75, 25.0), (1.0, 0.0)):
        commanded, _ = _jaw(arm, trigger, open_jaw)
        assert commanded == pytest.approx(expected, abs=0.5)


def test_a_narrowed_range_spends_the_travel_where_the_work_is():
    """The whole finger travel over a 40-unit aperture instead of the full 100."""
    arm = _arm(gripper_open=60.0, gripper_closed=20.0)
    start = {**OBSERVATION, "gripper.pos": 60.0}
    arm.compute(_controller(trigger=0.0), start)
    assert _jaw(arm, 0.5, start)[0] == pytest.approx(40.0, abs=0.5)
    assert _jaw(arm, 1.0, start)[0] == pytest.approx(20.0, abs=0.5)


def test_the_jaw_is_rate_limited():
    """A jaw that crosses its range in one frame arrives already closed, and cannot be
    walked onto an object."""
    arm = _arm(gripper_max_step=4.0)
    open_jaw = {**OBSERVATION, "gripper.pos": 100.0}
    arm.compute(_controller(trigger=0.0), open_jaw)
    previous = 100.0
    for _ in range(5):
        action = arm.compute(_controller(trigger=1.0), open_jaw)
        assert previous - action["gripper.pos"] <= 4.0 + 1e-6
        previous = action["gripper.pos"]


def test_squeezing_an_object_is_force_limited_and_reported():
    """The jaw meets something at 40 and is told to shut completely.

    Past contact the command stops being a position and becomes a torque, with nothing on
    this arm to report it. The command must not run away, and the operator must be told the
    jaw is holding — it is the only contact sense available.
    """
    arm = _arm(gripper_squeeze_margin=18.0)
    open_jaw = {**OBSERVATION, "gripper.pos": 100.0}
    arm.compute(_controller(trigger=0.0), open_jaw)
    commanded, measured = _jaw(arm, 1.0, open_jaw, blocked_at=40.0)
    assert measured == pytest.approx(40.0)
    assert commanded == pytest.approx(40.0 - 18.0, abs=0.5)
    assert arm.gripper_holding


def test_a_free_jaw_is_never_reported_as_holding():
    """The force limit must not bind on a jaw that is simply closing through air."""
    arm = _arm()
    open_jaw = {**OBSERVATION, "gripper.pos": 100.0}
    arm.compute(_controller(trigger=0.0), open_jaw)
    commanded, _ = _jaw(arm, 1.0, open_jaw)
    assert commanded == pytest.approx(0.0, abs=0.5)
    assert not arm.gripper_holding


def test_trigger_maps_to_the_jaw_when_it_starts_open():
    """The ordinary case must feel immediate: open jaw, relaxed finger, engage, squeeze."""
    arm = _arm()
    open_jaw = {**OBSERVATION, "gripper.pos": 98.0}
    arm.compute(_controller(trigger=0.0), open_jaw)  # engage
    assert arm.gripper_taken
    assert _jaw(arm, 0.0, open_jaw)[0] == pytest.approx(100.0, abs=0.5)
    assert _jaw(arm, 1.0, open_jaw)[0] == pytest.approx(0.0, abs=0.5)


def test_engaging_with_a_loaded_jaw_does_not_drop_the_object():
    """Re-clutching to reposition the hand must not fling the jaw open.

    Absolute mapping alone did exactly that: a relaxed finger commands "fully open", so
    every re-engage released whatever the robot was holding.
    """
    arm = _arm()
    holding = {**OBSERVATION, "gripper.pos": 20.0}
    engage = arm.compute(_controller(trigger=0.0), holding)
    assert not arm.gripper_taken
    assert engage["gripper.pos"] == pytest.approx(20.0)

    drifting = arm.compute(_controller((0.005, 0.0, 0.0), trigger=0.2), holding)
    assert drifting["gripper.pos"] == pytest.approx(20.0)

    # Pull the trigger in to meet the jaw: control is handed over, and only then does
    # releasing the trigger open it.
    arm.compute(_controller((0.005, 0.0, 0.0), trigger=0.8), holding)
    assert arm.gripper_taken
    assert _jaw(arm, 0.0, holding)[0] == pytest.approx(100.0, abs=0.5)


# ------------------------------------------------------------------- the frame


def test_base_yaw_offset_mirrors_the_direction():
    """180 deg must send the arm the opposite way for the same hand motion.

    This is the knob for "the operator is standing in front of the robot, looking at it",
    where every hand direction reads backwards without it.
    """
    straight, turned = _engaged(), _engaged(base_yaw_offset_deg=180.0)
    home = np.asarray(_tool(_settle(straight, _controller())))
    a = np.asarray(_tool(_settle(straight, _controller((0.02, 0.0, 0.0))))) - home
    b = np.asarray(_tool(_settle(turned, _controller((0.02, 0.0, 0.0))))) - home
    assert np.linalg.norm(a[:2]) > 1e-3
    assert a[0] == pytest.approx(-b[0], abs=2e-3)


# A pose read off the real robot, in raw telemetry units. Two joints sit outside the
# URDF's declared travel — wrist_roll by 12 deg — because LeRobot's DEGREES mode reports
# (raw - calibrated_middle) * 360/4095 without bounding it, and this arm's wrist_roll is
# calibrated over a full turn while the URDF model stops at 157 deg.
REAL_POSE = {
    "shoulder_pan.pos": 15.3,
    "shoulder_lift.pos": -98.9,
    "elbow_flex.pos": 97.1,
    "wrist_flex.pos": 15.2,
    "wrist_roll.pos": -169.7,
    "gripper.pos": 73.5,
}


def test_engaging_from_a_real_robot_pose_does_not_move_it():
    """The pose that caught this: engaging must be a no-op even outside the model's limits.

    Clamping to the URDF's travel would have dragged wrist_roll 12 deg the moment the
    operator squeezed the grip — a jerk on the frame that is supposed to change nothing,
    on an arm resting exactly where it was left.
    """
    arm = ArmController(ArmConfig())
    arm.seed(REAL_POSE)
    action = arm.compute(_controller(), REAL_POSE)
    for name in ARM_MOTORS:
        if name == "gripper":
            continue
        assert action[f"{name}.pos"] == pytest.approx(REAL_POSE[f"{name}.pos"], abs=0.1), name


def test_a_joint_past_its_limit_may_come_back_but_not_go_further():
    """The relaxation must be one-directional, or it is not a limit at all."""
    arm = ArmController(ArmConfig(max_joint_step_deg=90.0))
    arm.seed(REAL_POSE)
    arm.compute(_controller(), REAL_POSE)
    # Roll the hand the way that drives wrist_roll further past the limit, and back.
    outward = _settle(arm, _turned(degrees=-40.0, axis="x"), REAL_POSE)
    inward = _settle(arm, _turned(degrees=40.0, axis="x"), REAL_POSE)
    assert outward["wrist_roll.pos"] >= REAL_POSE["wrist_roll.pos"] - 1e-6
    assert inward["wrist_roll.pos"] > REAL_POSE["wrist_roll.pos"]


# ------------------------------------------------------------- the ready posture


def _asking_ready(*args, **kwargs):
    c = _controller(*args, **kwargs)
    c.ready = True
    return c


def test_the_ready_ramp_reaches_the_configured_posture():
    """Getting out of the stowed corner is a precondition for teleoperation, not a luxury.

    Parked, the arm cannot move back, down or left at all; from mid-workspace every
    direction solves. So the ramp has to actually arrive.
    """
    parked = {
        "shoulder_pan.pos": 15.3,
        "shoulder_lift.pos": -98.9,
        "elbow_flex.pos": 97.1,
        "wrist_flex.pos": 15.2,
        "wrist_roll.pos": -169.7,
        "gripper.pos": 73.5,
    }
    arm = _arm()
    arm.seed(parked)
    action = _settle(arm, _asking_ready(), parked, frames=120)
    for name, want in ArmConfig().ready_pose.items():
        assert action[f"{name}.pos"] == pytest.approx(want, abs=0.5), name
    assert arm.approaching_ready


def test_the_ready_ramp_obeys_the_rate_limit():
    """It crosses most of the workspace; it must do so at the speed everything else does."""
    arm = _arm(max_joint_step_deg=3.0)
    previous = OBSERVATION["shoulder_lift.pos"]
    observation = dict(OBSERVATION)
    for _ in range(5):
        action = arm.compute(_asking_ready(), observation)
        assert abs(action["shoulder_lift.pos"] - previous) <= 3.0 + 1e-6
        previous = action["shoulder_lift.pos"]
        observation = {**observation, **action}


def test_releasing_the_clutch_stops_the_ready_ramp():
    """The deadman governs this motion like any other."""
    arm = _arm()
    arm.compute(_asking_ready(), OBSERVATION)
    assert arm.compute(_asking_ready(squeeze=0.0), OBSERVATION) is None


def test_returning_from_the_ready_ramp_does_not_jump():
    """The hand drifts while the ramp runs; resuming must re-anchor, not leap to it."""
    arm = _arm()
    moved = dict(OBSERVATION)
    for _ in range(60):
        action = arm.compute(_asking_ready((0.4, -0.3, 0.2)), moved)
        moved = {**moved, **action}
    # Same hand pose, no longer asking: the first following frame must command the arm
    # where it already is.
    resumed = arm.compute(_controller((0.4, -0.3, 0.2)), moved)
    for name in ARM_MOTORS:
        if name == "gripper":
            continue
        assert resumed[f"{name}.pos"] == pytest.approx(moved[f"{name}.pos"], abs=0.1), name
    assert not arm.approaching_ready


def test_turning_the_hand_in_place_does_not_move_the_tool():
    """The complaint that started this: rotating the wrist sent the arm across the room.

    A controller pivots about the wrist, not about its own origin, so a pure turn also
    translates the grip pose by several centimetres — and that translation went straight
    into the position channel. Driving the arm from a point offset back to the wrist is what
    makes "turn the jaw without moving it" possible at all.
    """
    arm = _engaged()
    home = _tool(_settle(arm, _turned()))
    for degrees, axis in ((35.0, "x"), (-25.0, "y"), (40.0, "z"), (-30.0, "x")):
        moved = _tool(_settle(arm, _turned(degrees=degrees, axis=axis)))
        assert math.dist(moved, home) < 3e-3, f"{degrees} deg about {axis}"


def test_without_the_offset_a_turn_does_move_the_tool():
    """The same motion with the correction off, to show it was doing something."""
    arm = ArmController(ArmConfig(hand_pivot_m=0.0))
    arm.seed(OBSERVATION)
    _settle(arm, _turned(), frames=1)
    home = _tool(_settle(arm, _turned()))
    moved = _tool(_settle(arm, _turned(degrees=40.0, axis="z")))
    assert math.dist(moved, home) > 0.02
