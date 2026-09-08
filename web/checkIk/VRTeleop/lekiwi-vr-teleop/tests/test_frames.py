"""The VR->base change of basis is the one place a sign error becomes a moving robot."""

import numpy as np

from lekiwi_vr_teleop.frames import VR_TO_BASE, position_to_base, quaternion_to_base


def test_axis_convention():
    # WebXR forward is -Z; the arm base calls that +X.
    assert np.allclose(position_to_base([0, 0, -1]), [1, 0, 0])
    # WebXR up is +Y; the base calls that +Z.
    assert np.allclose(position_to_base([0, 1, 0]), [0, 0, 1])
    # WebXR right is +X; the base has +Y pointing left, so right is -Y.
    assert np.allclose(position_to_base([1, 0, 0]), [0, -1, 0])


def test_is_a_proper_rotation():
    # det = +1 (not -1): the transform must not mirror, or every rotation would invert.
    assert np.isclose(np.linalg.det(VR_TO_BASE), 1.0)
    assert np.allclose(VR_TO_BASE @ VR_TO_BASE.T, np.eye(3))


def test_identity_orientation_is_preserved():
    assert np.allclose(quaternion_to_base([0, 0, 0, 1]), [0, 0, 0, 1])


def test_yaw_in_vr_becomes_yaw_about_base_z():
    # A quarter turn about the VR up axis (+Y) must come out as a quarter turn about the
    # base up axis (+Z), same handedness.
    half = np.sqrt(0.5)
    quat = quaternion_to_base([0, half, 0, half])
    assert np.allclose(np.abs(quat), [0, 0, half, half], atol=1e-6)
    # Sign check via the action on a vector: rotating base +X by this must give base +Y.
    from lerobot.utils.rotation import Rotation

    rotated = Rotation.from_quat(quat).as_matrix() @ np.array([1.0, 0.0, 0.0])
    assert np.allclose(rotated, [0, 1, 0], atol=1e-6)
