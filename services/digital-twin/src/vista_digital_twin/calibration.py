"""Owner-only visual calibration profiles; separate from LeRobot motor calibration."""

import json
import math
import os
from enum import Enum
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .contracts import SO101_JOINTS


class CalibrationStatus(str, Enum):
    DRAFT = "DRAFT"
    VERIFIED = "VERIFIED"


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
        if not all(math.isfinite(value) for value in (self.zero_offset, self.source_min, self.source_max, self.target_min, self.target_max)):
            raise ValueError("calibration values must be finite")
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
    profile_version: str = Field(min_length=1, pattern=r"^[A-Za-z0-9._-]+$")
    robot_id: str = Field(min_length=1)
    follower_id: str = Field(min_length=1)
    status: CalibrationStatus = CalibrationStatus.DRAFT
    lelab_calibration_reference: str | None = None
    operator_confirmed_at: str | None = None
    evidence: list[CalibrationEvidence] = Field(default_factory=list)
    joints: list[JointCalibration]

    @model_validator(mode="after")
    def validate_all_joints(self):
        if len(self.joints) != len(SO101_JOINTS) or {joint.name for joint in self.joints} != set(SO101_JOINTS):
            raise ValueError("calibration profile must cover every SO-101 joint exactly once")
        if self.status is CalibrationStatus.VERIFIED and (not self.evidence or not self.operator_confirmed_at):
            raise ValueError("verified profile requires evidence and operator confirmation")
        return self

    def transform(self, measured: dict[str, float], *, robot_id: str, follower_id: str) -> dict[str, float]:
        if self.status is not CalibrationStatus.VERIFIED:
            raise ValueError("visual calibration profile is not verified")
        if (robot_id, follower_id) != (self.robot_id, self.follower_id):
            raise ValueError("visual calibration identity mismatch")
        output: dict[str, float] = {}
        for joint in self.joints:
            raw = measured.get(joint.name)
            if not isinstance(raw, (int, float)) or isinstance(raw, bool) or not math.isfinite(raw):
                raise ValueError(f"missing or invalid measured joint: {joint.name}")
            if raw < joint.source_min or raw > joint.source_max:
                raise ValueError(f"measured joint exceeds profile range: {joint.name}")
            if joint.conversion == "angular":
                radians = math.radians(raw) if joint.source_unit == "deg" else raw
                value = joint.sign * radians + joint.zero_offset
            else:
                normalized = (raw - joint.source_min) / (joint.source_max - joint.source_min)
                value = joint.sign * (joint.target_min + normalized * (joint.target_max - joint.target_min)) + joint.zero_offset
            if not math.isfinite(value) or value < joint.target_min or value > joint.target_max:
                raise ValueError(f"calibrated joint exceeds target limits: {joint.name}")
            output[joint.name] = value
        return output


class VisualCalibrationStore:
    def __init__(self, root: Path | str | None = None):
        self.root = Path(root or Path.home() / ".local/state/vista/calibration")

    def _path(self, robot_id: str, version: str) -> Path:
        if not robot_id or "/" in robot_id or ".." in robot_id:
            raise ValueError("invalid robot identity")
        return self.root / robot_id / f"{version}.json"

    def save(self, profile: CalibrationProfile) -> Path:
        path = self._path(profile.robot_id, profile.profile_version)
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(path.parent, 0o700)
        if path.exists() and CalibrationProfile.model_validate_json(path.read_text()).status is CalibrationStatus.VERIFIED:
            raise ValueError("cannot overwrite a verified profile")
        self._atomic_write(path, profile.model_dump_json(indent=2))
        return path

    def load(self, *, robot_id: str, profile_version: str) -> CalibrationProfile:
        return CalibrationProfile.model_validate_json(self._path(robot_id, profile_version).read_text())

    def activate(self, *, robot_id: str, follower_id: str, profile_version: str) -> None:
        profile = self.load(robot_id=robot_id, profile_version=profile_version)
        if profile.status is not CalibrationStatus.VERIFIED:
            raise ValueError("only a verified profile can be activated")
        if profile.follower_id != follower_id:
            raise ValueError("visual calibration identity mismatch")
        self._atomic_write(self.root / robot_id / "active.json", profile.model_dump_json(indent=2))

    def active(self, *, robot_id: str, follower_id: str) -> CalibrationProfile:
        profile = CalibrationProfile.model_validate_json((self.root / robot_id / "active.json").read_text())
        if profile.status is not CalibrationStatus.VERIFIED or profile.follower_id != follower_id:
            raise ValueError("active visual calibration identity mismatch")
        return profile

    def _atomic_write(self, path: Path, contents: str) -> None:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as output:
            os.chmod(output.name, 0o600)
            output.write(contents)
            output.flush()
            os.fsync(output.fileno())
            temp = Path(output.name)
        os.replace(temp, path)
        os.chmod(path, 0o600)
