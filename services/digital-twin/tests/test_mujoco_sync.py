from datetime import datetime, timezone
from pathlib import Path

import pytest

from vista_digital_twin.contracts import JointState
from vista_digital_twin.mujoco_sync import synchronize_simulation_state


MODEL = Path("/home/quangduc/Code/vista/mujoco-menagerie-reference/robotstudio_so101/so101.xml")


def state(source_mode="SIMULATION"):
    payload = {
        "schema_version": 1, "robot_id": "so101-sim", "source_mode": source_mode,
        "controller_id": "offline-fixture", "measured_at": datetime.now(timezone.utc),
        "sequence": 0, "connection": "connected", "measured": [
            {"name": name, "position": 25 if name == "gripper" else 0.1,
             "unit": "percent" if name == "gripper" else "rad"}
            for name in ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")
        ],
    }
    if source_mode == "LIVE_PHYSICAL":
        payload["calibration_status"] = "UNCALIBRATED"
    return JointState.model_validate(payload)


def test_so101_simulation_joints_map_to_mujoco_and_gripper_percent_is_not_guessed():
    pytest.importorskip("mujoco")
    result = synchronize_simulation_state(state(), MODEL)
    assert result["sourceMode"] == "SIMULATION"
    assert set(result["applied"]) == {"shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll"}
    assert result["applied"]["shoulder_pan"] == pytest.approx(0.1)


def test_mujoco_sync_rejects_live_physical_state():
    pytest.importorskip("mujoco")
    with pytest.raises(ValueError, match="SIMULATION"):
        synchronize_simulation_state(state("LIVE_PHYSICAL"), MODEL)
