from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from vista_digital_twin.contracts import JointState


NAMES = (
    "shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"
)


def valid_payload():
    return {
        "schema_version": 1,
        "robot_id": "so101-left",
        "source_mode": "SIMULATION",
        "controller_id": "offline-fixture",
        "measured_at": datetime(2026, 11, 5, tzinfo=timezone.utc),
        "sequence": 0,
        "connection": "connected",
        "measured": [
            {"name": name, "position": 20 if name == "gripper" else 0.1,
             "unit": "percent" if name == "gripper" else "rad"}
            for name in NAMES
        ],
    }


def test_all_six_measured_joints_are_required():
    payload = valid_payload()
    payload["measured"].pop()
    with pytest.raises(ValidationError):
        JointState.model_validate(payload)


def test_duplicate_joints_are_rejected():
    payload = valid_payload()
    payload["measured"][-1] = payload["measured"][0]
    with pytest.raises(ValidationError):
        JointState.model_validate(payload)


@pytest.mark.parametrize("unit,position", [("meters", 0.1), ("percent", 10), ("rad", float("nan")), ("rad", float("inf"))])
def test_invalid_arm_joint_readings_are_rejected(unit, position):
    payload = valid_payload()
    payload["measured"][0] = {"name": "shoulder_pan", "position": position, "unit": unit}
    with pytest.raises(ValidationError):
        JointState.model_validate(payload)


@pytest.mark.parametrize("field,value", [
    ("source_mode", "LEARNING_PREVIEW"),
    ("source_mode", "physical"),
    ("sequence", -1),
    ("measured_at", "not-a-date"),
    ("measured_at", datetime(2026, 11, 5)),
    ("schema_version", 2),
])
def test_invalid_envelope_is_rejected(field, value):
    payload = valid_payload()
    payload[field] = value
    with pytest.raises(ValidationError):
        JointState.model_validate(payload)


def test_commanded_positions_never_replace_measured_positions():
    payload = valid_payload()
    payload["commanded"] = [
        {**joint, "position": 0.9} for joint in payload["measured"]
    ]
    state = JointState.model_validate(payload)
    assert state.measured[0].position == 0.1
    assert state.commanded[0].position == 0.9


def test_live_physical_and_replay_are_valid_but_distinct():
    payload = valid_payload()
    payload["source_mode"] = "LIVE_PHYSICAL"
    payload["calibration_status"] = "UNCALIBRATED"
    live = JointState.model_validate(payload)
    payload["source_mode"] = "REPLAY"
    replay = JointState.model_validate(payload)
    assert live.source_mode != replay.source_mode


def test_physical_state_must_declare_calibration_status():
    payload = valid_payload()
    payload["source_mode"] = "LIVE_PHYSICAL"
    with pytest.raises(ValidationError):
        JointState.model_validate(payload)
