"""Read-only twin fan-out; physical input is pushed by the existing hardware owner."""

import asyncio
import os
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect

from .authorization import AuthorizationError, TwinAuthorizer
from .mock import LatestState, MockTelemetry, load_fixture
from .physical import LeLabFollowerTelemetryAdapter, TelemetryRejected
from .calibration import VisualCalibrationStore


DEFAULT_FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "so101_joint_states.json"


def create_app(
    *,
    rate_hz: float = 30,
    disconnect_at: int | None = None,
    reconnect_at: int | None = None,
    authorizer: TwinAuthorizer | None = None,
    physical_owner: LeLabFollowerTelemetryAdapter | None = None,
    clock: Callable[[], datetime] | None = None,
) -> FastAPI:
    now = clock or (lambda: datetime.now(timezone.utc))
    source = MockTelemetry(
        load_fixture(DEFAULT_FIXTURE), rate_hz=rate_hz,
        disconnect_at=disconnect_at, reconnect_at=reconnect_at,
    )
    latest = LatestState()
    physical_latest = LatestState()
    auth = authorizer or TwinAuthorizer(None)

    async def produce() -> None:
        while True:
            latest.publish(source.next_state(now()))
            await asyncio.sleep(1 / source.rate_hz)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task = asyncio.create_task(produce())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="VISTA Digital Twin Mock", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "mode": "mock"}

    @app.post("/internal/physical-telemetry", status_code=202)
    async def ingest_physical_telemetry(request: Request) -> dict[str, str | int]:
        """Private publisher endpoint. It owns no follower and accepts no commands."""
        if physical_owner is None:
            raise HTTPException(status_code=404, detail="physical telemetry is not configured")
        authorization = request.headers.get("authorization", "")
        token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise TelemetryRejected("telemetry payload must be an object")
            owner_id, organization_id, robot_id = body.get("owner_id"), body.get("organization_id"), body.get("robot_id")
            if not all(isinstance(value, str) and value for value in (owner_id, organization_id, robot_id)):
                raise TelemetryRejected("telemetry identity is required")
            auth.verify_publisher(token, owner_id=owner_id, organization_id=organization_id, robot_id=robot_id)
            if (owner_id, organization_id, robot_id) != (physical_owner.owner_id, physical_owner.organization_id, physical_owner.robot_id):
                raise TelemetryRejected("publisher is not the configured hardware owner")
            raw_time = body.get("measured_at")
            observation = body.get("observation")
            if not isinstance(raw_time, str) or not isinstance(observation, dict):
                raise TelemetryRejected("measured_at and observation are required")
            measured_at = datetime.fromisoformat(raw_time.replace("Z", "+00:00"))
            state = physical_owner.from_lelab_observation(observation, measured_at=measured_at)
            physical_latest.publish(state)
            return {"status": "accepted", "sequence": state.sequence}
        except (AuthorizationError, TelemetryRejected, ValueError):
            raise HTTPException(status_code=403, detail="physical telemetry rejected") from None

    def viewer_token(websocket: WebSocket) -> str:
        for protocol in websocket.scope.get("subprotocols", []):
            if isinstance(protocol, str) and protocol.startswith("vista.twin."):
                return protocol.removeprefix("vista.twin.")
        return ""

    @app.websocket("/ws/twin")
    async def twin(websocket: WebSocket) -> None:
        physical = physical_latest.latest(now())
        viewer_scope = None
        if physical is not None:
            if physical_owner is None:
                await websocket.close(code=4403)
                return
            try:
                viewer_scope = auth.verify_viewer(viewer_token(websocket), robot_id=physical.robot_id, organization_id=physical_owner.organization_id)
            except AuthorizationError:
                await websocket.close(code=4403)
                return
        await websocket.accept()
        sent_sequence = -1
        try:
            while True:
                current_time = now()
                physical_state = physical_latest.latest(current_time)
                if physical_state is not None and viewer_scope is None:
                    try:
                        viewer_scope = auth.verify_viewer(
                            viewer_token(websocket), robot_id=physical_state.robot_id,
                            organization_id=physical_owner.organization_id if physical_owner else "",
                        )
                    except AuthorizationError:
                        await websocket.close(code=4403, reason="viewer scope required")
                        return
                if viewer_scope is not None and current_time >= viewer_scope.expires_at:
                    await websocket.close(code=4403, reason="viewer scope expired")
                    return
                state = physical_state or latest.latest(current_time)
                if state is not None and state.sequence != sent_sequence:
                    await websocket.send_json(state.model_dump(mode="json", exclude_none=True))
                    sent_sequence = state.sequence
                await asyncio.sleep(1 / source.rate_hz)
        except WebSocketDisconnect:
            return

    return app


def create_app_from_environment() -> FastAPI:
    """Construct a mock-only app unless every physical-owner setting is present."""
    owner_id = os.getenv("VISTA_TWIN_PHYSICAL_OWNER_ID")
    organization_id = os.getenv("VISTA_TWIN_PHYSICAL_ORGANIZATION_ID")
    robot_id = os.getenv("VISTA_TWIN_PHYSICAL_ROBOT_ID")
    follower_id = os.getenv("VISTA_TWIN_PHYSICAL_FOLLOWER_ID")
    auth_secret = os.getenv("VISTA_TWIN_AUTH_SECRET")
    physical_identity = (owner_id, organization_id, robot_id)
    if any(physical_identity) and (not all(physical_identity) or not auth_secret):
        raise RuntimeError("physical telemetry configuration is incomplete")
    owner = None
    authorizer = None
    if auth_secret:
        authorizer = TwinAuthorizer(auth_secret)
    if all(physical_identity):
        profile = None
        if follower_id:
            try:
                profile = VisualCalibrationStore(os.getenv("VISTA_TWIN_CALIBRATION_DIR")).active(robot_id=robot_id, follower_id=follower_id)
            except FileNotFoundError:
                pass
        owner = LeLabFollowerTelemetryAdapter(
            owner_id=owner_id, organization_id=organization_id, robot_id=robot_id, follower_id=follower_id, calibration_profile=profile
        )
    return create_app(
        rate_hz=float(os.getenv("VISTA_TWIN_MOCK_RATE_HZ", "30")),
        disconnect_at=int(os.environ["VISTA_TWIN_MOCK_DISCONNECT_AT"])
        if "VISTA_TWIN_MOCK_DISCONNECT_AT" in os.environ else None,
        reconnect_at=int(os.environ["VISTA_TWIN_MOCK_RECONNECT_AT"])
        if "VISTA_TWIN_MOCK_RECONNECT_AT" in os.environ else None,
        authorizer=authorizer,
        physical_owner=owner,
    )


app = create_app_from_environment()
