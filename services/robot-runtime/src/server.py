#!/usr/bin/env python3
"""Private loopback HTTP host for the fail-closed VISTA R1 runtime."""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
from runtime import CheckikHttpAdapter, ContractError, Runtime  # noqa: E402


def load_config(path: Path) -> dict:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError("runtime config must be an object")
    return value


class Handler(BaseHTTPRequestHandler):
    runtime: Runtime
    token: str

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def reply(self, status: HTTPStatus, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        value = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(value, dict):
            raise ContractError("request_malformed")
        return value

    def authorized(self) -> bool:
        return bool(self.token) and self.headers.get("Authorization") == f"Bearer {self.token}"

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self.reply(HTTPStatus.OK, {"ok": True, "runtime": "vista-r1"})
        elif self.path == "/status":
            if not self.authorized():
                self.reply(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
                return
            self.reply(HTTPStatus.OK, self.runtime.status())
        elif self.path.startswith("/runs/"):
            if not self.authorized():
                self.reply(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
                return
            run = self.runtime.get(self.path.removeprefix("/runs/"))
            self.reply(HTTPStatus.OK if run else HTTPStatus.NOT_FOUND, run or {"error": "run_not_found"})
        else:
            self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self.authorized():
            self.reply(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return
        try:
            if self.path == "/runs":
                self.reply(HTTPStatus.CREATED, self.runtime.submit(self.body()))
            elif self.path.startswith("/runs/") and self.path.endswith("/cancel"):
                run_id = self.path.removeprefix("/runs/").removesuffix("/cancel").rstrip("/")
                run = self.runtime.cancel_run(run_id)
                self.reply(HTTPStatus.OK if run else HTTPStatus.NOT_FOUND, run or {"error": "run_not_found"})
            elif self.path == "/stop":
                self.runtime.stop()
                self.reply(HTTPStatus.ACCEPTED, self.runtime.status())
            else:
                self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        except ContractError as error:
            self.reply(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except (ValueError, json.JSONDecodeError):
            self.reply(HTTPStatus.BAD_REQUEST, {"error": "request_malformed"})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    adapter = None
    if config.get("adapterMode") == "fake_follower":
        adapter_url = config.get("checkikAdapterUrl")
        adapter_token = os.environ.get("VISTA_CHECKIK_ADAPTER_TOKEN", "")
        if not isinstance(adapter_url, str) or not adapter_url or not adapter_token:
            raise SystemExit("Explicit fake-follower adapter URL and VISTA_CHECKIK_ADAPTER_TOKEN are required")
        adapter = CheckikHttpAdapter(adapter_url, adapter_token)
    Handler.runtime = Runtime(config, adapter)
    Handler.token = os.environ.get("VISTA_RUNTIME_TOKEN", "")
    if not Handler.token:
        raise SystemExit("VISTA_RUNTIME_TOKEN is required")
    host = config.get("bindHost", "127.0.0.1")
    port = config.get("port", 8015)
    server = ThreadingHTTPServer((host, port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
