"""Read-only twin fan-out; physical input is pushed by the existing hardware owner."""

import asyncio
import os
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect

from .authorization import AuthorizationError, TwinAuthorizer
from .mock import LatestState, MockTelemetry, load_fixture
from .physical import LeLabFollowerTelemetryAdapter, TelemetryRejected
from .calibration import VisualCalibrationStore
from .contracts import JointState, SourceMode
from .mujoco_sync import synchronize_simulation_state


DEFAULT_FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "so101_joint_states.json"


HEARTBEAT_MIN_SECONDS, HEARTBEAT_MAX_SECONDS = 0.25, 10.0


def heartbeat_interval(query_string: bytes) -> float | None:
    """Opt-in keepalive: `?heartbeat=<seconds>` (clamped). Clients that do not ask never see a heartbeat frame."""
    values = parse_qs(query_string.decode("latin-1")).get("heartbeat")
    if not values:
        return None
    try:
        seconds = float(values[0])
    except ValueError:
        return None
    if seconds != seconds or seconds in (float("inf"), float("-inf")):
        return None
    return min(HEARTBEAT_MAX_SECONDS, max(HEARTBEAT_MIN_SECONDS, seconds))


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
    simulation_latest: dict[str, LatestState] = {}
    simulation_organizations: dict[str, str] = {}
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

    @app.post("/internal/simulation-telemetry", status_code=202)
    async def ingest_simulation_telemetry(request: Request) -> dict[str, object]:
        """Accepts only signed, short-lived R1 simulation telemetry; owns no robot control."""
        try:
            token = request.headers.get("authorization", "")
            token = token.removeprefix("Bearer ") if token.startswith("Bearer ") else ""
            body = await request.json()
            if not isinstance(body, dict) or not all(isinstance(body.get(key), str) and body[key] for key in ("organization_id", "robot_id", "experiment_id")):
                raise TelemetryRejected("simulation identity is required")
            org, robot = body["organization_id"], body["robot_id"]
            auth.verify_simulation_publisher(token, robot_id=robot, organization_id=org)
            state = JointState.model_validate(body.get("telemetry"))
            if state.source_mode is not SourceMode.SIMULATION or state.robot_id != robot:
                raise TelemetryRejected("simulation telemetry identity mismatch")
            slot = simulation_latest.setdefault(robot, LatestState())
            previous = slot.latest(now())
            if previous is not None and previous.sequence == state.sequence and previous.model_dump(mode="json") == state.model_dump(mode="json"):
                return {"status": "accepted", "sequence": state.sequence, "mujoco": "duplicate_unchanged"}
            if not slot.publish(state):
                raise TelemetryRejected("out-of-order telemetry")
            simulation_organizations[robot] = org
            model_path = os.getenv("VISTA_TWIN_MUJOCO_MODEL_PATH")
            twin = None
            if model_path:
                try:
                    twin = synchronize_simulation_state(state, model_path)
                except (OSError, RuntimeError, ValueError):
                    return {"status": "accepted", "sequence": state.sequence, "mujoco": "unavailable", "twin": None}
            return {"status": "accepted", "sequence": state.sequence, "mujoco": "synchronized" if twin else "model_unconfigured", "twin": twin}
        except (AuthorizationError, TelemetryRejected, ValueError, TypeError):
            raise HTTPException(status_code=403, detail="simulation telemetry rejected") from None

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
        if physical is None:
            for robot, slot in simulation_latest.items():
                candidate = slot.latest(now())
                if candidate is not None:
                    try:
                        viewer_scope = auth.verify_viewer(viewer_token(websocket), robot_id=robot, organization_id=simulation_organizations[robot])
                        break
                    except AuthorizationError:
                        continue
            if simulation_latest and viewer_scope is None:
                await websocket.close(code=4403, reason="viewer scope required")
                return
        await websocket.accept()
        sent_sequence = -1
        interval = heartbeat_interval(websocket.scope.get("query_string", b""))
        loop = asyncio.get_running_loop()
        last_sent = loop.time()
        tick = 1 / source.rate_hz if interval is None else min(1 / source.rate_hz, interval / 2)
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
                if viewer_scope is None:
                    for robot, slot in simulation_latest.items():
                        if slot.latest(current_time) is not None:
                            try:
                                viewer_scope = auth.verify_viewer(viewer_token(websocket), robot_id=robot, organization_id=simulation_organizations[robot])
                                break
                            except AuthorizationError:
                                continue
                    if simulation_latest and viewer_scope is None:
                        await websocket.close(code=4403, reason="viewer scope required")
                        return
                if viewer_scope is not None and current_time >= viewer_scope.expires_at:
                    await websocket.close(code=4403, reason="viewer scope expired")
                    return
                simulation_state = None
                if viewer_scope is not None and viewer_scope.kind == "viewer":
                    for robot in viewer_scope.robot_ids:
                        slot = simulation_latest.get(robot)
                        if slot is not None and simulation_organizations.get(robot) == viewer_scope.organization_id:
                            simulation_state = slot.latest(current_time)
                            if simulation_state is not None:
                                break
                state = physical_state or simulation_state or latest.latest(current_time)
                if state is not None and state.sequence != sent_sequence:
                    await websocket.send_json(state.model_dump(mode="json", exclude_none=True))
                    sent_sequence = state.sequence
                    last_sent = loop.time()
                elif interval is not None and loop.time() - last_sent >= interval:
                    # Idle keepalive for opted-in clients: it carries the server's own freshness verdict and the telemetry
                    # origin, so a viewer can tell "healthy but idle", "stale" and "dead connection" apart.
                    origin = "physical" if physical_state is not None else "simulation" if simulation_state is not None else "mock"
                    await websocket.send_json({
                        "type": "heartbeat", "schema_version": 1, "server_time": current_time.isoformat(), "origin": origin,
                        "source_mode": state.source_mode.value if state else None, "robot_id": state.robot_id if state else None,
                        "sequence": state.sequence if state else None, "connection": state.connection if state else "disconnected",
                        "age_ms": max(0, int((current_time - state.measured_at).total_seconds() * 1000)) if state else None,
                    })
                    last_sent = loop.time()
                await asyncio.sleep(tick)
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
