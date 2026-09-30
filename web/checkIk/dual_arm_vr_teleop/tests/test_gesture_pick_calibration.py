"""Planar mapping, camera binding and explicit offline calibration workflow."""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

IMAGE_POINTS = [[0, 0], [100, 0], [100, 100], [0, 100]]
ROBOT_POINTS = [[0, 0], [1, 0], [1, 1], [0, 1]]


def make_calibration(**changes):
    from backend.gesture_pick.calibration import TableCalibration

    values = dict(image_points=IMAGE_POINTS, robot_points=ROBOT_POINTS,
                  camera_path="/dev/video-test")
    values.update(changes)
    return TableCalibration.from_points(**values)


def test_homography_maps_table_corners_and_rejects_outside_points():
    calibration = make_calibration()
    assert np.allclose(calibration.image_to_robot_table((50, 50)), [0.5, 0.5, 0])
    for image_point, robot_point in zip(IMAGE_POINTS, ROBOT_POINTS):
        assert np.allclose(calibration.image_to_robot_table(image_point), [*robot_point, 0])
    with pytest.raises(ValueError, match="outside"):
        calibration.image_to_robot_table((101, 50))


@pytest.mark.parametrize("point", [
    (-0.000001, 50), (100.000001, 50), (50, -0.000001), (50, 100.000001),
])
def test_points_immediately_outside_each_image_boundary_are_rejected(point):
    with pytest.raises(ValueError, match="outside"):
        make_calibration().image_to_robot_table(point)


@pytest.mark.parametrize("point", [
    (-0.00000001, 0.5, 0), (1.00000001, 0.5, 0),
    (0.5, -0.00000001, 0), (0.5, 1.00000001, 0),
])
def test_points_immediately_outside_robot_footprint_are_rejected(point):
    assert not make_calibration().contains_robot_point(point)


def test_projective_mapping_and_robot_table_height():
    calibration = make_calibration(
        image_points=[[0, 0], [100, 0], [80, 100], [20, 100]], table_z=0.12,
    )
    # The trapezoid's diagonal intersection is the square's centre.
    assert np.allclose(calibration.image_to_robot_table((50, 62.5)), [0.5, 0.5, 0.12])
    assert calibration.contains_robot_point((0.5, 0.5, 0.12))
    assert not calibration.contains_robot_point((1.01, 0.5, 0.12))


@pytest.mark.parametrize("changes", [
    {"image_points": [[0, 0], [1, 1], [2, 2], [3, 3]]},
    {"image_points": [[0, 0], [100, 100], [100, 0], [0, 100]]},
    {"robot_points": [[0, 0], [1, 0], [1, 0], [0, 1]]},
    {"image_points": [[0, 0], [1, 0], [1, 1]]},
    {"robot_points": [[0, 0], [1, 0], [1, float("nan")], [0, 1]]},
    {"table_z": float("inf")},
])
def test_invalid_or_unordered_reference_points_are_rejected(changes):
    with pytest.raises(ValueError):
        make_calibration(**changes)


@pytest.mark.parametrize("point", [(float("nan"), 50), (50, float("inf")), (50,), (50, 50, 0)])
def test_invalid_image_point_is_rejected(point):
    with pytest.raises(ValueError):
        make_calibration().image_to_robot_table(point)


def test_saved_calibration_has_stable_identity_and_camera_binding(tmp_path):
    from backend.gesture_pick.calibration import TableCalibration

    calibration = make_calibration(table_z=0.12)
    path = tmp_path / "runtime" / "calibration.json"
    calibration.save(path)
    restored = TableCalibration.load(path, camera_path="/dev/video-test")
    assert restored.calibration_id == calibration.calibration_id
    assert np.allclose(restored.image_to_robot_table((50, 50)), [0.5, 0.5, 0.12])
    assert make_calibration(camera_path="/dev/other", table_z=0.12).calibration_id != calibration.calibration_id
    assert make_calibration(table_z=0.2).calibration_id != calibration.calibration_id
    assert make_calibration(
        image_points=[[1, 0], [100, 0], [100, 100], [0, 100]], table_z=0.12,
    ).calibration_id != calibration.calibration_id
    with pytest.raises(ValueError, match="camera"):
        TableCalibration.load(path, camera_path="/dev/other")
    data = json.loads(path.read_text())
    data["version"] = 99
    path.write_text(json.dumps(data))
    with pytest.raises(ValueError, match="version"):
        TableCalibration.load(path, camera_path="/dev/video-test")


def test_calibration_cli_saves_supplied_points_without_opening_hardware(tmp_path):
    path = tmp_path / "runtime" / "calibration.json"
    result = subprocess.run([
        sys.executable, "-m", "backend.gesture_pick.calibrate_overhead_camera",
        "--camera-path", "/dev/nonexistent-camera",
        "--image-points", json.dumps(IMAGE_POINTS),
        "--robot-points", json.dumps(ROBOT_POINTS), "--table-z", "0.12",
        "--output", str(path),
    ], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    from backend.gesture_pick.calibration import TableCalibration

    calibration = TableCalibration.load(path, camera_path="/dev/nonexistent-camera")
    assert np.allclose(calibration.image_to_robot_table((50, 50)), [0.5, 0.5, 0.12])
