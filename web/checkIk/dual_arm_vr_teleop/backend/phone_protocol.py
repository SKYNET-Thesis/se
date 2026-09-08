"""Validated phone-teleop messages and conversion to the shared IK packet."""

from __future__ import annotations

import json
import math
from typing import Any, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from lerobot.utils.rotation import Rotation

from backend.offline_teleop_server import ControllerPacket, HandPose

PROTOCOL_VERSION = 1


class PhoneMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocolVersion: Literal[PROTOCOL_VERSION]


class PhoneHello(PhoneMessage):
    type: Literal["hello"]
    platform: Literal["android", "ios"]
    sessionId: str = Field(min_length=1, max_length=128)
    arm: Literal["left", "right"] = "right"


class PhoneVector(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float
    z: float

    @field_validator("x", "y", "z")
    @classmethod
    def finite_and_bounded(cls, value: float) -> float:
        if not math.isfinite(value) or abs(value) > 2.0:
            raise ValueError("phone position must be finite and within 2 m")
        return value


class PhoneQuaternion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float
    z: float
    w: float

    @field_validator("x", "y", "z", "w")
    @classmethod
    def finite(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("phone quaternion must be finite")
        return value


class PhonePose(PhoneMessage):
    type: Literal["phone_pose"]
    platform: Literal["android", "ios"]
    sessionId: str = Field(min_length=1, max_length=128)
    sequence: int = Field(ge=0)
    timestampNs: int = Field(gt=0)
    trackingState: Literal["tracking", "limited", "lost"]
    enabled: bool
    fineMode: bool
    position: PhoneVector
    quaternion: PhoneQuaternion
    gripperVelocity: float = Field(ge=-1.0, le=1.0)


class PhoneControlDisabled(PhoneMessage):
    type: Literal["control_disabled"]
    reason: str = Field(min_length=1, max_length=128)


class PhoneRecenter(PhoneMessage):
    type: Literal["recenter"]


PhoneInput = PhoneHello | PhonePose | PhoneControlDisabled | PhoneRecenter


def parse_phone_message(raw: str) -> PhoneInput:
    if len(raw.encode("utf-8")) > 16_384:
        raise ValueError("phone message exceeds 16 KiB")
    try:
        payload: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("phone message is not JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("phone message must be an object")
    models = {
        "hello": PhoneHello,
        "phone_pose": PhonePose,
        "control_disabled": PhoneControlDisabled,
        "recenter": PhoneRecenter,
    }
    model = models.get(payload.get("type"))
    if model is None:
        raise ValueError(f"unsupported phone message type: {payload.get('type')}")
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(exc.errors()[0]["msg"]) from exc


def _phone_position(position: PhoneVector) -> list[float]:
    # ARKit/Android phone axes -> the arm-base convention used by OfflineTeleop.
    return [-position.y, position.x, position.z]


def _phone_rotation(quaternion: PhoneQuaternion) -> list[float]:
    values = np.array([quaternion.x, quaternion.y, quaternion.z, quaternion.w], dtype=float)
    norm = float(np.linalg.norm(values))
    if norm < 1e-6:
        raise ValueError("phone quaternion is zero")
    rotvec = Rotation.from_quat(values / norm).as_rotvec()
    return Rotation.from_rotvec(np.array([rotvec[1], rotvec[0], -rotvec[2]])).as_quat().tolist()


def phone_to_controller_packet(
    pose: PhonePose,
    *,
    arm: Literal["left", "right"],
    trigger: float,
) -> ControllerPacket:
    disabled = pose.trackingState == "lost" or not pose.enabled
    hand = HandPose(
        connected=True,
        enabled=not disabled,
        position=_phone_position(pose.position),
        rotation=_phone_rotation(pose.quaternion),
        trigger=float(np.clip(trigger, 0.0, 1.0)),
        grip=float(np.clip(trigger, 0.0, 1.0)),
        source="controller",
    )
    inactive = HandPose(
        connected=False,
        enabled=False,
        position=[0.0, 0.0, 0.0],
        rotation=[0.0, 0.0, 0.0, 1.0],
        trigger=0.0,
        grip=0.0,
        source="controller",
    )
    return ControllerPacket(
        sequence=pose.sequence,
        timestamp=pose.timestampNs / 1_000_000_000.0,
        left=hand if arm == "left" else inactive,
        right=hand if arm == "right" else inactive,
    )
