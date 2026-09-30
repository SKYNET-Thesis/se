"""HTTP/WebSocket relay between the Quest browser and the control loop.

Serves the WebXR page, receives controller frames over a WebSocket, and publishes the
robot's camera frames back as MJPEG streams that the page draws as world-locked panels.

Runs its own asyncio loop on a background thread so the control loop stays a plain
synchronous 30 Hz loop — the same shape as the existing screen panel in RobotBuild. The
loop never awaits anything; it only reads snapshots and drops frames into this relay.
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
import ssl
import threading
import time
from importlib.resources import files
from typing import Any, Callable
from urllib.request import Request, urlopen

import numpy as np
from aiohttp import WSMsgType, web

from .config import RelayConfig
from .phone import PhoneDisable, PhoneHello, PhonePose, PhoneRecenter, parse_phone_message
from .state import XRState

logger = logging.getLogger(__name__)

_BOUNDARY = "lekiwiframe"

# Extension -> (content type, charset). Binary assets must not carry a charset.
_CONTENT_TYPES: dict[str, tuple[str, str | None]] = {
    "js": ("application/javascript", "utf-8"),
    "json": ("application/manifest+json", "utf-8"),
    "png": ("image/png", None),
}


class Relay:
    """Background aiohttp server feeding :class:`XRState` and serving camera panels."""

    def __init__(
        self,
        config: RelayConfig,
        state: XRState,
        status_provider: Callable[[], dict[str, Any]] | None = None,
    ):
        self.config = config
        self.state = state
        self._status_provider = status_provider
        self._frames: dict[str, np.ndarray] = {}
        self._frame_seq: dict[str, int] = {}
        self._frames_lock = threading.Lock()
        self._telemetry: dict[str, Any] = {}
        self.page_error: str | None = None
        self._telemetry_at: float | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._runner: web.AppRunner | None = None
        self._ready = threading.Event()
        self._startup_error: BaseException | None = None
        self._relay_state = "stopped"

    # ---------------------------------------------------------------- lifecycle

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            raise RuntimeError("Relay is already running")
        self._relay_state = "starting"
        self._thread = threading.Thread(target=self._run, name="lekiwi-vr-relay", daemon=True)
        self._thread.start()
        if not self._ready.wait(timeout=10):
            raise RuntimeError("Relay failed to start within 10 s")
        # Surface a bind failure (port already taken, unreadable certificate) as itself,
        # on the caller's thread, instead of letting the loop start against a dead server.
        if self._startup_error is not None:
            raise self._startup_error

    def stop(self) -> None:
        if self._loop is None or not self._loop.is_running():
            self._relay_state = "stopped"
            return
        asyncio.run_coroutine_threadsafe(self._shutdown(), self._loop)
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._relay_state = "stopped"

    def health_check(self) -> dict[str, Any]:
        """Verify the HTTPS status route through the same URL the operator uses."""
        request = Request(f"{self.url}/api/status", method="GET")
        tls = ssl._create_unverified_context() if self.config.cert_file else None
        with urlopen(request, context=tls, timeout=2) as response:  # noqa: S310 - local relay
            if response.status != 200:
                raise RuntimeError(f"relay health returned HTTP {response.status}")
            payload = json.loads(response.read())
        if not isinstance(payload, dict):
            raise RuntimeError("relay health returned a non-object payload")
        return payload

    async def _shutdown(self) -> None:
        if self._runner is not None:
            await self._runner.cleanup()
        assert self._loop is not None
        self._loop.stop()

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._serve())
        except BaseException as exc:  # noqa: BLE001 - handed to start() verbatim
            self._startup_error = exc
            self._relay_state = "failed"
            self._ready.set()
            self._loop.close()
            return
        self._relay_state = "listening"
        self._ready.set()
        try:
            self._loop.run_forever()
        finally:
            self._loop.close()

    async def _serve(self) -> None:
        app = web.Application()
        app.router.add_get("/", self._handle_index)
        app.router.add_get("/ws", self._handle_ws)
        app.router.add_get("/api/status", self._handle_status)
        app.router.add_post("/api/stop", self._handle_stop)
        app.router.add_post("/api/resume", self._handle_resume)
        app.router.add_get("/camera/{name}", self._handle_camera)
        # Static assets of the web app. Listed explicitly rather than served from a
        # directory: this process is reachable from the LAN, and an open static route is
        # how a control panel accidentally becomes a file server.
        for name in ("app.js", "arm3d.js", "sw.js", "manifest.json", "icon-192.png", "icon-512.png"):
            app.router.add_get(f"/{name}", self._make_static_handler(name))
        self._runner = web.AppRunner(app, access_log=None)
        await self._runner.setup()
        site = web.TCPSite(
            self._runner, self.config.host, self.config.port, ssl_context=self._ssl_context()
        )
        await site.start()
        logger.info("Relay listening on %s", self.url)

    def _ssl_context(self) -> ssl.SSLContext | None:
        if self.config.cert_file is None or self.config.key_file is None:
            return None
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(self.config.cert_file), str(self.config.key_file))
        return context

    @property
    def url(self) -> str:
        scheme = "https" if self.config.cert_file else "http"
        return f"{scheme}://{self.config.host}:{self.config.port}"

    @property
    def operator_url(self) -> str:
        """Reachable URL for another device; 0.0.0.0 itself is not a destination."""
        host = self.config.host
        if host == "0.0.0.0":
            probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                # UDP connect selects the active route without sending a packet.
                probe.connect(("1.1.1.1", 80))
                host = probe.getsockname()[0]
            except OSError:
                host = socket.gethostbyname(socket.gethostname())
            finally:
                probe.close()
        scheme = "https" if self.config.cert_file else "http"
        return f"{scheme}://{host}:{self.config.port}"

    # ---------------------------------------------------------------- publishing

    def publish_cameras(self, observation: dict[str, Any]) -> None:
        """Store the latest camera frames. Cheap: no encoding happens here.

        The frame is copied and stamped with a sequence number. Both matter: the decoder
        upstream reuses one buffer per camera, so the array object's identity never
        changes (a freshness check based on it sees one frame forever, and the picture
        freezes) and its contents mutate underneath a slow encode.
        """
        latest = {}
        for key in self.config.camera_keys:
            frame = observation.get(key)
            if isinstance(frame, np.ndarray) and frame.ndim == 3:
                latest[key] = frame.copy()
        if latest:
            with self._frames_lock:
                for key, frame in latest.items():
                    self._frames[key] = frame
                    self._frame_seq[key] = self._frame_seq.get(key, 0) + 1

    def publish_telemetry(self, telemetry: dict[str, Any]) -> None:
        """Store the per-tick loop state shown in the VR panel and the 2D page."""
        self._telemetry = telemetry
        self._telemetry_at = time.monotonic()

    def _telemetry_age_s(self) -> float | None:
        """Seconds since the control loop last completed a tick.

        Computed here, in the relay thread, precisely because the loop may be BLOCKED
        rather than erroring: when the Pi disappeared mid-session, get_observation stopped
        returning without raising, so the loop's own error path never ran and the panel
        kept showing the last joint angles under "robot connected". Nothing in a report
        produced by the stalled loop itself can reveal that; only an independent clock can.
        """
        if self._telemetry_at is None:
            return None
        return time.monotonic() - self._telemetry_at

    # ---------------------------------------------------------------- handlers

    async def _handle_index(self, _request: web.Request) -> web.Response:
        return web.Response(
            body=(files("lekiwi_vr_teleop.web") / "index.html").read_bytes(),
            content_type="text/html",
            charset="utf-8",
        )

    async def _handle_stop(self, _request: web.Request) -> web.Response:
        self.state.trigger_stop()
        return web.json_response({"stopped": True})

    async def _handle_resume(self, _request: web.Request) -> web.Response:
        self.state.clear_stop()
        return web.json_response({"stopped": False})

    def _make_static_handler(self, name: str):
        content_type, charset = _CONTENT_TYPES[name.rsplit(".", 1)[-1]]

        async def handler(_request: web.Request) -> web.Response:
            response = web.Response(
                body=(files("lekiwi_vr_teleop.web") / name).read_bytes(),
                content_type=content_type,
                charset=charset,
            )
            # The panel is edited and reloaded constantly during bring-up, and a cached
            # app.js would hide a safety change behind a stale copy.
            response.headers["Cache-Control"] = "no-store"
            return response

        return handler

    async def _handle_status(self, _request: web.Request) -> web.Response:
        return web.json_response(
            {
                **self._status_payload(),
                **self.state.status(),
                "telemetry": self._telemetry,
                "telemetryAgeS": self._telemetry_age_s(),
                "pageError": self.page_error,
            }
        )

    def _status_payload(self) -> dict[str, Any]:
        payload = {
            "processState": "unknown",
            "relayState": self._relay_state,
            "mode": "unknown",
            "activeArms": [],
        }
        if self._status_provider is not None:
            payload.update(self._status_provider())
        payload["relayState"] = self._relay_state
        return payload

    async def _handle_ws(self, request: web.Request) -> web.WebSocketResponse:
        ws = web.WebSocketResponse(heartbeat=5.0)
        await ws.prepare(request)
        logger.info("Headset connected from %s", request.remote)
        status_task = asyncio.create_task(self._push_status(ws))
        connection_kind = "unknown"
        try:
            async for msg in ws:
                if msg.type is not WSMsgType.TEXT:
                    continue
                try:
                    payload = json.loads(msg.data)
                except json.JSONDecodeError:
                    continue
                if connection_kind == "unknown" and payload.get("type") == "hello":
                    try:
                        hello = parse_phone_message(json.dumps(payload))
                    except ValueError:
                        continue
                    if not isinstance(hello, PhoneHello) or hello.arm != self.config.phone_hand:
                        await ws.send_json({"type": "error", "code": "arm_mismatch", "message": f"worker expects {self.config.phone_hand} phone arm"})
                        await ws.close(code=1008)
                        break
                    if not self.state.start_phone_session(hello.sessionId, self.config.phone_hand):
                        await ws.send_json({"type": "error", "code": "ownership_conflict", "message": "another teleoperation session owns this arm"})
                        await ws.close(code=1008)
                        break
                    connection_kind = "phone"
                    await ws.send_json({"type": "hello_ack", "protocolVersion": 1, "sessionId": hello.sessionId, "arm": self.config.phone_hand})
                    continue
                if connection_kind == "phone":
                    try:
                        phone_message = parse_phone_message(json.dumps(payload))
                    except ValueError as exc:
                        await ws.send_json({"type": "error", "code": "invalid_phone_message", "message": str(exc)})
                        continue
                    if isinstance(phone_message, PhonePose):
                        try:
                            accepted = self.state.update_from_phone(phone_message)
                        except ValueError as exc:
                            await ws.send_json({"type": "error", "code": "stale_phone_sequence", "message": str(exc)})
                            continue
                        if accepted:
                            await ws.send_json({"type": "phone_status", "trackingState": phone_message.trackingState, "enabled": phone_message.enabled, "sequence": phone_message.sequence})
                    elif isinstance(phone_message, PhoneDisable):
                        self.state.phone_recenter()
                        await ws.send_json({"type": "phone_status", "enabled": False})
                    elif isinstance(phone_message, PhoneRecenter):
                        self.state.phone_recenter()
                        await ws.send_json({"type": "recenter_ack", "protocolVersion": 1})
                    continue
                if payload.get("type") == "ping":
                    # Echoed so the page can measure the real round trip; the number in
                    # the panel is what tells the operator whether Wi-Fi is misbehaving.
                    await ws.send_json({"type": "pong", "t": payload.get("t")})
                    continue
                self._on_message(payload)
        finally:
            status_task.cancel()
            # A dropped socket is indistinguishable from a headset that froze: treat it as
            # "no operator" so the loop stops the base and holds the arm.
            if connection_kind == "phone":
                self.state.phone_disconnected()
            else:
                self.state.set_session_active(False)
            logger.info("Headset disconnected")
        return ws

    def _on_message(self, payload: dict) -> None:
        kind = payload.get("type")
        if kind == "pose":
            self.state.update_from_page(payload)
        elif kind == "stop":
            logger.warning("STOP pressed in the headset")
            self.state.trigger_stop()
        elif kind == "resume":
            logger.info("STOP cleared by the operator")
            self.state.clear_stop()
        elif kind == "session":
            self.state.set_session_active(bool(payload.get("active", False)))
        elif kind == "diag":
            logger.warning(
                "Session diagnostics: %s",
                ", ".join(f"{k}={v}" for k, v in payload.items() if k != "type"),
            )
        elif kind == "error":
            # The headset has no console; this is the only way a page-side exception
            # becomes visible to whoever is running the loop.
            self.page_error = str(payload.get("message", ""))
            logger.error("Page error: %s", self.page_error)
            if payload.get("stack"):
                logger.error("  %s", payload["stack"])

    async def _push_status(self, ws: web.WebSocketResponse) -> None:
        """Send loop telemetry to the page ~10 times a second."""
        try:
            while not ws.closed:
                await ws.send_json(
                    {
                        "type": "status",
                        "serverTime": time.time(),
                        **self.state.status(),
                        "telemetry": self._telemetry,
                        "telemetryAgeS": self._telemetry_age_s(),
                    }
                )
                await asyncio.sleep(0.1)
        except (asyncio.CancelledError, ConnectionResetError):
            pass

    async def _handle_camera(self, request: web.Request) -> web.StreamResponse:
        name = request.match_info["name"]
        if name not in self.config.camera_keys:
            raise web.HTTPNotFound()

        response = web.StreamResponse(
            headers={
                "Content-Type": f"multipart/x-mixed-replace; boundary={_BOUNDARY}",
                "Cache-Control": "no-store",
            }
        )
        await response.prepare(request)
        last_sent: int | None = None
        try:
            while True:
                with self._frames_lock:
                    frame = self._frames.get(name)
                    seq = self._frame_seq.get(name)
                # Encoding runs only while a panel is actually watching, and only for a
                # frame this connection has not sent yet.
                if frame is not None and seq != last_sent:
                    last_sent = seq
                    jpeg = self._encode(frame)
                    if jpeg is not None:
                        await response.write(
                            b"--" + _BOUNDARY.encode() + b"\r\n"
                            b"Content-Type: image/jpeg\r\n"
                            b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n"
                        )
                await asyncio.sleep(1 / 30)
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        return response

    def _encode(self, frame: np.ndarray) -> bytes | None:
        import cv2

        # LeRobot cameras hand out RGB; cv2 encodes BGR.
        bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        ok, buffer = cv2.imencode(
            ".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), self.config.jpeg_quality]
        )
        return buffer.tobytes() if ok else None
