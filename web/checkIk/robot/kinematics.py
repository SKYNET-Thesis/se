"""URDF-driven forward kinematics for an SO-101 arm.

All public joint angles are radians and Cartesian distances are metres.
This module deliberately has no LeRobot or hardware dependency.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np


JOINT_NAMES = (
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
)


@dataclass(frozen=True)
class Pose:
    position: np.ndarray
    rotation: np.ndarray

    @property
    def quaternion(self) -> np.ndarray:
        """Return rotation as [qx, qy, qz, qw]."""
        return rotation_matrix_to_quaternion(self.rotation)


@dataclass(frozen=True)
class _Joint:
    name: str
    kind: str
    parent: str
    child: str
    origin: np.ndarray
    axis: np.ndarray
    lower: float
    upper: float


def _values(text: str | None, size: int = 3) -> np.ndarray:
    if text is None:
        return np.zeros(size, dtype=float)
    values = np.fromstring(text, sep=" ", dtype=float)
    if values.size != size:
        raise ValueError(f"Expected {size} values, got {text!r}")
    return values


def _rpy_matrix(rpy: np.ndarray) -> np.ndarray:
    roll, pitch, yaw = rpy
    cr, sr = np.cos(roll), np.sin(roll)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cy, sy = np.cos(yaw), np.sin(yaw)
    rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]])
    rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    return rz @ ry @ rx


def _transform(xyz: np.ndarray, rpy: np.ndarray) -> np.ndarray:
    result = np.eye(4)
    result[:3, :3] = _rpy_matrix(rpy)
    result[:3, 3] = xyz
    return result


def _axis_rotation(axis: np.ndarray, angle: float) -> np.ndarray:
    axis = axis / np.linalg.norm(axis)
    x, y, z = axis
    c, s, one_c = np.cos(angle), np.sin(angle), 1.0 - np.cos(angle)
    rotation = np.array(
        [
            [c + x*x*one_c, x*y*one_c - z*s, x*z*one_c + y*s],
            [y*x*one_c + z*s, c + y*y*one_c, y*z*one_c - x*s],
            [z*x*one_c - y*s, z*y*one_c + x*s, c + z*z*one_c],
        ]
    )
    result = np.eye(4)
    result[:3, :3] = rotation
    return result


def rotation_matrix_to_quaternion(rotation: np.ndarray) -> np.ndarray:
    """Convert a 3x3 rotation matrix to [qx, qy, qz, qw]."""
    r = np.asarray(rotation, dtype=float)
    if r.shape != (3, 3):
        raise ValueError("rotation must have shape (3, 3)")
    # Eigenvector method is stable at rotations close to pi.
    k = np.array(
        [
            [r[0, 0]-r[1, 1]-r[2, 2], r[0, 1]+r[1, 0], r[0, 2]+r[2, 0], r[2, 1]-r[1, 2]],
            [r[0, 1]+r[1, 0], r[1, 1]-r[0, 0]-r[2, 2], r[1, 2]+r[2, 1], r[0, 2]-r[2, 0]],
            [r[0, 2]+r[2, 0], r[1, 2]+r[2, 1], r[2, 2]-r[0, 0]-r[1, 1], r[1, 0]-r[0, 1]],
            [r[2, 1]-r[1, 2], r[0, 2]-r[2, 0], r[1, 0]-r[0, 1], r.trace()],
        ]
    ) / 3.0
    values, vectors = np.linalg.eigh(k)
    q = vectors[:, np.argmax(values)]
    if q[3] < 0:
        q = -q
    return q / np.linalg.norm(q)


class SO101Kinematics:
    """Reusable, stateless kinematic model loaded from the supplied URDF."""

    joint_names = JOINT_NAMES

    def __init__(
        self,
        urdf_path: str | Path,
        base_frame: str = "base_link",
        end_effector_frame: str = "gripper_frame_link",
    ) -> None:
        self.urdf_path = Path(urdf_path)
        self.base_frame = base_frame
        self.end_effector_frame = end_effector_frame
        self._chain = self._load_chain()
        movable = [joint for joint in self._chain if joint.kind != "fixed"]
        names = tuple(joint.name for joint in movable)
        if names != self.joint_names:
            raise ValueError(f"Unexpected SO-101 joint order: {names}")
        self.lower_limits = np.array([joint.lower for joint in movable])
        self.upper_limits = np.array([joint.upper for joint in movable])

    def _load_chain(self) -> tuple[_Joint, ...]:
        root = ET.parse(self.urdf_path).getroot()
        by_child: dict[str, _Joint] = {}
        links = {link.attrib["name"] for link in root.findall("link")}
        if self.base_frame not in links or self.end_effector_frame not in links:
            raise ValueError("Configured base or end-effector frame is absent from URDF")
        for node in root.findall("joint"):
            origin = node.find("origin")
            xyz = _values(origin.get("xyz") if origin is not None else None)
            rpy = _values(origin.get("rpy") if origin is not None else None)
            axis_node = node.find("axis")
            axis = _values(axis_node.get("xyz") if axis_node is not None else "0 0 1")
            limit = node.find("limit")
            kind = node.attrib["type"]
            lower = float(limit.get("lower")) if limit is not None and kind != "fixed" else 0.0
            upper = float(limit.get("upper")) if limit is not None and kind != "fixed" else 0.0
            joint = _Joint(
                node.attrib["name"], kind, node.find("parent").get("link"),
                node.find("child").get("link"), _transform(xyz, rpy), axis, lower, upper,
            )
            by_child[joint.child] = joint
        reversed_chain: list[_Joint] = []
        link = self.end_effector_frame
        while link != self.base_frame:
            if link not in by_child:
                raise ValueError(f"No chain from {self.base_frame} to {self.end_effector_frame}")
            joint = by_child[link]
            reversed_chain.append(joint)
            link = joint.parent
        return tuple(reversed(reversed_chain))

    def forward_kinematics(self, q: np.ndarray | list[float]) -> Pose:
        q = np.asarray(q, dtype=float)
        if q.shape != (5,) or not np.all(np.isfinite(q)):
            raise ValueError("q must contain five finite joint angles in radians")
        transform = np.eye(4)
        index = 0
        for joint in self._chain:
            transform = transform @ joint.origin
            if joint.kind != "fixed":
                transform = transform @ _axis_rotation(joint.axis, q[index])
                index += 1
        return Pose(transform[:3, 3].copy(), transform[:3, :3].copy())

    def joint_dict(self, q: np.ndarray | list[float]) -> dict[str, float]:
        values = np.asarray(q, dtype=float)
        if values.shape != (5,):
            raise ValueError("q must contain five joint angles")
        return dict(zip(self.joint_names, map(float, values), strict=True))
