"""Phone Teleop input adapter for the existing LeKiwi control loop."""

from __future__ import annotations

import json
import math
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from lerobot.utils.rotation import Rotation


PROTOCOL_VERSION = 1


class _Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocolVersion: Literal[PROTOCOL_VERSION]


class PhoneHello(_Message):
    type: Literal["hello"]
    platform: Literal["android", "ios"]
    sessionId: str = Field(min_length=1, max_length=128)
    arm: Literal["left", "right"] = "right"


class Vector3(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float
    z: float

    @field_validator("x", "y", "z")
    @classmethod
    def finite(cls, value: float) -> float:
        if not math.isfinite(value) or abs(value) > 2.0:
            raise ValueError("phone position must be finite and within 2 m")
        return value


class Quaternion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float
    z: float
    w: float


class PhonePose(_Message):
    type: Literal["phone_pose"]
    platform: Literal["android", "ios"]
    sessionId: str = Field(min_length=1, max_length=128)
    sequence: int = Field(ge=0)
    timestampNs: int = Field(gt=0)
    trackingState: Literal["tracking", "limited", "lost"]
    enabled: bool
    fineMode: bool
    position: Vector3
    quaternion: Quaternion
    gripperVelocity: float = Field(ge=-1.0, le=1.0)


class PhoneDisable(_Message):
    type: Literal["control_disabled"]
    reason: str = Field(min_length=1, max_length=128)


class PhoneRecenter(_Message):
    type: Literal["recenter"]


def parse_phone_message(raw: str) -> PhoneHello | PhonePose | PhoneDisable | PhoneRecenter:
    if len(raw.encode("utf-8")) > 16_384:
        raise ValueError("phone message exceeds 16 KiB")
    try:
        payload: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("phone message is not JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("phone message must be an object")
    models = {"hello": PhoneHello, "phone_pose": PhonePose, "control_disabled": PhoneDisable, "recenter": PhoneRecenter}
    model = models.get(payload.get("type"))
    if model is None:
        raise ValueError(f"unsupported phone message type: {payload.get('type')}")
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(exc.errors()[0]["msg"]) from exc


def phone_orientation(quaternion: Quaternion) -> np.ndarray:
    """Convert the phone relative rotation into the existing arm-base convention."""
    x, y, z, w = quaternion.x, quaternion.y, quaternion.z, quaternion.w
    norm = math.sqrt(x * x + y * y + z * z + w * w)
    if not math.isfinite(norm) or norm < 1e-6:
        raise ValueError("invalid phone quaternion")
    # Phone rotvec axes follow the LeRobot phone example: wx=rotvec.y,
    # wy=rotvec.x and wz=-rotvec.z. The SO-101 ArmController consumes a
    # base-frame quaternion and extracts pitch/roll at the engage reference.
    rotation = Rotation.from_quat(np.array([x, y, z, w], dtype=float) / norm)
    rotvec = rotation.as_rotvec()
    return Rotation.from_rotvec(np.array([rotvec[1], rotvec[0], -rotvec[2]])).as_quat()


def phone_position(position: Vector3) -> np.ndarray:
    """Map phone XYZ to the arm base frame used by ArmController."""
    return np.array([-position.y, position.x, position.z], dtype=float)
