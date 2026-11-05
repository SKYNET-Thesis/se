"""Deterministic offline frames and a single bounded latest-state slot."""

import json
from datetime import datetime
from pathlib import Path

from .contracts import JointReading, JointState, SO101_JOINTS, SourceMode


def load_fixture(path: Path) -> list[dict[str, float]]:
    frames = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(frames, list) or not frames:
        raise ValueError("fixture must contain frames")
    for frame in frames:
        if not isinstance(frame, dict) or set(frame) != set(SO101_JOINTS):
            raise ValueError("fixture frame must contain all six SO-101 joints")
        for name, value in frame.items():
            JointReading(name=name, position=value, unit="percent" if name == "gripper" else "rad")
    return frames


class MockTelemetry:
    def __init__(
        self,
        frames: list[dict[str, float]],
        *,
        robot_id: str = "so101-mock",
        rate_hz: float = 30,
        disconnect_at: int | None = None,
        reconnect_at: int | None = None,
    ):
        if not 0 < rate_hz <= 100:
            raise ValueError("rate_hz must be in (0, 100]")
        if not frames:
            raise ValueError("mock source requires at least one frame")
        if disconnect_at is not None and disconnect_at < 1:
            raise ValueError("disconnect_at must follow the first measurement")
        if reconnect_at is not None and (disconnect_at is None or reconnect_at <= disconnect_at):
            raise ValueError("reconnect_at must follow disconnect_at")
        self.frames = frames
        self.robot_id = robot_id
        self.rate_hz = rate_hz
        self.disconnect_at = disconnect_at
        self.reconnect_at = reconnect_at
        self.sequence = 0
        self.frame_index = 0
        self._started_at: datetime | None = None
        self.last_readings: list[JointReading] | None = None
        self.last_measured_at: datetime | None = None

    def next_state(self, at: datetime) -> JointState:
        sequence = self.sequence
        self.sequence += 1
        disconnected = self.disconnect_at is not None and sequence >= self.disconnect_at and (
            self.reconnect_at is None or sequence < self.reconnect_at
        )
        if not disconnected:
            self._started_at = self._started_at or at
            elapsed = max(0.0, (at - self._started_at).total_seconds())
            segment = int(elapsed) % len(self.frames)
            fraction = elapsed % 1.0
            current = self.frames[segment]
            following = self.frames[(segment + 1) % len(self.frames)]
            self.last_readings = [
                JointReading(
                    name=name,
                    position=current[name] + (following[name] - current[name]) * fraction,
                    unit="percent" if name == "gripper" else "rad",
                )
                for name in SO101_JOINTS
            ]
            self.last_measured_at = at
        elif self.last_readings is None:
            raise ValueError("mock cannot disconnect before its first measurement")
        return JointState(
            schema_version=1,
            robot_id=self.robot_id,
            source_mode=SourceMode.SIMULATION,
            controller_id="offline-fixture",
            measured_at=self.last_measured_at,
            sequence=sequence,
            connection="disconnected" if disconnected else "connected",
            measured=self.last_readings,
        )


class LatestState:
    """One frame only: slow readers skip old frames rather than building latency."""

    def __init__(self, *, stale_after_seconds: float = 0.5):
        if stale_after_seconds <= 0:
            raise ValueError("stale_after_seconds must be positive")
        self.stale_after_seconds = stale_after_seconds
        self._state: JointState | None = None

    def publish(self, state: JointState) -> bool:
        previous = self._state
        if previous is not None and (
            state.sequence <= previous.sequence
            or (state.connection == "connected" and state.measured_at < previous.measured_at)
        ):
            return False
        self._state = state
        return True

    def latest(self, now: datetime) -> JointState | None:
        state = self._state
        if state is None:
            return None
        if state.connection == "connected" and (now - state.measured_at).total_seconds() > self.stale_after_seconds:
            return state.model_copy(update={"connection": "stale"})
        return state
