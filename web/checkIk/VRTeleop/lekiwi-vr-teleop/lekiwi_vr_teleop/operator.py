"""Splitting the operator's hand pose into the channels the SO-101 actually has.

The arm offers exactly two free orientation degrees of freedom — the tool's pitch and its
roll — while its yaw is dictated by where the tool is (see :mod:`so101_chain`). A hand,
of course, offers three. So one channel of the operator's motion has nowhere to go, and
the only question is whether that is decided here, explicitly, or left to a solver's null
space to decide differently every frame.

It is decided here:

* **pitch** — the elevation of the hand's forward axis. Tilt the hand up, the jaw tilts up.
* **roll** — the twist of the hand *about that same forward axis*. Turn the hand over, the
  jaw turns over.
* **yaw** — discarded. Swinging the hand left and right about the vertical does nothing to
  the orientation; it moves the tool, and the arm's yaw follows from that.

Both channels are measured about the hand's *own* forward axis rather than about fixed
base axes. That distinction is not cosmetic: the roll axis of the real wrist points along
the forearm, so it swings round with the shoulder. Measuring roll about a fixed base axis
agrees with the machine only when the arm happens to point along that axis, and silently
disagrees everywhere else.
"""

from __future__ import annotations

import math

import numpy as np

from lerobot.utils.rotation import Rotation

# The controller's forward direction, written in base axes.
#
# ``frames.VR_TO_BASE`` maps the WebXR grip frame onto the arm base frame, and it carries
# the controller's local -Z ("the way the held object points") onto base +X. So once a
# controller quaternion has been through ``quaternion_to_base``, the hand points along the
# first column of its rotation matrix. ``tests/test_operator.py`` checks this against
# ``frames`` rather than trusting the comment.
FORWARD_AXIS = np.array([1.0, 0.0, 0.0])


def forward_axis(orientation: np.ndarray) -> np.ndarray:
    """Unit vector the hand points along, in the base frame."""
    return Rotation.from_quat(np.asarray(orientation, dtype=float)).as_matrix() @ FORWARD_AXIS


def elevation_deg(axis: np.ndarray) -> float:
    """How far above the horizontal a direction points, in degrees.

    Well behaved everywhere including straight up and straight down, unlike the pitch of a
    yaw-pitch-roll decomposition, which loses a degree of freedom exactly there — and
    "point the jaw at the table and pick something up" *is* straight down.
    """
    axis = np.asarray(axis, dtype=float)
    return math.degrees(math.atan2(float(axis[2]), float(math.hypot(axis[0], axis[1]))))


def twist_deg(delta: Rotation, axis: np.ndarray) -> float:
    """The component of ``delta`` that is a rotation about ``axis``, in degrees.

    This is the twist half of a swing-twist decomposition. It is used instead of reading a
    component out of a rotation vector, which is only an angle when the rotation happens to
    be about a single axis: for any compound hand motion the rotation-vector components
    cross-talk, so tilting the hand quietly rolls the jaw. Here, tilting contributes to the
    swing and is discarded, and only genuine twist survives.

    Degenerate when the hand has been turned a full half-turn about an axis perpendicular
    to ``axis`` — the twist is then genuinely undefined, and 0 is returned rather than an
    arbitrary large angle.
    """
    axis = np.asarray(axis, dtype=float)
    norm = float(np.linalg.norm(axis))
    if norm < 1e-9:
        return 0.0
    axis = axis / norm
    quaternion = np.asarray(delta.as_quat(), dtype=float)
    along = float(np.dot(quaternion[:3], axis))
    w = float(quaternion[3])
    if math.hypot(along, w) < 1e-6:
        return 0.0
    angle = math.degrees(2.0 * math.atan2(along, w))
    return (angle + 180.0) % 360.0 - 180.0


class HandOrientation:
    """Pitch and roll of the hand, measured as offsets from where it was at engage.

    Absolute mapping is wrong for this: it would snap the jaw to match the operator's hand
    the instant the clutch closed. Offsets from the engage pose mean engaging never moves
    the arm, and the operator can re-clutch to bring their hand back to a comfortable
    posture without the jaw following.
    """

    def __init__(self, orientation: np.ndarray):
        self._origin = Rotation.from_quat(np.asarray(orientation, dtype=float))
        self._origin_elevation = elevation_deg(forward_axis(orientation))

    def offsets(self, orientation: np.ndarray) -> tuple[float, float]:
        """``(pitch, roll)`` change since engage, in degrees."""
        axis = forward_axis(orientation)
        pitch = elevation_deg(axis) - self._origin_elevation
        delta = Rotation.from_quat(np.asarray(orientation, dtype=float)) * self._origin.inv()
        return pitch, twist_deg(delta, axis)
