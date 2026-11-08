"""Versioned joint telemetry contract; rendering and control are separate concerns."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SO101_JOINTS = (
    "shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"
)
JointName = Literal[
    "shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"
]


class SourceMode(str, Enum):
    LIVE_PHYSICAL = "LIVE_PHYSICAL"
    SIMULATION = "SIMULATION"
    REPLAY = "REPLAY"


class CalibrationStatus(str, Enum):
    NOT_APPLICABLE = "NOT_APPLICABLE"
    UNCALIBRATED = "UNCALIBRATED"
    VERIFIED = "VERIFIED"


class JointReading(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: JointName
    position: float = Field(allow_inf_nan=False)
    unit: Literal["rad", "deg", "percent"]

    @model_validator(mode="after")
    def check_unit(self):
        if self.name != "gripper" and self.unit == "percent":
            raise ValueError("arm joints require angular units")
        return self


class JointState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    robot_id: str = Field(min_length=1)
    source_mode: SourceMode
    controller_id: str = Field(min_length=1)
    measured_at: datetime
    sequence: int = Field(ge=0)
    connection: Literal["connected", "disconnected", "stale"]
    measured: list[JointReading]
    calibrated: list[JointReading] | None = None
    commanded: list[JointReading] | None = None
    calibration_status: CalibrationStatus = CalibrationStatus.NOT_APPLICABLE

    @field_validator("measured_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("measured_at must include a timezone")
        return value

    @model_validator(mode="after")
    def check_joint_sets(self):
        if self.source_mode is SourceMode.LIVE_PHYSICAL and self.calibration_status is CalibrationStatus.NOT_APPLICABLE:
            raise ValueError("physical telemetry requires an explicit calibration status")
        for label, readings in (("measured", self.measured), ("calibrated", self.calibrated), ("commanded", self.commanded)):
            if readings is None:
                continue
            names = [reading.name for reading in readings]
            if len(names) != len(SO101_JOINTS) or set(names) != set(SO101_JOINTS):
                raise ValueError(f"{label} must contain every SO-101 joint exactly once")
        return self
