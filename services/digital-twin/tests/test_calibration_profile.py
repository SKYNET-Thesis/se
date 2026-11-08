import pytest

from vista_digital_twin.calibration import CalibrationProfile


def test_calibration_profile_requires_complete_robot_specific_evidence_and_gripper_conversion():
    with pytest.raises(ValueError):
        CalibrationProfile.model_validate({
            "profile_version": "so101-v1",
            "robot_id": "so101-a",
            "evidence": [],
            "joints": [],
        })
