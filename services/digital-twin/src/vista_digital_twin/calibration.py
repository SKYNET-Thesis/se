"""Evidence-bearing calibration readiness contract; it never supplies defaults."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .contracts import SO101_JOINTS


class CalibrationEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["calibration_record", "validation_capture", "operator_attestation"]
    reference: str = Field(min_length=1)
    recorded_at: str = Field(min_length=1)


class JointCalibration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Literal["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]
    source_unit: Literal["deg", "rad", "percent"]
    sign: Literal[-1, 1]
    zero_offset: float
    source_min: float
    source_max: float
    target_min: float
    target_max: float
    conversion: Literal["angular", "linear"]

    @model_validator(mode="after")
    def validate_ranges_and_unit(self):
        if self.source_min >= self.source_max or self.target_min >= self.target_max:
            raise ValueError("calibration ranges must be increasing")
        if self.name == "gripper":
            if self.source_unit != "percent" or self.conversion != "linear":
                raise ValueError("gripper requires an approved percent-to-jaw linear conversion")
        elif self.source_unit == "percent" or self.conversion != "angular":
            raise ValueError("arm joints require an angular conversion")
        return self


class CalibrationProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile_version: str = Field(min_length=1)
    robot_id: str = Field(min_length=1)
    evidence: list[CalibrationEvidence] = Field(min_length=1)
    joints: list[JointCalibration]

    @model_validator(mode="after")
    def validate_all_joints(self):
        if len(self.joints) != len(SO101_JOINTS) or {joint.name for joint in self.joints} != set(SO101_JOINTS):
            raise ValueError("calibration profile must cover every SO-101 joint exactly once")
        return self
