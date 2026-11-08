from datetime import datetime, timezone
import pytest
from vista_digital_twin.iot_telemetry import ingest_iot_telemetry
from vista_digital_twin.physical import LeLabFollowerTelemetryAdapter, TelemetryRejected

def test_iot_telemetry_is_one_way_and_requires_configured_robot_identity():
    owner = LeLabFollowerTelemetryAdapter(robot_id="so101-001", organization_id="org", owner_id="edge")
    value = {"schemaVersion": 1, "kind": "telemetry", "robotId": "so101-001", "jointState": {"shoulder_pan": 0, "shoulder_lift": 0, "elbow_flex": 0, "wrist_flex": 0, "wrist_roll": 0, "gripper": 0}}
    state = ingest_iot_telemetry(owner, value, measured_at=datetime.now(timezone.utc))
    assert state.source_mode.value == "LIVE_PHYSICAL"
    with pytest.raises(TelemetryRejected): ingest_iot_telemetry(owner, value | {"robotId": "other"}, measured_at=datetime.now(timezone.utc))
