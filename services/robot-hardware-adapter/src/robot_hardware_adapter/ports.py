from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Literal, Protocol


class PortDetectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class PortInfo:
    device: str
    serial_number: str | None = None
    vid: int | None = None
    pid: int | None = None
    description: str | None = None


class PortEnumerator(Protocol):
    def list(self) -> list[PortInfo]: ...


class PySerialPortEnumerator:
    """Metadata enumeration only; no serial port is opened."""
    def list(self) -> list[PortInfo]:
        try:
            from serial.tools import list_ports
        except ImportError as exc:
            raise PortDetectionError("pyserial is required to enumerate serial-port metadata") from exc
        return [PortInfo(p.device, p.serial_number, p.vid, p.pid, p.description) for p in list_ports.comports()]


@dataclass
class DetectionSession:
    id: str
    device_id: str
    device_role: Literal["LEADER", "FOLLOWER"]
    before: list[PortInfo]
    phase: Literal["UNPLUG", "RECONNECT", "CONFIRM", "CANCELLED", "EXPIRED"] = "UNPLUG"
    disconnected_port: PortInfo | None = None
    unplugged_ports: list[PortInfo] | None = None
    candidate: PortInfo | None = None
    confirmed_port: PortInfo | None = None
    expires_at: float = 0


class PortDetection:
    def __init__(self, enumerator: PortEnumerator, *, timeout_seconds: int = 60):
        self.enumerator = enumerator
        self.timeout_seconds = timeout_seconds
        self.sessions: dict[str, DetectionSession] = {}

    def start(self, device_id: str, device_role: Literal["LEADER", "FOLLOWER"]) -> DetectionSession:
        session = DetectionSession(
            id=uuid.uuid4().hex,
            device_id=device_id,
            device_role=device_role,
            before=self.enumerator.list(),
            expires_at=time.monotonic() + self.timeout_seconds,
        )
        self.sessions[session.id] = session
        return session

    def _session(self, session_id: str) -> DetectionSession:
        session = self.sessions.get(session_id)
        if session is None:
            raise PortDetectionError("detection session was not found")
        if time.monotonic() > session.expires_at:
            session.phase = "EXPIRED"
            raise PortDetectionError("detection session expired")
        return session

    def get(self, session_id: str) -> DetectionSession:
        return self._session(session_id)

    def capture_unplug(self, session_id: str) -> DetectionSession:
        session = self._session(session_id)
        if session.phase != "UNPLUG":
            raise PortDetectionError("device is not awaiting unplug")
        current = self.enumerator.list()
        current_devices = {port.device for port in current}
        removed = [port for port in session.before if port.device not in current_devices]
        if len(removed) != 1:
            raise PortDetectionError(f"exactly one port must disappear before reconnecting, found {len(removed)}")
        session.disconnected_port = removed[0]
        session.unplugged_ports = current
        session.phase = "RECONNECT"
        return session

    def capture_reconnect(self, session_id: str) -> DetectionSession:
        session = self._session(session_id)
        if session.phase != "RECONNECT":
            raise PortDetectionError("device is not awaiting reconnect")
        current = self.enumerator.list()
        if session.unplugged_ports is not None:
            unplugged_devices = {port.device for port in session.unplugged_ports}
        else:
            disc = session.disconnected_port.device if session.disconnected_port else None
            unplugged_devices = {port.device for port in session.before if port.device != disc}
        candidates = [port for port in current if port.device not in unplugged_devices]
        if len(candidates) != 1:
            raise PortDetectionError(f"exactly one newly connected port is required, found {len(candidates)}")
        session.candidate = candidates[0]
        session.phase = "CONFIRM"
        return session

    def confirm(self, session_id: str) -> DetectionSession:
        session = self._session(session_id)
        if session.phase != "CONFIRM" or session.candidate is None:
            raise PortDetectionError("no port is ready for confirmation")
        session.confirmed_port = session.candidate
        return session

    def cancel(self, session_id: str) -> DetectionSession:
        session = self._session(session_id)
        session.phase = "CANCELLED"
        return session
