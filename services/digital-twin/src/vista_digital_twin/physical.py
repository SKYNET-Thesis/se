"""Read-only bridge called by the process that already owns a LeLab follower."""

from dataclasses import dataclass
from datetime import datetime
from math import isfinite
from typing import Mapping

from .contracts import CalibrationStatus, JointReading, JointState, SO101_JOINTS, SourceMode


class TelemetryRejected(ValueError):
    pass


@dataclass(frozen=True)
class ScopedJointState:
    organization_id: str
    owner_id: str
    state: JointState


class LeLabFollowerTelemetryAdapter:
    """Translates an existing owner's get_observation() result without touching hardware."""

    def __init__(self, *, robot_id: str, organization_id: str, owner_id: str):
        if not all(isinstance(value, str) and value for value in (robot_id, organization_id, owner_id)):
            raise ValueError("robot, organization and owner identities are required")
        self.robot_id = robot_id
        self.organization_id = organization_id
        self.owner_id = owner_id
        self._sequence = 0
        self._last: JointState | None = None

    def from_lelab_observation(self, observation: Mapping[str, object], *, measured_at: datetime) -> JointState:
        readings: list[JointReading] = []
        for name in SO101_JOINTS:
            key = f"{name}.pos"
            value = observation.get(key)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not isfinite(value):
                raise TelemetryRejected(f"missing or invalid measured observation: {key}")
            if name == "gripper":
                if not 0 <= value <= 100:
                    raise TelemetryRejected("gripper percent is out of range")
                unit = "percent"
            else:
                # LeLab's SO101Follower is configured with use_degrees=True. This is raw
                # owner observation, not a claim that it equals the URDF joint frame.
                if not -180 <= value <= 180:
                    raise TelemetryRejected(f"raw motor observation out of range: {key}")
                unit = "deg"
            readings.append(JointReading(name=name, position=float(value), unit=unit))
        state = JointState(
            schema_version=1, robot_id=self.robot_id, source_mode=SourceMode.LIVE_PHYSICAL,
            controller_id=self.owner_id, measured_at=measured_at, sequence=self._sequence,
            connection="connected", measured=readings, calibration_status=CalibrationStatus.UNCALIBRATED,
        )
        self._sequence += 1
        self._last = state
        return state

    def disconnected(self, *, at: datetime) -> JointState:
        if self._last is None:
            raise TelemetryRejected("cannot disconnect before a measured observation")
        state = self._last.model_copy(update={"sequence": self._sequence, "connection": "disconnected"})
        self._sequence += 1
        self._last = state
        return state

    def scoped(self, state: JointState) -> ScopedJointState:
        if state.robot_id != self.robot_id or state.controller_id != self.owner_id or state.source_mode is not SourceMode.LIVE_PHYSICAL:
            raise TelemetryRejected("physical state identity mismatch")
        return ScopedJointState(organization_id=self.organization_id, owner_id=self.owner_id, state=state)
