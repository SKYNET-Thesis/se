"""Immutable domain values shared by gesture selection and guarded execution."""

from enum import Enum
from time import time
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

TagId = Annotated[int, Field(ge=0)]
TagKind = Literal["object", "box"]
FollowerSide = Literal["left", "right"]
FiniteCoordinate = Annotated[float, Field(allow_inf_nan=False)]
PixelCoordinate = Annotated[float, Field(ge=0, allow_inf_nan=False)]
Timestamp = Annotated[float, Field(ge=0, allow_inf_nan=False)]
NonemptyText = Annotated[str, Field(min_length=1)]


class FrozenModel(BaseModel):
    model_config = ConfigDict(strict=True, frozen=True, extra="forbid", validate_default=True)


class TaskPhase(str, Enum):
    IDLE = "idle"
    SELECTING_OBJECT = "selecting-object"
    SELECTING_BOX = "selecting-box"
    PREVIEW = "preview"
    EXECUTING = "executing"
    SUCCEEDED = "succeeded"
    HELD = "held"
    FAILED = "failed"

    @property
    def is_terminal(self) -> bool:
        return self in {self.SUCCEEDED, self.HELD, self.FAILED}


class DetectedTag(FrozenModel):
    """One observation; image pixels and robot-base metres use fixed-size tuples."""

    tag_id: TagId
    kind: TagKind
    image_center: tuple[PixelCoordinate, PixelCoordinate]
    robot_point: tuple[FiniteCoordinate, FiniteCoordinate, FiniteCoordinate]
    observed_at: Timestamp
    confidence: float = Field(default=1.0, ge=0, le=1, allow_inf_nan=False)
    visible: bool = True


class PickPlaceTask(FrozenModel):
    object_tag_id: TagId
    box_tag_id: TagId
    follower_side: FollowerSide
    task_id: NonemptyText = Field(default_factory=lambda: str(uuid4()))
    requested_at: Timestamp = Field(default_factory=time)

    @model_validator(mode="after")
    def distinct_selections(self) -> "PickPlaceTask":
        if self.object_tag_id == self.box_tag_id:
            raise ValueError("object and box must have different tag IDs")
        return self


class TaskState(FrozenModel):
    phase: TaskPhase = TaskPhase.IDLE
    task_id: NonemptyText | None = None
    reason: NonemptyText | None = None
    stage: NonemptyText | None = None
    updated_at: Timestamp = Field(default_factory=time)

    @model_validator(mode="after")
    def unsuccessful_state_has_reason(self) -> "TaskState":
        if self.phase in {TaskPhase.HELD, TaskPhase.FAILED}:
            if self.reason is None or not self.reason.strip():
                raise ValueError("held and failed states require a human-readable reason")
        return self
