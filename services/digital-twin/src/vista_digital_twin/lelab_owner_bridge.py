"""Optional LeLab-owner callback; it reads no serial port and issues no command."""

import json
import queue
import threading
from datetime import datetime, timezone
from typing import Mapping
from urllib.request import Request, urlopen


class LeLabOwnerPublisher:
    """Called by the existing LeLab teleoperation worker after `get_observation()`."""

    def __init__(self, *, endpoint: str, token: str, owner_id: str, organization_id: str, robot_id: str):
        if not all(isinstance(value, str) and value for value in (endpoint, token, owner_id, organization_id, robot_id)):
            raise ValueError("endpoint, token and identities are required")
        self.endpoint = endpoint.rstrip("/") + "/internal/physical-telemetry"
        self.token = token
        self.owner_id = owner_id
        self.organization_id = organization_id
        self.robot_id = robot_id

    def publish_observation(self, observation: Mapping[str, object], *, measured_at: datetime | None = None) -> None:
        """Forward an existing measured observation; no action or hardware API is invoked."""
        at = measured_at or datetime.now(timezone.utc)
        payload = json.dumps({
            "owner_id": self.owner_id,
            "organization_id": self.organization_id,
            "robot_id": self.robot_id,
            "measured_at": at.isoformat(),
            "observation": dict(observation),
        }).encode()
        request = Request(self.endpoint, data=payload, method="POST", headers={
            "Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "Accept": "application/json",
        })
        with urlopen(request, timeout=0.5) as response:
            if response.status != 202:
                raise RuntimeError("digital twin publisher rejected telemetry")


class NonBlockingLeLabOwnerPublisher(LeLabOwnerPublisher):
    """Best-effort owner bridge that cannot delay teleoperation's control loop.

    The queue holds one pending sample. On a slow or failed gateway, stale samples
    are replaced by the newest observation and the next live sample retries.
    """

    def __init__(self, *args, sender=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._queue: queue.Queue[dict[str, object] | None] = queue.Queue(maxsize=1)
        self._sender = sender or self._send_payload
        self._closed = False
        self.dropped_frames = 0
        self._thread = threading.Thread(target=self._run, name="vista-twin-publisher", daemon=True)
        self._thread.start()

    @property
    def pending_frames(self) -> int:
        return self._queue.qsize()

    def _payload(self, observation: Mapping[str, object], measured_at: datetime | None) -> dict[str, object]:
        at = measured_at or datetime.now(timezone.utc)
        return {"owner_id": self.owner_id, "organization_id": self.organization_id, "robot_id": self.robot_id, "measured_at": at.isoformat(), "observation": dict(observation)}

    def _send_payload(self, payload: dict[str, object]) -> None:
        request = Request(self.endpoint, data=json.dumps(payload).encode(), method="POST", headers={
            "Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "Accept": "application/json",
        })
        with urlopen(request, timeout=0.5) as response:
            if response.status != 202:
                raise RuntimeError("digital twin publisher rejected telemetry")

    def publish_observation(self, observation: Mapping[str, object], *, measured_at: datetime | None = None) -> None:
        if self._closed:
            return
        payload = self._payload(observation, measured_at)
        try:
            self._queue.put_nowait(payload)
        except queue.Full:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            self.dropped_frames += 1
            try:
                self._queue.put_nowait(payload)
            except queue.Full:
                self.dropped_frames += 1

    def _run(self) -> None:
        while True:
            payload = self._queue.get()
            if payload is None:
                return
            try:
                self._sender(payload)
            except Exception:
                # A telemetry outage is isolated to this thread. A later frame is
                # the bounded reconnect/retry mechanism; control never waits.
                continue

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._queue.put_nowait(None)
        except queue.Full:
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait(None)
            except queue.Full:
                pass
        self._thread.join(timeout=0.6)
