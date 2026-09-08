"""The closed-form chain is checked against placo, joint for joint.

``so101_chain`` hard-codes link lengths and mounting angles read out of the URDF once. That
is only safe if something keeps checking them against the URDF itself — otherwise a URDF
revision silently turns every commanded pose into a lie, and the headset would keep drawing
a confident, wrong arm. These tests are that check.
"""

import math
import random

import pytest

from lekiwi_vr_teleop import so101_chain as chain
from lekiwi_vr_teleop.config import ARM_MOTORS

placo = pytest.importorskip("placo", reason="install the 'ik' extra to compare against placo")

import numpy as np  # noqa: E402

from lerobot.model.kinematics import RobotKinematics  # noqa: E402

from lekiwi_vr_teleop.urdf import ensure_so101_urdf  # noqa: E402

JOINTS = [m for m in ARM_MOTORS if m != "gripper"]


@pytest.fixture(scope="module")
def kinematics():
    return RobotKinematics(
        urdf_path=ensure_so101_urdf(),
        target_frame_name="gripper_frame_link",
        joint_names=list(ARM_MOTORS),
    )


def _placo_tool(kinematics, joints):
    q = np.array([joints.get(name, 0.0) for name in ARM_MOTORS], dtype=float)
    return kinematics.forward_kinematics(q)


def _sample(rng):
    """A random in-limit pose whose tool is out in front of the pan axis.

    Poses folded back over the pan axis are excluded on purpose. There the arm's radial
    coordinate goes negative, so the same tool point is described equally well by the
    mirrored pan — the inverse is genuinely two-valued and ``inverse()`` documents which
    branch it picks. Testing round trips across that boundary would only be measuring the
    ambiguity, not the model. Everything reachable in ordinary teleoperation is here.
    """
    while True:
        joints = {
            name: rng.uniform(*[0.85 * bound for bound in chain.JOINT_LIMITS[name]])
            for name in JOINTS
        }
        x, y, _ = chain.forward(joints)["tool"]
        # Signed radial distance, not the plain hypot: a folded-back arm puts the tool an
        # arbitrarily long way from the pan axis on the *far* side, which passes a distance
        # test and is exactly the ambiguous case being excluded.
        pan = math.radians(-joints["shoulder_pan"])
        if (x - chain.PAN_AXIS_X) * math.cos(pan) + y * math.sin(pan) > 0.06:
            return joints


def test_forward_matches_placo(kinematics):
    """Our jaw frame is placo's gripper_frame_link, everywhere in the joint space.

    ``forward()["tool"]`` is our own control point on the roll axis, which the URDF has no
    frame for; ``["jaw"]`` reconstructs the URDF frame from it, and that is what can be
    compared. If this passes, the hard-coded constants still match the URDF on disk.
    """
    rng = random.Random(20260804)
    worst = 0.0
    for _ in range(300):
        joints = _sample(rng)
        expected = _placo_tool(kinematics, joints)[:3, 3]
        worst = max(worst, math.dist(chain.forward(joints)["jaw"], expected))
    assert worst < 1e-4, f"jaw frame drifts from placo by {worst * 1000:.3f} mm"


def test_roll_does_not_move_the_control_point(kinematics):
    """Turning the wrist must not translate the thing the operator is aiming.

    placo's gripper_frame_link swings on a 7.9 mm circle as the wrist rolls. Our control
    point sits on the roll axis precisely so that it does not, and this pins that down.
    """
    base = {"shoulder_lift": -30.0, "elbow_flex": 50.0, "wrist_flex": 15.0, "shoulder_pan": 20.0}
    reference = chain.forward({**base, "wrist_roll": 0.0})["tool"]
    for roll in (-150.0, -60.0, 45.0, 160.0):
        assert math.dist(chain.forward({**base, "wrist_roll": roll})["tool"], reference) < 1e-9
    # ... while the URDF frame really does move, which is why this mattered.
    urdf_swing = math.dist(
        _placo_tool(kinematics, {**base, "wrist_roll": 0.0})[:3, 3],
        _placo_tool(kinematics, {**base, "wrist_roll": 180.0})[:3, 3],
    )
    assert urdf_swing == pytest.approx(2 * chain.JAW_ECCENTRICITY, abs=1e-4)


def test_approach_axis_matches_placo(kinematics):
    """The drawn jaw direction must be the real one, or the ghost teaches the wrong thing."""
    rng = random.Random(7)
    for _ in range(200):
        joints = _sample(rng)
        expected = _placo_tool(kinematics, joints)[:3, 2]
        assert np.allclose(chain.forward(joints)["approach"], expected, atol=1e-4)


def test_pitch_identity_holds(kinematics):
    """tool pitch == -(lift + elbow + wrist_flex). The identity the whole design rests on.

    The radial component is taken *signed*, along the arm's own plane. Using ``hypot`` here
    silently folds pitches past +-90 deg back into range, which hides exactly the folded-back
    postures the identity most needs to be checked on.
    """
    rng = random.Random(99)
    for _ in range(200):
        joints = _sample(rng)
        approach = _placo_tool(kinematics, joints)[:3, 2]
        pan = math.radians(-joints["shoulder_pan"])
        radial = approach[0] * math.cos(pan) + approach[1] * math.sin(pan)
        measured = math.degrees(math.atan2(approach[2], radial))
        predicted = chain.tool_pitch(
            joints["shoulder_lift"], joints["elbow_flex"], joints["wrist_flex"]
        )
        # Compared on the circle: the sum can run past +-180 while atan2 cannot.
        assert (measured - predicted + 180.0) % 360.0 - 180.0 == pytest.approx(0.0, abs=0.01)


def test_pan_is_dictated_by_the_target_azimuth(kinematics):
    """Yaw is not a free orientation channel: it follows from where the tool is.

    This is the fact that makes turning the hand about the vertical meaningless, and it is
    worth pinning down — the previous design spent a solver's null space discovering it
    afresh every frame. Sampled at zero roll, where the URDF frame has not yet swung off
    the arm's plane and so still carries the plane's azimuth.
    """
    rng = random.Random(5)
    for _ in range(100):
        joints = {**_sample(rng), "wrist_roll": 0.0}
        x, y, _ = _placo_tool(kinematics, joints)[:3, 3]
        azimuth = -math.degrees(math.atan2(y, x - chain.PAN_AXIS_X))
        # Loose by 0.2 deg because the URDF frame this is measured from sits 0.18 mm off
        # the roll axis; close to the pan axis that lever arm is worth ~0.17 deg of
        # azimuth. The identity itself is exact — see test_pitch_identity_holds, which is
        # measured from a direction rather than a point and holds to 0.01 deg.
        assert azimuth == pytest.approx(joints["shoulder_pan"], abs=0.2)


def test_inverse_round_trips_through_forward():
    """Solve for a pose, then check the solved joints actually produce it."""
    rng = random.Random(1234)
    solved = 0
    for _ in range(400):
        joints = _sample(rng)
        pose = chain.forward(joints)
        pitch = chain.tool_pitch(
            joints["shoulder_lift"], joints["elbow_flex"], joints["wrist_flex"]
        )
        result = chain.inverse(pose["tool"], pitch, joints["wrist_roll"])
        if result.clamped:
            continue  # a clamped solve is allowed to miss; that is what clamped means
        solved += 1
        assert result.position_error_m < 1e-4
        assert result.pitch_error_deg == pytest.approx(0.0, abs=0.01)
    assert solved > 200, "too few unclamped samples to call this a test"


def test_inverse_is_reachable_from_placos_point_of_view(kinematics):
    """Close the loop through placo, not just through our own forward()."""
    rng = random.Random(4321)
    for _ in range(200):
        joints = _sample(rng)
        target = chain.forward(joints)["tool"]
        pitch = chain.tool_pitch(
            joints["shoulder_lift"], joints["elbow_flex"], joints["wrist_flex"]
        )
        result = chain.inverse(target, pitch, joints["wrist_roll"])
        if result.clamped:
            continue
        # Compare in the URDF's own frame, so placo is the judge end to end.
        reached = _placo_tool(kinematics, result.as_dict())[:3, 3]
        assert math.dist(reached, chain.forward(result.as_dict())["jaw"]) < 1e-4


def test_unreachable_target_clamps_instead_of_raising():
    """Reaching past the workspace must degrade, not throw: an exception here would leave
    the arm uncommanded in the middle of a motion."""
    far = chain.inverse((2.0, 0.0, 0.5), 0.0, 0.0)
    assert far.clamped
    assert far.position_error_m > 0.5
    for name in ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll"):
        low, high = chain.JOINT_LIMITS[name]
        assert low - 1e-9 <= getattr(far, name) <= high + 1e-9


def test_solution_is_continuous_along_a_path():
    """No branch flips: neighbouring targets must give neighbouring joints.

    An elbow that flips between solutions mid-stroke is the single most alarming thing a
    teleoperated arm can do, and an iterative solver picking whichever branch it converged
    to is exactly how that happens.
    """
    previous = None
    for step in range(200):
        x = 0.20 + 0.0008 * step
        pose = chain.inverse((x, 0.02 * math.sin(step / 12), 0.16), -20.0, 0.0)
        if previous is not None:
            for name in JOINTS:
                jump = abs(getattr(pose, name) - getattr(previous, name))
                assert jump < 3.0, f"{name} jumped {jump:.1f} deg between adjacent targets"
        previous = pose


def test_elbow_branch_is_selectable():
    """Both branches reach the same point, and they are genuinely different postures.

    Finding a target where both solve took a workspace sweep: the SO-101's joint limits
    admit the mirrored branch in about 1% of reachable poses (see the test below). This
    target is one of those.
    """
    target, pitch = (0.0827, -0.1400, 0.3954), 11.60
    up = chain.inverse(target, pitch, 0.0, elbow_up=True)
    down = chain.inverse(target, pitch, 0.0, elbow_up=False)
    assert not up.clamped and not down.clamped
    assert up.position_error_m < 1e-4 and down.position_error_m < 1e-4
    assert abs(up.elbow_flex - down.elbow_flex) > 20.0
    assert up.shoulder_pan == pytest.approx(down.shoulder_pan), "pan is branch-independent"


def test_the_joint_limits_almost_always_pin_the_branch():
    """An elbow flip is not merely avoided here — it is nearly impossible on this arm.

    Sweeping the workspace, the elbow-down branch is never the *only* solution and is
    jointly available in roughly 1% of poses. So the branch choice cannot ambiguously flip
    mid-stroke, which is the failure mode an iterative solver has and this one does not.
    """
    rng = random.Random(1)
    counts = {"both": 0, "up": 0, "down": 0}
    for _ in range(4000):
        x, y = rng.uniform(0.05, 0.45), rng.uniform(-0.3, 0.3)
        z, pitch = rng.uniform(-0.05, 0.45), rng.uniform(-90, 90)
        if math.hypot(x - chain.PAN_AXIS_X, y) < 0.06:
            continue
        up = not chain.inverse((x, y, z), pitch, 0.0).clamped
        down = not chain.inverse((x, y, z), pitch, 0.0, elbow_up=False).clamped
        if up and down:
            counts["both"] += 1
        elif up:
            counts["up"] += 1
        elif down:
            counts["down"] += 1
    assert counts["down"] == 0, "elbow-down is never the only solution"
    assert counts["up"] > 20 * counts["both"]
