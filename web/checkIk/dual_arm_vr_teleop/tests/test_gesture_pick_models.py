"""Contracts for immutable gesture selection and safe runtime configuration."""

import json
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.gesture_pick import (
    DetectedTag,
    GesturePickConfig,
    PickPlaceTask,
    TaskPhase,
    TaskState,
    load_config,
)


def config_payload():
    return {
        "camera_path": "/dev/video-test",
        "tag_dictionary": "DICT_APRILTAG_36h11",
        "tags": {"7": "object", "8": "box"},
        "follower_side": "right",
    }


@pytest.mark.parametrize("tags", [
    '{"1":"object","1":"box"}',
    '{"587":"object","8":"box"}',
    '{"-1":"object","8":"box"}',
    '{"01":"object","8":"box"}',
    '{"7":"unknown","8":"box"}',
])
def test_config_rejects_duplicate_or_unknown_tag_ids(tmp_path, tags):
    path = tmp_path / "config.json"
    payload = json.dumps(config_payload()).replace('{"7": "object", "8": "box"}', tags)
    path.write_text(payload)
    with pytest.raises(ValueError):
        load_config(path)


def test_config_requires_object_and_destination_tags(tmp_path):
    payload = config_payload()
    payload["tags"] = {"7": "object"}
    path = tmp_path / "config.json"
    path.write_text(json.dumps(payload))
    with pytest.raises(ValueError):
        load_config(path)


def test_config_is_loaded_without_hardware_or_calibration_and_is_immutable(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(json.dumps(config_payload()))
    config = load_config(path)
    assert isinstance(config, GesturePickConfig)
    assert config.tags[7] == "object"
    assert config.tags[8] == "box"
    assert config.calibration_path is None
    with pytest.raises(ValidationError):
        config.follower_side = "left"
    with pytest.raises(TypeError):
        config.tags[7] = "box"
    assert json.loads(config.model_dump_json())["tags"] == {"7": "object", "8": "box"}


@pytest.mark.parametrize("field,value", [
    ("follower_side", "both"),
    ("camera_path", ""),
    ("tag_dictionary", "unknown"),
    ("max_tag_age_s", 0.0),
    ("max_tag_age_s", float("nan")),
    ("max_tag_age_s", "0.5"),
    ("unexpected", True),
])
def test_config_rejects_invalid_runtime_fields(tmp_path, field, value):
    payload = config_payload()
    payload[field] = value
    path = tmp_path / "config.json"
    path.write_text(json.dumps(payload))
    with pytest.raises(ValueError):
        load_config(path)


def detected_tag(**changes):
    payload = {
        "tag_id": 7, "kind": "object", "image_center": (20.0, 30.0),
        "robot_point": (0.1, 0.2, 0.0), "observed_at": 10.0,
    }
    payload.update(changes)
    return DetectedTag(**payload)


@pytest.mark.parametrize("field,value", [
    ("tag_id", "7"), ("tag_id", True), ("tag_id", -1),
    ("kind", "cube"), ("image_center", (float("inf"), 30.0)),
    ("image_center", (-1.0, 30.0)), ("image_center", (20.0,)),
    ("robot_point", (0.1, float("nan"), 0.0)),
    ("observed_at", -1.0), ("observed_at", "10"),
    ("observed_at", float("inf")), ("confidence", 1.1),
    ("visible", "true"), ("unexpected", 1),
])
def test_detection_rejects_unsafe_or_coerced_values(field, value):
    with pytest.raises(ValidationError):
        detected_tag(**{field: value})


def test_detections_preserve_coordinates_and_cannot_be_mutated():
    tag = detected_tag()
    assert tag.image_center == (20.0, 30.0)
    assert tag.robot_point == (0.1, 0.2, 0.0)
    assert tag.visible
    with pytest.raises(ValidationError):
        tag.observed_at = 20.0


def test_tasks_generate_unique_identity_and_timestamp():
    first = PickPlaceTask(object_tag_id=7, box_tag_id=8, follower_side="right")
    second = PickPlaceTask(object_tag_id=7, box_tag_id=8, follower_side="right")
    assert first.task_id != second.task_id
    assert first.requested_at > 0
    with pytest.raises(ValidationError):
        first.object_tag_id = 9


@pytest.mark.parametrize("changes", [
    {"object_tag_id": "7"}, {"box_tag_id": True}, {"box_tag_id": 7},
    {"follower_side": "both"}, {"requested_at": float("nan")},
    {"task_id": ""},
])
def test_task_rejects_invalid_selection(changes):
    payload = {"object_tag_id": 7, "box_tag_id": 8, "follower_side": "right"}
    payload.update(changes)
    with pytest.raises(ValidationError):
        PickPlaceTask(**payload)


def test_task_state_exposes_safe_terminal_states():
    assert TaskPhase.SUCCEEDED.is_terminal
    assert TaskPhase.HELD.is_terminal
    assert TaskPhase.FAILED.is_terminal
    assert not TaskPhase.EXECUTING.is_terminal
    assert not TaskPhase.PREVIEW.is_terminal
    state = TaskState(phase=TaskPhase.HELD, reason="operator cancelled", task_id="task-1")
    assert state.reason == "operator cancelled"
    with pytest.raises(ValidationError):
        state.phase = TaskPhase.EXECUTING


@pytest.mark.parametrize("phase", [TaskPhase.HELD, TaskPhase.FAILED])
def test_unsuccessful_terminal_state_requires_actionable_reason(phase):
    with pytest.raises(ValidationError):
        TaskState(phase=phase)
    with pytest.raises(ValidationError):
        TaskState(phase=phase, reason="   ")


def test_example_config_loads_without_fabricated_calibration():
    config = load_config(ROOT / "gesture_pick_config.example.json")
    assert config.camera_path == "/dev/video*"
    assert config.calibration_path is None
    assert set(config.tags.values()) == {"object", "box"}
