from datetime import datetime, timezone

import pytest

from vista_digital_twin.physical import LeLabFollowerTelemetryAdapter, TelemetryRejected


AT = datetime(2026, 11, 5, tzinfo=timezone.utc)
OBSERVATION = {
    "shoulder_pan.pos": 10.0,
    "shoulder_lift.pos": -20.0,
    "elbow_flex.pos": 30.0,
    "wrist_flex.pos": -10.0,
    "wrist_roll.pos": 5.0,
    "gripper.pos": 40.0,
}


def adapter() -> LeLabFollowerTelemetryAdapter:
    return LeLabFollowerTelemetryAdapter(
        robot_id="so101-left", organization_id="org-a", owner_id="lelab-teleop-a"
    )


def test_owner_observation_becomes_six_read_only_physical_measurements():
    state = adapter().from_lelab_observation(OBSERVATION, measured_at=AT)
    assert state.source_mode.value == "LIVE_PHYSICAL"
    assert state.robot_id == "so101-left"
    assert state.controller_id == "lelab-teleop-a"
    assert state.sequence == 0
    assert state.calibration_status == "UNCALIBRATED"
    assert [(joint.name, joint.position, joint.unit) for joint in state.measured] == [
        ("shoulder_pan", 10.0, "deg"),
        ("shoulder_lift", -20.0, "deg"),
        ("elbow_flex", 30.0, "deg"),
        ("wrist_flex", -10.0, "deg"),
        ("wrist_roll", 5.0, "deg"),
        ("gripper", 40.0, "percent"),
    ]


def test_missing_invalid_or_commanded_observations_are_rejected_not_zero_filled():
    for invalid in (
        {key: value for key, value in OBSERVATION.items() if key != "elbow_flex.pos"},
        OBSERVATION | {"wrist_roll.pos": float("nan")},
        {key.replace(".pos", ".goal_position"): value for key, value in OBSERVATION.items()},
    ):
        with pytest.raises(TelemetryRejected):
            adapter().from_lelab_observation(invalid, measured_at=AT)


def test_adapter_never_opens_or_owns_follower_hardware():
    source = adapter()
    assert not hasattr(source, "connect")
    assert not hasattr(source, "send_action")
    assert not hasattr(source, "follower")


def test_sequence_advances_and_disconnect_preserves_last_measurement():
    source = adapter()
    first = source.from_lelab_observation(OBSERVATION, measured_at=AT)
    disconnected = source.disconnected(at=AT.replace(second=1))
    assert disconnected.sequence == first.sequence + 1
    assert disconnected.connection == "disconnected"
    assert disconnected.measured == first.measured
    assert disconnected.measured_at == first.measured_at
