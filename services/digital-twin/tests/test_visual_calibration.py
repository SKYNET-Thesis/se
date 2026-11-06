from datetime import datetime, timezone

import pytest

from vista_digital_twin.calibration import CalibrationProfile, CalibrationStatus, VisualCalibrationStore


def profile(status: str = "VERIFIED") -> CalibrationProfile:
    return CalibrationProfile.model_validate({
        "profile_version": "1", "robot_id": "robot-a", "follower_id": "follower-a",
        "status": status, "operator_confirmed_at": "2026-11-05T00:00:00Z",
        "evidence": [{"kind": "validation_capture", "reference": "capture-1", "recorded_at": "2026-11-05T00:00:00Z"}],
        "joints": [
            {"name": name, "source_unit": "percent" if name == "gripper" else "deg", "sign": 1,
             "zero_offset": 0, "source_min": 0 if name == "gripper" else -180,
             "source_max": 100 if name == "gripper" else 180,
             "target_min": -0.174533 if name == "gripper" else -3.14159,
             "target_max": 1.74533 if name == "gripper" else 3.14159,
             "conversion": "linear" if name == "gripper" else "angular"}
            for name in ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
        ],
    })


def test_verified_profile_transforms_six_measured_joints_without_mutating_raw_values():
    calibrated = profile().transform({
        "shoulder_pan": 90, "shoulder_lift": 0, "elbow_flex": 0,
        "wrist_flex": 0, "wrist_roll": 0, "gripper": 50,
    }, robot_id="robot-a", follower_id="follower-a")
    assert calibrated["shoulder_pan"] == pytest.approx(1.570796, abs=1e-5)
    assert calibrated["gripper"] == pytest.approx(0.7853985, abs=1e-5)


def test_profile_rejects_wrong_identity_unverified_or_out_of_limit_values():
    with pytest.raises(ValueError, match="identity"):
        profile().transform({}, robot_id="robot-b", follower_id="follower-a")
    with pytest.raises(ValueError, match="verified"):
        profile("DRAFT").transform({}, robot_id="robot-a", follower_id="follower-a")
    broken = profile().model_copy(deep=True)
    broken.joints[0].target_max = 0.1
    with pytest.raises(ValueError, match="limits"):
        broken.transform({"shoulder_pan": 90, "shoulder_lift": 0, "elbow_flex": 0, "wrist_flex": 0, "wrist_roll": 0, "gripper": 0}, robot_id="robot-a", follower_id="follower-a")


def test_store_writes_owner_only_active_profile_and_does_not_activate_draft(tmp_path):
    store = VisualCalibrationStore(tmp_path)
    store.save(profile())
    store.activate(robot_id="robot-a", follower_id="follower-a", profile_version="1")
    assert store.active(robot_id="robot-a", follower_id="follower-a").status is CalibrationStatus.VERIFIED
    assert (tmp_path / "robot-a" / "1.json").stat().st_mode & 0o077 == 0
    draft = profile("DRAFT").model_copy(update={"profile_version": "2"})
    store.save(draft)
    with pytest.raises(ValueError, match="verified"):
        store.activate(robot_id="robot-a", follower_id="follower-a", profile_version="2")
