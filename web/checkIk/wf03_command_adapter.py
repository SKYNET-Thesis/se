#!/usr/bin/env python3
"""Private WF-03 CHECKIK command boundary with an explicit fake follower."""

from __future__ import annotations

import argparse
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


class AdapterError(RuntimeError):
    """A sanitized, fail-closed CHECKIK command failure."""


class FakeFollower:
    """Offline-only follower seam. It never imports or opens a hardware driver."""

    def __init__(self) -> None:
        self.commands: list[dict[str, Any]] = []

    def apply(self, step: dict[str, Any]) -> None:
        kind = step.get("type")
        if kind == "arm.select":
            self.commands.append({"type": kind, "arm": step.get("arm")})
        elif kind in {"gripper.open", "gripper.close", "home"}:
            self.commands.append({"type": kind, "arm": step.get("resolvedArm")})
        elif kind == "wait":
            self.commands.append({"type": kind, "durationMs": step.get("durationMs")})
        else:
            raise AdapterError("command_not_supported")


class Wf03CommandAdapter:
    def __init__(self, config: dict[str, Any], follower: FakeFollower) -> None:
        if config.get("mode") != "fake_follower":
            raise AdapterError("adapter_mode_not_supported")
        self.config = dict(config)
        self.follower = follower
        self._cancelled: set[str] = set()

    def status(self) -> dict[str, Any]:
        return {
            "mode": "fake_follower",
            "backend": {
                "motionEnabled": self.config.get("motionEnabled") is True,
                "latchedMotionLock": self.config.get("latchedMotionLock") is True,
            },
            "readiness": {"ready": self.config.get("ready") is True},
        }

    def execute(
        self,
        run_id: str,
        step: dict[str, Any],
        cancel: threading.Event,
        deadline: float,
    ) -> dict[str, Any]:
        snapshot = self.status()
        if snapshot["backend"]["latchedMotionLock"]:
            raise AdapterError("safety_stop_active")
        if not snapshot["backend"]["motionEnabled"]:
            raise AdapterError("motion_not_authorized")
        if not snapshot["readiness"]["ready"]:
            raise AdapterError("follower_not_ready")
        if cancel.is_set() or run_id in self._cancelled:
            raise AdapterError("execution_cancelled")
        if time.monotonic() >= deadline:
            raise AdapterError("execution_timeout")
        duration_ms = step.get("durationMs") if step.get("type") == "wait" else 0
        if isinstance(duration_ms, int) and duration_ms > 0:
            end = time.monotonic() + duration_ms / 1000
            while time.monotonic() < end:
                if cancel.is_set() or run_id in self._cancelled:
                    raise AdapterError("execution_cancelled")
                if time.monotonic() >= deadline:
                    raise AdapterError("execution_timeout")
                time.sleep(min(0.01, end - time.monotonic()))
        self.follower.apply(step)
        return {"ok": True, "command": step.get("type")}

    def cancel(self, run_id: str) -> None:
        self._cancelled.add(run_id)

    def stop(self, run_id: str | None = None) -> None:
        if run_id:
            self._cancelled.add(run_id)
        self.config["latchedMotionLock"] = True
        self.config["motionEnabled"] = False


def make_handler(adapter: Wf03CommandAdapter, token: str):
    class Handler(BaseHTTPRequestHandler):
        def _authorized(self) -> bool:
            return bool(token) and self.headers.get("Authorization") == f"Bearer {token}"

        def _send(self, status: int, value: dict[str, Any]) -> None:
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            if not self._authorized():
                return self._send(401, {"error": "unauthorized"})
            if self.path != "/status":
                return self._send(404, {"error": "not_found"})
            self._send(200, adapter.status())

        def do_POST(self) -> None:  # noqa: N802
            if not self._authorized():
                return self._send(401, {"error": "unauthorized"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                run_id = data.get("runId")
                if self.path == "/execute" and isinstance(run_id, str):
                    timeout_ms = data.get("timeoutMs", 60000)
                    value = adapter.execute(run_id, data.get("step"), threading.Event(), time.monotonic() + timeout_ms / 1000)
                    return self._send(200, value)
                if self.path == "/cancel" and isinstance(run_id, str):
                    adapter.cancel(run_id)
                    return self._send(200, {"ok": True})
                if self.path == "/stop":
                    adapter.stop(run_id if isinstance(run_id, str) else None)
                    return self._send(200, {"ok": True})
                self._send(400, {"error": "request_invalid"})
            except (AdapterError, ValueError, TypeError, json.JSONDecodeError) as error:
                self._send(409, {"error": str(error) if isinstance(error, AdapterError) else "request_invalid"})

        def log_message(self, _format: str, *_args: Any) -> None:
            return

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8016)
    args = parser.parse_args()
    token = os.environ.get("VISTA_CHECKIK_ADAPTER_TOKEN", "")
    if not token:
        raise SystemExit("VISTA_CHECKIK_ADAPTER_TOKEN is required")
    config = {"mode": os.environ.get("VISTA_CHECKIK_MODE", ""), "motionEnabled": True, "latchedMotionLock": False, "ready": True}
    adapter = Wf03CommandAdapter(config, FakeFollower())
    ThreadingHTTPServer((args.host, args.port), make_handler(adapter, token)).serve_forever()


if __name__ == "__main__":
    main()
