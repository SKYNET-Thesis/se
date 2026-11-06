from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


JOINT_NAMES = (
    "shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper",
)


class ProgressEvent(BaseModel):
    device_id: str
    device_role: Literal["LEADER", "FOLLOWER"]
    session_id: str
    joint_name: str
    current_position: float
    observed_min: float
    observed_max: float
    expected_min: float | None = None
    expected_max: float | None = None
    coverage_percentage: float | None = None
    status: Literal["CONNECTING", "RECORDING", "REVIEW", "COMPLETE", "CANCELLED", "ERROR"]
    timestamp: str


class JointProgressTracker:
    """Records physical observations. It never substitutes guessed joint limits."""

    def __init__(self, *, device_id: str, device_role: Literal["LEADER", "FOLLOWER"], session_id: str,
                 expected_ranges: dict[str, tuple[float, float]] | None = None):
        self.device_id = device_id
        self.device_role = device_role
        self.session_id = session_id
        self.expected_ranges = expected_ranges or {}
        # Format: {joint_name: (min, max, current)}
        self._ranges: dict[str, tuple[float, float, float]] = {}

    def observe(self, positions: dict[str, float], *, timestamp: str | None = None,
                status: Literal["CONNECTING", "RECORDING", "REVIEW", "COMPLETE", "CANCELLED", "ERROR"] = "RECORDING") -> list[ProgressEvent]:
        at = timestamp or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        events: list[ProgressEvent] = []
        for name, current in positions.items():
            if name not in JOINT_NAMES or not isinstance(current, (int, float)):
                continue
            value = float(current)
            if value != value or value in (float("inf"), float("-inf")):
                continue
            minimum, maximum, _ = self._ranges.get(name, (value, value, value))
            minimum, maximum = min(minimum, value), max(maximum, value)
            self._ranges[name] = (minimum, maximum, value)
            expected = self.expected_ranges.get(name)
            coverage = None
            if expected is not None and expected[1] > expected[0]:
                coverage = max(0.0, min(100.0, (maximum - minimum) * 100.0 / (expected[1] - expected[0])))
            events.append(ProgressEvent(
                device_id=self.device_id, device_role=self.device_role, session_id=self.session_id,
                joint_name=name, current_position=value, observed_min=minimum, observed_max=maximum,
                expected_min=expected[0] if expected else None, expected_max=expected[1] if expected else None,
                coverage_percentage=coverage, status=status, timestamp=at,
            ))
        return events

    def update_from_lelab(self, recorded_ranges: dict[str, Any] | None,
                          current_positions: dict[str, float] | None = None,
                          *, timestamp: str | None = None,
                          status: Literal["CONNECTING", "RECORDING", "REVIEW", "COMPLETE", "CANCELLED", "ERROR"] = "RECORDING") -> list[ProgressEvent]:
        """Update tracker state from LeLab's recorded_ranges and optional current_positions."""
        at = timestamp or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        ranges_dict = recorded_ranges or {}
        curr_dict = current_positions or {}

        events: list[ProgressEvent] = []
        for name in JOINT_NAMES:
            entry = ranges_dict.get(name)
            curr = curr_dict.get(name)
            if entry and isinstance(entry, dict):
                c_val = float(entry.get("current", curr if curr is not None else 0.0))
                min_val = float(entry.get("min", c_val))
                max_val = float(entry.get("max", c_val))
                self._ranges[name] = (min_val, max_val, c_val)
            elif curr is not None and isinstance(curr, (int, float)):
                c_val = float(curr)
                minimum, maximum, _ = self._ranges.get(name, (c_val, c_val, c_val))
                self._ranges[name] = (min(minimum, c_val), max(maximum, c_val), c_val)
            elif name in self._ranges:
                pass
            else:
                continue

            minimum, maximum, current = self._ranges[name]
            expected = self.expected_ranges.get(name)
            coverage = None
            if expected is not None and expected[1] > expected[0]:
                coverage = max(0.0, min(100.0, (maximum - minimum) * 100.0 / (expected[1] - expected[0])))

            events.append(ProgressEvent(
                device_id=self.device_id, device_role=self.device_role, session_id=self.session_id,
                joint_name=name, current_position=current, observed_min=minimum, observed_max=maximum,
                expected_min=expected[0] if expected else None, expected_max=expected[1] if expected else None,
                coverage_percentage=coverage, status=status, timestamp=at,
            ))
        return events

    def snapshot(self, *, status: Literal["CONNECTING", "RECORDING", "REVIEW", "COMPLETE", "CANCELLED", "ERROR"] = "RECORDING") -> list[ProgressEvent]:
        at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        events: list[ProgressEvent] = []
        for name in JOINT_NAMES:
            if name not in self._ranges:
                continue
            minimum, maximum, current = self._ranges[name]
            expected = self.expected_ranges.get(name)
            coverage = None
            if expected is not None and expected[1] > expected[0]:
                coverage = max(0.0, min(100.0, (maximum - minimum) * 100.0 / (expected[1] - expected[0])))
            events.append(ProgressEvent(
                device_id=self.device_id, device_role=self.device_role, session_id=self.session_id,
                joint_name=name, current_position=current, observed_min=minimum, observed_max=maximum,
                expected_min=expected[0] if expected else None, expected_max=expected[1] if expected else None,
                coverage_percentage=coverage, status=status, timestamp=at,
            ))
        return events
