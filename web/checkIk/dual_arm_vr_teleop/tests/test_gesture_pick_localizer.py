"""Real OpenCV marker frames exercise classification, bounds and freshness."""

import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.gesture_pick import GesturePickConfig


def marker_frame(dictionary_name="DICT_APRILTAG_36h11", ids=(7, 8, 9)):
    dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, dictionary_name))
    frame = np.full((200, 600), 255, dtype=np.uint8)
    for index, tag_id in enumerate(ids):
        marker = cv2.aruco.generateImageMarker(dictionary, tag_id, 100)
        frame[50:150, index * 200 + 50:index * 200 + 150] = marker
    return frame


def make_localizer(dictionary="DICT_APRILTAG_36h11", now=10.0, table_right=600, clock=None):
    from backend.gesture_pick.calibration import TableCalibration
    from backend.gesture_pick.localizer import AprilTagLocalizer

    config = GesturePickConfig(camera_path="/dev/video-test", tags={7: "object", 8: "box"},
                               follower_side="right", tag_dictionary=dictionary, max_tag_age_s=0.5)
    calibration = TableCalibration.from_points(
        image_points=[[0, 0], [table_right, 0], [table_right, 200], [0, 200]],
        robot_points=[[0, 0], [table_right / 1000, 0], [table_right / 1000, 0.2], [0, 0.2]],
        camera_path=config.camera_path, table_z=0.12,
    )
    return AprilTagLocalizer(config, calibration, clock=clock or (lambda: now))


def test_localizer_maps_only_known_ids_to_robot_table():
    tags = make_localizer().detect(marker_frame(), observed_at=10.0)
    assert sorted(item.tag_id for item in tags) == [7, 8]
    by_id = {item.tag_id: item for item in tags}
    assert by_id[7].kind == "object"
    assert by_id[8].kind == "box"
    assert np.allclose(by_id[7].image_center, [99.5, 99.5], atol=0.5)
    assert np.allclose(by_id[7].robot_point, [0.0995, 0.0995, 0.12], atol=0.0005)
    assert all(item.visible and item.observed_at == 10.0 for item in tags)


def test_localizer_ignores_unknown_and_outside_tags():
    assert [item.tag_id for item in make_localizer(table_right=200).detect(
        marker_frame(), observed_at=10.0)] == [7]


@pytest.mark.parametrize("observed_at", [9.49, 10.01, -1.0, float("nan"), float("inf")])
def test_localizer_rejects_stale_future_or_invalid_observation_time(observed_at):
    assert make_localizer().detect(marker_frame(), observed_at=observed_at) == []


def test_freshness_boundary_is_inclusive():
    assert len(make_localizer().detect(marker_frame(), observed_at=9.5)) == 2


def test_localizer_rejects_frame_that_expires_during_real_detection(monkeypatch):
    current_time = [10.0]
    localizer = make_localizer(clock=lambda: current_time[0])
    real_detector = localizer._detector

    def detect_and_advance_clock(frame):
        result = real_detector.detectMarkers(frame)
        current_time[0] = 10.1
        return result

    # Keep actual OpenCV image processing; wrap only its elapsed-time boundary.
    monkeypatch.setattr(localizer, "_detector", SimpleNamespace(detectMarkers=detect_and_advance_clock))
    assert localizer.detect(marker_frame(), observed_at=9.5) == []


def test_localizer_uses_configured_dictionary_and_does_not_retain_lost_tags():
    localizer = make_localizer(dictionary="DICT_APRILTAG_16h5")
    frame = marker_frame("DICT_APRILTAG_16h5")
    assert sorted(item.tag_id for item in localizer.detect(
        cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR), observed_at=10.0)) == [7, 8]
    assert localizer.detect(np.full_like(frame, 255), observed_at=10.0) == []
    assert localizer.detect(None, observed_at=10.0) == []


def test_localizer_rejects_calibration_for_another_camera():
    from backend.gesture_pick.calibration import TableCalibration
    from backend.gesture_pick.localizer import AprilTagLocalizer

    calibration = TableCalibration.from_points(
        image_points=[[0, 0], [100, 0], [100, 100], [0, 100]],
        robot_points=[[0, 0], [1, 0], [1, 1], [0, 1]], camera_path="/dev/other",
    )
    config = GesturePickConfig(camera_path="/dev/video-test", tags={7: "object", 8: "box"},
                               follower_side="right")
    with pytest.raises(ValueError, match="camera"):
        AprilTagLocalizer(config, calibration)
