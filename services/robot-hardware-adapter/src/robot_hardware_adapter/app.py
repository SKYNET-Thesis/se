from __future__ import annotations

import os
import time
import uuid
from collections import defaultdict, deque
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .auth import OperatorSession, OperatorSessionIssuer, SessionError
from .calibration import (
    CalibrationGateway,
    LeLabCalibrationGateway,
    get_profile_ranges,
    list_profiles,
    load_profile,
    profile_exists,
)
from .ownership import DeviceOwner, DeviceOwnershipConflict
from .ports import PortDetection, PortDetectionError, PortEnumerator, PortInfo, PySerialPortEnumerator
from .progress import JointProgressTracker

ALLOWED_ORIGINS = {"http://localhost:5173", "http://127.0.0.1:5173"}


class DeviceBody(BaseModel):
    device_id: str = Field(min_length=1, max_length=128)
    device_role: Literal["LEADER", "FOLLOWER"]


class CalibrationBody(DeviceBody):
    robot_id: str = Field(min_length=1, max_length=128)
    profile_id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,96}$")
    overwrite: bool = False


class Confirmation(BaseModel):
    confirm: Literal[True]


class _RateLimit:
    def __init__(self, limit: int = 12, seconds: int = 60):
        self.limit = limit
        self.seconds = seconds
        self.events: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str):
        now = time.monotonic()
        items = self.events[key]
        while items and items[0] <= now - self.seconds:
            items.popleft()
        if len(items) >= self.limit:
            raise HTTPException(429, "sensitive operation rate limit exceeded")
        items.append(now)


class AdapterService:
    def __init__(
        self,
        *,
        issuer: OperatorSessionIssuer,
        port_enumerator: PortEnumerator | None = None,
        calibration_factory=LeLabCalibrationGateway,
        lock_root: Path | None = Path("/tmp/vista-hardware-locks"),
        leader_calibration_dir: Path | None = None,
        follower_calibration_dir: Path | None = None,
    ):
        self.issuer = issuer
        self.detection = PortDetection(port_enumerator or PySerialPortEnumerator())
        self.calibration_factory = calibration_factory
        self.lock_root = lock_root
        self.leader_calibration_dir = leader_calibration_dir
        self.follower_calibration_dir = follower_calibration_dir
        self.confirmed_ports: dict[str, PortInfo] = {}
        self.current: dict[str, Any] | None = None
        self.rate_limit = _RateLimit()

    def get_calibration_dir(self, role: Literal["LEADER", "FOLLOWER"]) -> Path:
        if role == "LEADER" and self.leader_calibration_dir:
            return self.leader_calibration_dir
        if role == "FOLLOWER" and self.follower_calibration_dir:
            return self.follower_calibration_dir
        return get_calibration_dir(role)

    def profile_exists(self, role: Literal["LEADER", "FOLLOWER"], profile_id: str) -> bool:
        if not profile_id or "/" in profile_id or "\\" in profile_id or ".." in profile_id:
            return False
        return (self.get_calibration_dir(role) / f"{profile_id}.json").is_file()

    def load_profile(self, role: Literal["LEADER", "FOLLOWER"], profile_id: str) -> dict[str, Any] | None:
        if not profile_id or "/" in profile_id or "\\" in profile_id or ".." in profile_id:
            return None
        target = self.get_calibration_dir(role) / f"{profile_id}.json"
        if not target.is_file():
            return None
        try:
            import json
            return json.loads(target.read_text(encoding="utf-8"))
        except Exception:
            return None

    def list_profiles(self) -> dict[str, list[str]]:
        result = {}
        for role, key in (("LEADER", "leader"), ("FOLLOWER", "follower")):
            directory = self.get_calibration_dir(role)
            configs = []
            if directory.is_dir():
                try:
                    for entry in sorted(directory.iterdir()):
                        if entry.is_file() and entry.suffix == ".json":
                            configs.append(entry.stem)
                except OSError:
                    pass
            result[key] = configs
        return result

    def authorize(self, authorization: str | None, origin: str | None) -> OperatorSession:
        if origin not in ALLOWED_ORIGINS:
            raise HTTPException(403, "local adapter origin is not allowed")
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "operator session required")
        try:
            return self.issuer.verify(authorization[7:])
        except SessionError as exc:
            raise HTTPException(401, str(exc)) from exc

    @staticmethod
    def bind(session: OperatorSession, body: DeviceBody, robot_id: str | None = None):
        if (
            session.device_id != body.device_id
            or session.device_role != body.device_role
            or (robot_id is not None and session.robot_id != robot_id)
        ):
            raise HTTPException(403, "operator session is not bound to this robot/device/role")


def create_app(service: AdapterService) -> FastAPI:
    app = FastAPI(title="VISTA local hardware adapter", docs_url=None, redoc_url=None)
    app.state.adapter = service

    app.add_middleware(
        CORSMiddleware,
        allow_origins=sorted(ALLOWED_ORIGINS),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=0,
    )

    async def operator(
        authorization: Annotated[str | None, Header()] = None,
        origin: Annotated[str | None, Header()] = None,
    ):
        return service.authorize(authorization, origin)

    async def limited(session: OperatorSession = Depends(operator)):
        service.rate_limit.check(session.jti)
        return session

    @app.get("/health")
    async def health():
        return {"status": "ok", "binding": "127.0.0.1 only"}

    @app.get("/v1/ports")
    async def list_ports(_: OperatorSession = Depends(operator)):
        ports_data = []
        for port in service.detection.enumerator.list():
            locked, locked_by = DeviceOwner.check_ownership(service.lock_root, port.device)
            item = dict(port.__dict__)
            item["locked"] = locked
            item["locked_by"] = locked_by
            ports_data.append(item)
        return {"items": ports_data}

    @app.get("/v1/profiles")
    async def get_profiles(_: OperatorSession = Depends(operator)):
        return service.list_profiles()

    @app.get("/v1/profiles/{role}/{profile_id}")
    async def inspect_profile(
        role: Literal["LEADER", "FOLLOWER"],
        profile_id: str,
        _: OperatorSession = Depends(operator),
    ):
        data = service.load_profile(role, profile_id)
        if data is None:
            raise HTTPException(404, f"Profile '{profile_id}' for {role} not found")
        return {"role": role, "profile_id": profile_id, "data": data}

    @app.post("/v1/detection")
    async def begin_detection(body: DeviceBody, session: OperatorSession = Depends(limited)):
        service.bind(session, body)
        return service.detection.start(body.device_id, body.device_role).__dict__

    @app.get("/v1/detection/{session_id}")
    async def get_detection(session_id: str, session: OperatorSession = Depends(operator)):
        try:
            item = service.detection.get(session_id)
        except PortDetectionError as exc:
            raise HTTPException(404, str(exc)) from exc
        if item.device_id != session.device_id:
            raise HTTPException(403, "detection session does not belong to device")
        return item.__dict__

    @app.post("/v1/detection/{session_id}/unplug")
    async def unplug_device(session_id: str, session: OperatorSession = Depends(limited)):
        try:
            item = service.detection.capture_unplug(session_id)
        except PortDetectionError as exc:
            raise HTTPException(400, str(exc)) from exc
        if item.device_id != session.device_id:
            raise HTTPException(403, "detection session does not belong to device")
        return item.__dict__

    @app.post("/v1/detection/{session_id}/reconnect")
    async def reconnect_device(session_id: str, session: OperatorSession = Depends(limited)):
        try:
            item = service.detection.capture_reconnect(session_id)
        except PortDetectionError as exc:
            raise HTTPException(400, str(exc)) from exc
        if item.device_id != session.device_id:
            raise HTTPException(403, "detection session does not belong to device")
        return item.__dict__

    @app.post("/v1/detection/{session_id}/confirm")
    async def confirm_detected_port(session_id: str, session: OperatorSession = Depends(limited)):
        try:
            item = service.detection.confirm(session_id)
        except PortDetectionError as exc:
            raise HTTPException(400, str(exc)) from exc
        if item.device_id != session.device_id:
            raise HTTPException(403, "detection session does not belong to device")
        service.confirmed_ports[item.device_id] = item.confirmed_port
        return item.__dict__

    @app.post("/v1/detection/{session_id}/cancel")
    async def cancel_detection_session(session_id: str, session: OperatorSession = Depends(operator)):
        try:
            item = service.detection.cancel(session_id)
        except PortDetectionError as exc:
            raise HTTPException(404, str(exc)) from exc
        if item.device_id != session.device_id:
            raise HTTPException(403, "detection session does not belong to device")
        return item.__dict__

    @app.post("/v1/calibrations")
    async def start_calibration(body: CalibrationBody, session: OperatorSession = Depends(limited)):
        service.bind(session, body, body.robot_id)
        if service.current:
            raise HTTPException(409, "a calibration session is already active")
        port = service.confirmed_ports.get(body.device_id)
        if port is None:
            raise HTTPException(409, "device port is not confirmed")

        # Do not silently overwrite existing calibration profiles unless overwrite is explicitly requested
        if service.profile_exists(body.device_role, body.profile_id) and not body.overwrite:
            raise HTTPException(
                409,
                f"Calibration profile '{body.profile_id}' already exists for {body.device_role}. Explicit overwrite confirmation required.",
            )

        try:
            owner = DeviceOwner(service.lock_root, port.device, "calibration").acquire() if service.lock_root else None
        except DeviceOwnershipConflict as exc:
            raise HTTPException(409, str(exc)) from exc

        # Read trusted expected ranges from existing profile if available
        expected = get_profile_ranges(body.device_role, body.profile_id)

        session_uuid = uuid.uuid4().hex
        tracker = JointProgressTracker(
            device_id=body.device_id,
            device_role=body.device_role,
            session_id=session_uuid,
            expected_ranges=expected,
        )

        gateway = service.calibration_factory()
        try:
            started = gateway.start(role=body.device_role, port=port.device, profile_id=body.profile_id)
        except Exception:
            if owner:
                owner.release()
            raise

        service.current = {
            "id": session_uuid,
            "robot_id": body.robot_id,
            "device_id": body.device_id,
            "role": body.device_role,
            "profile_id": body.profile_id,
            "gateway": gateway,
            "tracker": tracker,
            "owner": owner,
            "review_ready": False,
        }
        return {"id": service.current["id"], "status": started}

    @app.get("/v1/calibrations/current")
    async def calibration_status(session: OperatorSession = Depends(operator)):
        current = service.current
        if current is None:
            return {"active": False}
        if current["device_id"] != session.device_id:
            raise HTTPException(403, "session does not own calibration")

        gateway_status = current["gateway"].status()
        tracker: JointProgressTracker = current["tracker"]
        status_str = gateway_status.get("status", "recording").upper()
        if status_str not in ("CONNECTING", "RECORDING", "REVIEW", "COMPLETE", "CANCELLED", "ERROR"):
            status_str = "REVIEW" if current["review_ready"] else "RECORDING"
        if current["review_ready"]:
            status_str = "REVIEW"

        events = tracker.update_from_lelab(
            gateway_status.get("recorded_ranges"),
            gateway_status.get("current_positions"),
            status=status_str,
        )

        return {
            "active": True,
            "id": current["id"],
            "robot_id": current["robot_id"],
            "device_id": current["device_id"],
            "device_role": current["role"],
            "profile_id": current["profile_id"],
            "status": gateway_status,
            "review_ready": current["review_ready"],
            "events": [event.model_dump() for event in events],
            "progress_by_joint": {event.joint_name: event.model_dump() for event in events},
        }

    @app.post("/v1/calibrations/current/review")
    async def review_calibration(session: OperatorSession = Depends(limited)):
        current = service.current
        if not current or current["device_id"] != session.device_id:
            raise HTTPException(404, "active calibration not found")
        current["review_ready"] = True
        tracker: JointProgressTracker = current["tracker"]
        gateway_status = current["gateway"].status()
        events = tracker.update_from_lelab(
            gateway_status.get("recorded_ranges"),
            gateway_status.get("current_positions"),
            status="REVIEW",
        )
        return {
            "status": gateway_status,
            "save_requires_confirmation": True,
            "events": [event.model_dump() for event in events],
        }

    @app.post("/v1/calibrations/current/save")
    async def save_calibration(body: Confirmation, session: OperatorSession = Depends(limited)):
        current = service.current
        if not current or current["device_id"] != session.device_id:
            raise HTTPException(404, "active calibration not found")
        if not current["review_ready"]:
            raise HTTPException(409, "review calibration before saving")
        try:
            current["gateway"].complete()
        finally:
            if current["owner"]:
                current["owner"].release()
            profile_saved = current["profile_id"]
            service.current = None
        return {"saved": True, "profile_id": profile_saved}

    @app.post("/v1/calibrations/current/cancel")
    async def cancel_calibration(session: OperatorSession = Depends(operator)):
        current = service.current
        if not current or current["device_id"] != session.device_id:
            raise HTTPException(404, "active calibration not found")
        try:
            current["gateway"].cancel()
        finally:
            if current["owner"]:
                current["owner"].release()
            service.current = None
        return {"cancelled": True}

    return app


def main() -> None:
    import uvicorn

    secret_file = Path(os.environ.get("VISTA_HARDWARE_ADAPTER_SESSION_SECRET_FILE", ""))
    if not secret_file.is_file() or secret_file.stat().st_mode & 0o077:
        raise SystemExit("VISTA_HARDWARE_ADAPTER_SESSION_SECRET_FILE must name an owner-only secret file")
    secret = secret_file.read_bytes().strip()
    app = create_app(
        AdapterService(
            issuer=OperatorSessionIssuer(secret),
            lock_root=Path(os.environ.get("VISTA_HARDWARE_LOCK_DIR", "/tmp/vista-hardware-locks")),
        )
    )
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("VISTA_HARDWARE_ADAPTER_PORT", "8771")))
