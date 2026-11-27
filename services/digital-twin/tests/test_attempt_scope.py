"""Attempt/session-bound viewer authorization: per-attempt filtering, isolation, expiry and revocation (all fail closed)."""
import asyncio
import json
from datetime import datetime, timedelta, timezone

from vista_digital_twin.app import create_app
from vista_digital_twin.authorization import TwinAuthorizer

SECRET = "attempt-scope-secret"
ORG, OTHER_ORG, ROBOT, OTHER_ROBOT = "org-1", "org-2", "robot-1", "robot-2"
JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")


def frame(robot, sequence, marker):
    return {"schema_version": 1, "robot_id": robot, "source_mode": "SIMULATION", "controller_id": "r1-fake", "sequence": sequence,
            "measured_at": datetime.now(timezone.utc).isoformat(), "connection": "connected",
            "measured": [{"name": n, "position": marker if n == "shoulder_pan" else 0.0, "unit": "percent" if n == "gripper" else "rad"} for n in JOINTS]}


async def post(app, path, body, token):
    sent = []
    done = False
    async def receive():
        nonlocal done
        if not done:
            done = True
            return {"type": "http.request", "body": json.dumps(body).encode(), "more_body": False}
        await asyncio.Event().wait()
    async def send(message): sent.append(message)
    await app({"type": "http", "method": "POST", "path": path, "raw_path": path.encode(), "query_string": b"", "headers": [(b"authorization", f"Bearer {token}".encode()), (b"content-type", b"application/json")],
               "scheme": "http", "server": ("127.0.0.1", 8000), "client": ("127.0.0.1", 1), "http_version": "1.1"}, receive, send)
    return sent[0]["status"]


class Socket:
    def __init__(self, app, token):
        self.incoming, self.outgoing = asyncio.Queue(), asyncio.Queue()
        self.scope = {"type": "websocket", "path": "/ws/twin", "raw_path": b"/ws/twin", "query_string": b"", "headers": [], "scheme": "ws",
                      "server": ("127.0.0.1", 8000), "client": ("127.0.0.1", 1), "subprotocols": [f"vista.twin.{token}"] if token else [], "extensions": {}}
        self.task = None
        self.app = app

    async def open(self):
        await self.incoming.put({"type": "websocket.connect"})
        self.task = asyncio.create_task(self.app(self.scope, self.incoming.get, self.outgoing.put))

    async def next(self, timeout=2.0):
        return await asyncio.wait_for(self.outgoing.get(), timeout)

    async def close(self):
        self.task.cancel()
        try:
            await self.task
        except asyncio.CancelledError:
            pass


def publisher(auth, org=ORG, robot=ROBOT):
    return auth.issue_simulation_publisher(subject="education-api", organization_id=org, robot_id=robot)


async def seed(app, auth):
    for attempt, marker in (("attempt-A", 0.1), ("attempt-B", 0.9)):
        status = await post(app, "/internal/simulation-telemetry", {"organization_id": ORG, "robot_id": ROBOT, "experiment_id": f"exp-{attempt}", "attempt_id": attempt,
                                                                     "telemetry": frame(ROBOT, 1, marker)}, publisher(auth))
        assert status == 202


def test_each_attempt_sees_only_its_own_frames_and_everything_else_is_refused():
    auth = TwinAuthorizer(SECRET)
    app = create_app(rate_hz=30, authorizer=auth)

    async def run():
        async with app.router.lifespan_context(app):
            await seed(app, auth)
            seen = {}
            for attempt in ("attempt-A", "attempt-B"):
                sock = Socket(app, auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT], attempt_id=attempt))
                await sock.open()
                assert (await sock.next())["type"] == "websocket.accept"
                seen[attempt] = json.loads((await sock.next())["text"])["measured"][0]["position"]
                await sock.close()
            denied = {}
            cases = {
                "robot-wide token (no attempt claim)": auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT]),
                "expired": auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT], attempt_id="attempt-A", expires_at=datetime.now(timezone.utc) - timedelta(seconds=5)),
                "no token": "",
            }
            for label, token in cases.items():
                sock = Socket(app, token)
                await sock.open()
                message = await sock.next()
                denied[label] = (message["type"], message.get("code"))
                await sock.close()
            # valid scopes that match no buffered stream (other attempt / school / robot) are held open but see nothing: no one's frames, no offline fixture
            leaked = {}
            for label, tok in {
                "other attempt": auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT], attempt_id="attempt-C"),
                "other school": auth.issue_viewer(subject="student", organization_id=OTHER_ORG, robot_ids=[ROBOT], attempt_id="attempt-A"),
                "other robot": auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[OTHER_ROBOT], attempt_id="attempt-A"),
            }.items():
                other = Socket(app, tok)
                await other.open()
                assert (await other.next())["type"] == "websocket.accept"
                await asyncio.sleep(0.2)
                got = []
                while not other.outgoing.empty():
                    got.append(await other.next())
                await other.close()
                leaked[label] = [m for m in got if m.get("text") and "measured" in m["text"]]
            assert not any(leaked.values()), leaked
            return seen, denied

    seen, denied = asyncio.run(run())
    assert seen == {"attempt-A": 0.1, "attempt-B": 0.9}  # per-attempt telemetry filtering
    assert all(value == ("websocket.close", 4403) for value in denied.values()), denied


def test_revocation_closes_open_viewers_clears_buffers_and_refuses_new_frames():
    auth = TwinAuthorizer(SECRET)
    app = create_app(rate_hz=30, authorizer=auth)

    async def run():
        async with app.router.lifespan_context(app):
            await seed(app, auth)
            sock = Socket(app, auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT], attempt_id="attempt-A"))
            await sock.open()
            assert (await sock.next())["type"] == "websocket.accept"
            await sock.next()
            wrong = await post(app, "/internal/revoke-attempt", {"organization_id": ORG, "robot_id": ROBOT, "attempt_id": "attempt-A"}, auth.issue_viewer(subject="s", organization_id=ORG, robot_ids=[ROBOT]))
            ok = await post(app, "/internal/revoke-attempt", {"organization_id": ORG, "robot_id": ROBOT, "attempt_id": "attempt-A"}, publisher(auth))
            closing = None
            for _ in range(10):
                message = await sock.next()
                if message["type"] == "websocket.close":
                    closing = message
                    break
            republish = await post(app, "/internal/simulation-telemetry", {"organization_id": ORG, "robot_id": ROBOT, "experiment_id": "exp", "attempt_id": "attempt-A", "telemetry": frame(ROBOT, 2, 0.2)}, publisher(auth))
            other = Socket(app, auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT], attempt_id="attempt-B"))
            await other.open()
            await other.next()
            still_visible = json.loads((await other.next())["text"])["measured"][0]["position"]
            await sock.close(); await other.close()
            return wrong, ok, closing, republish, still_visible

    wrong, ok, closing, republish, still_visible = asyncio.run(run())
    assert wrong == 403 and ok == 202
    assert closing["code"] == 4403 and closing["reason"] == "attempt revoked"
    assert republish == 403  # a revoked attempt can never publish again
    assert still_visible == 0.9  # other attempts are unaffected


def test_accept_selects_the_offered_viewer_subprotocol_so_browsers_do_not_abort_the_handshake():
    auth = TwinAuthorizer(SECRET)
    app = create_app(rate_hz=30, authorizer=auth)
    token = auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT], attempt_id="attempt-A")

    async def run():
        async with app.router.lifespan_context(app):
            await seed(app, auth)
            sock = Socket(app, token)
            await sock.open()
            accept = await sock.next()
            await sock.close()
            return accept

    accept = asyncio.run(run())
    assert accept["type"] == "websocket.accept" and accept["subprotocol"] == f"vista.twin.{token}"


def test_attempt_viewer_receives_its_own_run_frames_and_never_the_offline_fixture():
    """Regression for D-09: the viewer must show the run's relayed telemetry (identity + marker value), not just any non-empty stream."""
    auth = TwinAuthorizer(SECRET)
    app = create_app(rate_hz=30, authorizer=auth)
    token = auth.issue_viewer(subject="student", organization_id=ORG, robot_ids=[ROBOT], attempt_id="attempt-A")

    async def run():
        async with app.router.lifespan_context(app):
            sock = Socket(app, token)
            await sock.open()
            assert (await sock.next())["type"] == "websocket.accept"
            before = []
            await asyncio.sleep(0.2)                           # no run frames yet: nothing may be shown (no mock fallback)
            while not sock.outgoing.empty():
                before.append(await sock.next())
            status = await post(app, "/internal/simulation-telemetry", {"organization_id": ORG, "robot_id": ROBOT, "experiment_id": "exp-A", "attempt_id": "attempt-A",
                                                                         "telemetry": frame(ROBOT, 7, 0.42)}, publisher(auth))
            received = None
            for _ in range(20):
                message = await sock.next()
                if message["type"] == "websocket.send":
                    received = json.loads(message["text"])
                    break
            await sock.close()
            return before, status, received

    before, status, received = asyncio.run(run())
    assert status == 202
    assert all(json.loads(m["text"]).get("controller_id") != "offline-fixture" for m in before if m.get("text") and "measured" in m["text"]), before
    assert received["robot_id"] == ROBOT and received["controller_id"] == "r1-fake" and received["sequence"] == 7
    assert received["measured"][0]["position"] == 0.42
