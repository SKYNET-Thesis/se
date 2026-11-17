#!/usr/bin/env python3
"""Runtime-role API smoke for a DISPOSABLE loopback database (never Production, never hosted Supabase).

Starts one built Education API (`dist/main.js` of any commit: the current build or an older image's source) twice against the same database — once as the
restricted runtime role `vista_app_runtime`, once as the owner/test credential — then calls every parameter-less GET route as the fixture's admin, instructor
and student and compares the HTTP status codes. A route that answers differently under the runtime role means the role lacks a privilege that build needs
(for example a table outside the frozen allowlist). It is a smoke test, not a proof: parameterised and mutating routes are covered by the Playwright/Jest suites.

Usage: runtime_role_api_smoke.py --api-dir <services/education-api> --runtime-url <url> --owner-url <url> --fixture <json> --jwks-port <54321|54323> [--port 3021]
Tokens come from the local JWKS signer (web/robot-edu/tests/e2e/local-jwks-server.mjs) already running on --jwks-port.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

LOOPBACK = {"127.0.0.1", "localhost", "::1"}


def guard(url: str) -> None:
    parts = urllib.parse.urlsplit(url)
    if parts.hostname not in LOOPBACK or not re.fullmatch(r"/vista_test_[a-z0-9_]+", parts.path):
        sys.exit("refusing: database URLs must be loopback vista_test_* databases")


def routes(api_dir: Path) -> list[str]:
    found = []
    for controller in sorted((api_dir / "src").rglob("*.controller.ts")):
        text = controller.read_text(errors="ignore")
        prefix = re.search(r"@Controller\(\s*[\"']([^\"']*)[\"']", text)
        base = (prefix.group(1) if prefix else "").strip("/")
        for match in re.finditer(r"@Get\(\s*(?:[\"']([^\"']*)[\"'])?\s*\)", text):
            sub = (match.group(1) or "").strip("/")
            path = "/".join(p for p in (base, sub) if p)
            if ":" not in path and "*" not in path:
                found.append("/" + path)
    return sorted(set(found))


def start_api(api_dir: Path, port: int, database_url: str, jwks_port: int, role: str | None) -> subprocess.Popen:
    env = {k: v for k, v in os.environ.items() if k in ("PATH", "HOME", "LANG")}
    env.update(NODE_ENV="development", PORT=str(port), WEB_ORIGIN="http://127.0.0.1:4173", DATABASE_URL=database_url, DIRECT_URL=database_url,
               SUPABASE_URL=f"http://127.0.0.1:{jwks_port}", SUPABASE_JWT_ISSUER=f"http://127.0.0.1:{jwks_port}/auth/v1",
               SUPABASE_JWKS_URL=f"http://127.0.0.1:{jwks_port}/auth/v1/.well-known/jwks.json", SUPABASE_JWT_AUDIENCE="authenticated",
               MQTT_ENABLED="false", VISTA_IOT_ENABLED="false", VISTA_IOT_PUBLISH_RECOVERY_ENABLED="false", VISTA_IOT_FEEDBACK_WORKER_ENABLED="false",
               LEARNING_MEDIA_BUCKET="vista-smoke-unused", AWS_REGION="us-east-1")
    if role:
        env["DATABASE_RUNTIME_ROLE"] = role
    proc = subprocess.Popen(["node", "dist/main.js"], cwd=api_dir, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/v1/health", timeout=2):
                return proc
        except Exception:  # noqa: BLE001
            if proc.poll() is not None:
                sys.exit("the API exited during startup:\n" + (proc.stdout.read().decode(errors="ignore")[-1500:] if proc.stdout else ""))
            time.sleep(1)
    stop(proc)
    sys.exit("the API did not become healthy in 60 s")


def stop(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    except Exception:  # noqa: BLE001
        pass


def token(jwks_port: int, auth_user_id: str) -> str:
    with urllib.request.urlopen(f"http://127.0.0.1:{jwks_port}/token?sub={auth_user_id}", timeout=5) as r:
        return json.load(r)["access_token"]


def status(port: int, path: str, bearer: str | None) -> int:
    request = urllib.request.Request(f"http://127.0.0.1:{port}/api/v1{path}", headers={"Authorization": f"Bearer {bearer}"} if bearer else {})
    try:
        with urllib.request.urlopen(request, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:  # noqa: BLE001
        return -1


def sweep(api_dir: Path, port: int, database_url: str, jwks_port: int, role: str | None, tokens: dict[str, str], paths: list[str]) -> dict[str, dict[str, int]]:
    proc = start_api(api_dir, port, database_url, jwks_port, role)
    try:
        return {who: {p: status(port, p, tok) for p in paths} for who, tok in tokens.items()}
    finally:
        stop(proc)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-dir", type=Path, required=True)
    parser.add_argument("--runtime-url", required=True)
    parser.add_argument("--owner-url", required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--jwks-port", type=int, required=True, choices=[54321, 54323])
    parser.add_argument("--port", type=int, default=3021)
    parser.add_argument("--role-assertion", action="store_true", help="set DATABASE_RUNTIME_ROLE=vista_app_runtime (builds that enforce it)")
    args = parser.parse_args()
    guard(args.runtime_url)
    guard(args.owner_url)
    fixture = json.loads(args.fixture.read_text())
    tokens = {who: token(args.jwks_port, fixture["users"][who]["authUserId"]) for who in ("admin", "instructor", "student")}
    paths = routes(args.api_dir)
    print(f"routes: {len(paths)} parameter-less GET routes x {len(tokens)} users", file=sys.stderr)
    role = "vista_app_runtime" if args.role_assertion else None
    as_runtime = sweep(args.api_dir, args.port, args.runtime_url, args.jwks_port, role, tokens, paths)
    as_owner = sweep(args.api_dir, args.port + 1, args.owner_url, args.jwks_port, None, tokens, paths)
    differing = [(who, p, as_owner[who][p], as_runtime[who][p]) for who in tokens for p in paths if as_owner[who][p] != as_runtime[who][p]]
    server_errors = [(who, p, as_runtime[who][p]) for who in tokens for p in paths if as_runtime[who][p] >= 500 or as_runtime[who][p] < 0]
    summary = {"routes": len(paths), "users": list(tokens), "requests": len(paths) * len(tokens), "statusDifferencesOwnerVsRuntime": len(differing),
               "runtimeRole5xx": len(server_errors), "differing": [list(d) for d in differing[:20]], "runtime5xx": [list(e) for e in server_errors[:20]]}
    print(json.dumps(summary, indent=1))
    return 1 if differing or server_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
