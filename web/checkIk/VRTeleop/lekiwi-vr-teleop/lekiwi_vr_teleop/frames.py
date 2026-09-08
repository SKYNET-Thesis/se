"""Conversion from the WebXR reference frame to the arm base frame.

WebXR ``local-floor`` is a right-handed frame with +X right, +Y up and -Z forward (away
from the operator). The SO-101 base frame is +X forward, +Y left, +Z up. The change of
basis below maps one onto the other; it is a proper rotation (det = +1), so it carries
orientations as a similarity transform without mirroring them.
"""

from __future__ import annotations

import numpy as np

from lerobot.utils.rotation import Rotation

# v_base = VR_TO_BASE @ v_vr
VR_TO_BASE = np.array(
    [
        [0.0, 0.0, -1.0],  # base X (forward)  <-  -Z (VR forward)
        [-1.0, 0.0, 0.0],  # base Y (left)     <-  -X (VR right)
        [0.0, 1.0, 0.0],  # base Z (up)       <-  +Y (VR up)
    ]
)


def position_to_base(pos_vr: np.ndarray) -> np.ndarray:
    """Rotate a WebXR position [m] into the arm base frame."""
    return VR_TO_BASE @ np.asarray(pos_vr, dtype=float)


def quaternion_to_base(quat_vr_xyzw: np.ndarray) -> np.ndarray:
    """Rotate a WebXR orientation quaternion (xyzw) into the arm base frame."""
    rot_vr = Rotation.from_quat(np.asarray(quat_vr_xyzw, dtype=float)).as_matrix()
    return Rotation.from_matrix(VR_TO_BASE @ rot_vr @ VR_TO_BASE.T).as_quat()


def pose_to_base(pos_vr: np.ndarray, quat_vr_xyzw: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Rotate a full WebXR pose into the arm base frame, returning ``(pos, quat_xyzw)``.

    Only the axis convention is applied — no translation. The clutch works on deltas from
    an engage origin, so the absolute WebXR origin (where the operator happened to stand
    when the session started) never reaches the robot.
    """
    return position_to_base(pos_vr), quaternion_to_base(quat_vr_xyzw)
