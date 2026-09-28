"""Fixed-camera homography into a horizontal robot-base table plane.

Supply matching corners in perimeter order, in pixels and robot-base metres.
Lens distortion must be negligible or corrected upstream. This module does not
estimate intrinsics, open a camera, or command a follower.
"""

from dataclasses import dataclass, field
from hashlib import sha256
import json
from pathlib import Path

import cv2
import numpy as np


def _corners(points, label):
    points = np.asarray(points, dtype=np.float64)
    if points.shape != (4, 2) or not np.isfinite(points).all():
        raise ValueError(f"{label} must contain four finite 2D corners")
    edges = np.roll(points, -1, axis=0) - points
    following = np.roll(edges, -1, axis=0)
    cross = edges[:, 0] * following[:, 1] - edges[:, 1] * following[:, 0]
    if not (np.all(cross > 0) or np.all(cross < 0)):
        raise ValueError(f"{label} must form a nondegenerate convex polygon in perimeter order")
    return points


def _inside(point, corners):
    # Zero geometric tolerance: include the boundary, but never expand the
    # footprint with an epsilon. Preserve float64 inputs instead of rounding
    # near-boundary outside points onto the polygon through float32 conversion.
    corners = np.asarray(corners, dtype=np.float64)
    edges = np.roll(corners, -1, axis=0) - corners
    offsets = np.asarray(point, dtype=np.float64) - corners
    cross = edges[:, 0] * offsets[:, 1] - edges[:, 1] * offsets[:, 0]
    return bool(np.all(cross >= 0) or np.all(cross <= 0))


@dataclass(frozen=True)
class TableCalibration:
    camera_path: str
    image_points: tuple[tuple[float, float], ...]
    robot_points: tuple[tuple[float, float], ...]
    table_z: float
    _homography: np.ndarray = field(repr=False, compare=False)

    @classmethod
    def from_points(cls, image_points, robot_points, camera_path="", table_z=0.0):
        image = _corners(image_points, "image_points")
        robot = _corners(robot_points, "robot_points")
        if not isinstance(camera_path, str):
            raise ValueError("camera_path must be a string")
        if not np.isfinite(table_z):
            raise ValueError("table_z must be finite")
        homography = cv2.getPerspectiveTransform(image.astype(np.float32), robot.astype(np.float32))
        if not np.isfinite(homography).all() or np.linalg.matrix_rank(homography) != 3:
            raise ValueError("reference points produce a singular homography")
        homography.setflags(write=False)
        return cls(camera_path, tuple(map(tuple, image)), tuple(map(tuple, robot)),
                   float(table_z), homography)

    def _data(self):
        return {"version": 1, "camera_path": self.camera_path,
                "image_points": self.image_points, "robot_points": self.robot_points,
                "table_z": self.table_z}

    @property
    def calibration_id(self) -> str:
        """Content identity, including camera binding; independent of file path."""
        canonical = json.dumps(self._data(), sort_keys=True, separators=(",", ":"), allow_nan=False)
        return sha256(canonical.encode("utf-8")).hexdigest()

    def image_to_robot_table(self, image_point) -> np.ndarray:
        point = np.asarray(image_point, dtype=np.float64)
        if point.shape != (2,) or not np.isfinite(point).all():
            raise ValueError("image point must contain two finite coordinates")
        if not _inside(point, self.image_points):
            raise ValueError("image point is outside calibrated table")
        mapped = self._homography @ np.array([*point, 1.0])
        if not np.isfinite(mapped).all() or abs(mapped[2]) < np.finfo(float).eps:
            raise ValueError("image point cannot be mapped to table")
        return np.array([mapped[0] / mapped[2], mapped[1] / mapped[2], self.table_z])

    def contains_robot_point(self, robot_point) -> bool:
        """Check the XY table footprint, including targets above the table."""
        point = np.asarray(robot_point, dtype=np.float64)
        return (point.shape in {(2,), (3,)} and bool(np.isfinite(point).all())
                and _inside(point[:2], self.robot_points))

    def save(self, path: str | Path) -> None:
        path = Path(path)
        if not self.camera_path.strip():
            raise ValueError("saving calibration requires an explicit camera path")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self._data(), indent=2, allow_nan=False) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path, *, camera_path: str):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if data.get("version") != 1:
            raise ValueError("unsupported calibration version")
        if not camera_path.strip() or data.get("camera_path") != camera_path:
            raise ValueError("calibration camera does not match configured camera")
        return cls.from_points(data["image_points"], data["robot_points"],
                               camera_path=camera_path, table_z=data["table_z"])
