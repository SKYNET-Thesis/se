"""In-process contract journey from R1/checkik fake follower through Twin ingest to MuJoCo."""
import asyncio
import json
import sys
import threading
import time
from pathlib import Path
from unittest.mock import patch

RUNTIME = Path(__file__).resolve().parents[2] / "robot-runtime" / "src"
CHECKIK = Path(__file__).resolve().parents[3] / "web" / "checkIk"
sys.path.insert(0, str(RUNTIME))
sys.path.insert(0, str(CHECKIK))
from runtime import Runtime
from wf03_command_adapter import FakeFollower, Wf03CommandAdapter
from vista_digital_twin.app import create_app
from vista_digital_twin.authorization import TwinAuthorizer
from test_mujoco_sync import MODEL


class R1AdapterBoundary:
    def __init__(self):
        self.adapter = Wf03CommandAdapter({"mode": "fake_follower", "motionEnabled": True, "latchedMotionLock": False, "ready": True}, FakeFollower())

    def status(self): return self.adapter.status()

    def execute(self, run_id, robot_id, step, timeout_ms):
        return self.adapter.execute(run_id, robot_id, step, threading.Event(), time.monotonic() + timeout_ms / 1000)

    def cancel(self, run_id): self.adapter.cancel(run_id)
    def stop(self, run_id=None): self.adapter.stop(run_id)


async def post(app, body, token):
    sent = []
    async def send(message): sent.append(message)
    sent_request = False
    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type": "http.request", "body": json.dumps(body).encode(), "more_body": False}
        await asyncio.Event().wait()
    await app({"type": "http", "method": "POST", "path": "/internal/simulation-telemetry", "raw_path": b"/internal/simulation-telemetry", "query_string": b"", "headers": [(b"authorization", f"Bearer {token}".encode())], "scheme": "http", "server": ("127.0.0.1", 8000), "client": ("127.0.0.1", 1234), "http_version": "1.1"}, receive, send)
    return sent


def test_r1_fake_run_telemetry_is_authenticated_and_synchronized_to_so101_mujoco():
    checked = R1AdapterBoundary()
    runtime = Runtime({"hardwareEnabled": True, "adapterMode": "fake_follower", "profiles": {"lesson": {"maxWaitMs": 1000, "maxRunMs": 3000}}, "arms": {"left": {"enabled": True, "safeHomeJointDegrees": [0], "gripperOpen": 100, "gripperClosed": 0}}}, checked)
    result = runtime.submit({"runId": "wf03-exp-test", "robotId": "robot-a", "programVersionId": "version-a", "profile": "lesson", "program": {"kind": "robot_program", "schemaVersion": 1, "steps": [{"type": "arm.select", "arm": "left"}, {"type": "home"}, {"type": "gripper.open"}]}})
    deadline = time.time() + 1
    while runtime.get("wf03-exp-test")["state"] not in {"succeeded", "failed"} and time.time() < deadline:
        time.sleep(0.01)
    result = runtime.get("wf03-exp-test")
    assert result["state"] == "succeeded"
    telemetry = result["telemetry"]
    assert telemetry["source_mode"] == "SIMULATION" and telemetry["robot_id"] == "robot-a"

    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    auth = TwinAuthorizer("local-test-secret", clock=lambda: now)
    app = create_app(authorizer=auth, clock=lambda: now)
    publisher = auth.issue_simulation_publisher(subject="education-api", organization_id="org-a", robot_id="robot-a")
    viewer = auth.issue_viewer(subject="student-a", organization_id="org-a", robot_ids=["robot-a"])
    body = {"organization_id": "org-a", "robot_id": "robot-a", "experiment_id": "exp-a", "telemetry": telemetry}

    async def journey():
        with patch.dict("os.environ", {"VISTA_TWIN_MUJOCO_MODEL_PATH": str(MODEL)}):
            accepted = await post(app, body, publisher)
            assert accepted[0]["status"] == 202
            response = json.loads(accepted[-1]["body"])
            assert response["mujoco"] == "synchronized"
            assert set(response["twin"]["applied"]) == {"shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll"}
            rejected = await post(app, dict(body, organization_id="org-b"), publisher)
            assert rejected[0]["status"] == 403
            # The API viewer socket carries only the organization and robot authorized by its short-lived scope.
            incoming, outgoing = asyncio.Queue(), asyncio.Queue()
            await incoming.put({"type": "websocket.connect"})
            ws_scope = {"type": "websocket", "path": "/ws/twin", "raw_path": b"/ws/twin", "query_string": b"", "headers": [], "scheme": "ws", "server": ("127.0.0.1", 8000), "client": ("127.0.0.1", 1234), "subprotocols": [f"vista.twin.{viewer}"], "extensions": {}}
            async with app.router.lifespan_context(app):
                task = asyncio.create_task(app(ws_scope, incoming.get, outgoing.put))
                try:
                    assert (await asyncio.wait_for(outgoing.get(), 2))["type"] == "websocket.accept"
                    frame = await asyncio.wait_for(outgoing.get(), 2)
                    assert json.loads(frame["text"])["robot_id"] == "robot-a"
                    assert json.loads(frame["text"])["source_mode"] == "SIMULATION"
                finally:
                    task.cancel()
                    try: await task
                    except asyncio.CancelledError: pass
    asyncio.run(journey())
