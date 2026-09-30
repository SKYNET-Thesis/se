"""Load gesture-pick configuration without opening cameras or hardware."""

import json
import re
from pathlib import Path
from types import MappingProxyType
from typing import Literal, Mapping

from pydantic import Field, field_serializer, field_validator, model_validator

from .models import FollowerSide, FrozenModel, NonemptyText, TagId, TagKind

TagDictionary = Literal[
    "DICT_APRILTAG_16h5", "DICT_APRILTAG_25h9",
    "DICT_APRILTAG_36h10", "DICT_APRILTAG_36h11",
]
_DICTIONARY_SIZE = {
    "DICT_APRILTAG_16h5": 30,
    "DICT_APRILTAG_25h9": 35,
    "DICT_APRILTAG_36h10": 2320,
    "DICT_APRILTAG_36h11": 587,
}


class GesturePickConfig(FrozenModel):
    camera_path: NonemptyText
    tag_dictionary: TagDictionary = "DICT_APRILTAG_36h11"
    tags: Mapping[TagId, TagKind]
    follower_side: FollowerSide
    calibration_path: NonemptyText | None = None
    max_tag_age_s: float = Field(default=0.5, gt=0, allow_inf_nan=False)

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tag_keys(cls, value):
        if not isinstance(value, Mapping):
            raise ValueError("tags must map unique IDs to object or box")
        parsed = {}
        for key, kind in value.items():
            if type(key) is str and re.fullmatch(r"0|[1-9][0-9]*", key):
                key = int(key)
            if type(key) is not int or key < 0:
                raise ValueError("tag IDs must be nonnegative integers")
            if key in parsed:
                raise ValueError(f"duplicate tag ID: {key}")
            parsed[key] = kind
        return parsed

    @field_validator("tags", mode="after")
    @classmethod
    def freeze_tags(cls, value):
        return MappingProxyType(dict(value))

    @field_serializer("tags")
    def serialize_tags(self, value):
        return dict(value)

    @model_validator(mode="after")
    def known_tags_and_both_kinds(self) -> "GesturePickConfig":
        if any(tag_id >= _DICTIONARY_SIZE[self.tag_dictionary] for tag_id in self.tags):
            raise ValueError("unknown tag ID for configured dictionary")
        if set(self.tags.values()) != {"object", "box"}:
            raise ValueError("configure at least one object tag and one box tag")
        return self


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_config(path: str | Path) -> GesturePickConfig:
    """Reject duplicate JSON keys before model validation can lose that evidence."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=_unique_object)
    return GesturePickConfig.model_validate(payload)
