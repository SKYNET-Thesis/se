"""One-way AWS IoT telemetry conversion for the existing physical Twin owner."""
from __future__ import annotations
from datetime import datetime
from typing import Any
from .contracts import SO101_JOINTS
from .physical import LeLabFollowerTelemetryAdapter, TelemetryRejected

def ingest_iot_telemetry(owner: LeLabFollowerTelemetryAdapter, envelope: dict[str, Any], *, measured_at: datetime):
    """Convert the edge's fake/physical telemetry envelope; never emits commands."""
    if envelope.get("schemaVersion") != 1 or envelope.get("kind") != "telemetry" or envelope.get("robotId") != owner.robot_id:
        raise TelemetryRejected("iot telemetry identity mismatch")
    joints = envelope.get("jointState")
    if not isinstance(joints, dict): raise TelemetryRejected("iot telemetry joints missing")
    observation = {f"{name}.pos": joints.get(name) for name in SO101_JOINTS}
    return owner.from_lelab_observation(observation, measured_at=measured_at)
