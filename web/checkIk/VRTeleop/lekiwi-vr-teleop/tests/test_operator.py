"""The hand-axis decomposition."""

import numpy as np
import pytest
from lerobot.utils.rotation import Rotation

from lekiwi_vr_teleop.frames import VR_TO_BASE, quaternion_to_base
from lekiwi_vr_teleop.operator import (
    FORWARD_AXIS,
    HandOrientation,
    elevation_deg,
    forward_axis,
    twist_deg,
)

IDENTITY = np.array([0.0, 0.0, 0.0, 1.0])


def _rotation(degrees, axis):
    rotvec = np.zeros(3)
    rotvec[{"x": 0, "y": 1, "z": 2}[axis]] = np.deg2rad(degrees)
    return Rotation.from_rotvec(rotvec)


def test_forward_axis_agrees_with_the_frame_conversion():
    """FORWARD_AXIS is derived, not asserted.

    WebXR's grip space points the held object along its local -Z. Push that through the
    same matrix the rest of the pipeline uses and it must land on the constant this module
    hard-codes — otherwise every pitch and roll is measured about the wrong axis, silently.
    """
    assert np.allclose(VR_TO_BASE @ np.array([0.0, 0.0, -1.0]), FORWARD_AXIS)


def test_an_unrotated_controller_points_forward():
    assert np.allclose(forward_axis(IDENTITY), FORWARD_AXIS)
    assert elevation_deg(forward_axis(IDENTITY)) == pytest.approx(0.0)


def test_elevation_survives_pointing_straight_down():
    """Straight down is the normal posture for picking something off a table.

    A yaw-pitch-roll decomposition is singular exactly here; an elevation is not.
    """
    down = _rotation(90.0, "y").as_quat()
    assert elevation_deg(forward_axis(down)) == pytest.approx(-90.0, abs=1e-6)


def test_twist_reads_a_pure_roll():
    for angle in (-170.0, -40.0, 25.0, 150.0):
        delta = _rotation(angle, "x")
        assert twist_deg(delta, FORWARD_AXIS) == pytest.approx(angle, abs=1e-6)


def test_twist_ignores_a_pure_tilt():
    """Tilting must not roll the jaw.

    Reading a rotation-vector component instead — the previous approach — reports a tilt
    about a perpendicular axis as partial roll as soon as the two are combined.
    """
    for axis in ("y", "z"):
        for angle in (-60.0, 30.0):
            assert twist_deg(_rotation(angle, axis), FORWARD_AXIS) == pytest.approx(0.0, abs=1e-6)


def test_twist_separates_a_compound_motion():
    """Roll 30 deg and tilt 40 deg at once: the roll channel must still read 30.

    This is the case that made the old mapping feel arbitrary — no one moves one axis at a
    time, and cross-talk between channels is indistinguishable from the wrong joint moving.
    """
    tilt = _rotation(40.0, "y")
    delta = tilt * _rotation(30.0, "x")
    axis = tilt.as_matrix() @ FORWARD_AXIS
    assert twist_deg(delta, axis) == pytest.approx(30.0, abs=1e-6)


def test_offsets_are_zero_at_the_moment_of_engage():
    for angle, axis in ((55.0, "x"), (-35.0, "y"), (80.0, "z")):
        start = _rotation(angle, axis).as_quat()
        assert HandOrientation(start).offsets(start) == pytest.approx((0.0, 0.0), abs=1e-6)


def test_offsets_are_measured_from_the_engage_pose():
    start = _rotation(20.0, "y")
    hand = HandOrientation(start.as_quat())
    pitch, roll = hand.offsets((start * _rotation(-15.0, "y")).as_quat())
    assert pitch == pytest.approx(15.0, abs=1e-6)
    assert roll == pytest.approx(0.0, abs=1e-6)


def test_a_real_webxr_pose_round_trips():
    """End to end through the actual frame conversion, not a hand-built base quaternion.

    A controller held level and rolled 30 deg about the direction it points must come out
    as 30 deg of roll and no pitch.
    """
    vr_roll = Rotation.from_rotvec([0.0, 0.0, -np.deg2rad(30.0)])  # about WebXR -Z
    hand = HandOrientation(quaternion_to_base(IDENTITY))
    pitch, roll = hand.offsets(quaternion_to_base(vr_roll.as_quat()))
    assert pitch == pytest.approx(0.0, abs=1e-6)
    assert abs(roll) == pytest.approx(30.0, abs=1e-6)
