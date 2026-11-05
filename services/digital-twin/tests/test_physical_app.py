import asyncio
import json
from datetime import datetime, timezone
from vista_digital_twin.app import create_app
from vista_digital_twin.authorization import TwinAuthorizer
from vista_digital_twin.physical import LeLabFollowerTelemetryAdapter

NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)
OBSERVATION = {"shoulder_pan.pos": 10, "shoulder_lift.pos": -20, "elbow_flex.pos": 30, "wrist_flex.pos": -10, "wrist_roll.pos": 5, "gripper.pos": 40}

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
    await app({"type":"http","method":"POST","path":"/internal/physical-telemetry","raw_path":b"/internal/physical-telemetry","query_string":b"","headers":[(b"authorization",f"Bearer {token}".encode())],"scheme":"http","server":("127.0.0.1",8000),"client":("127.0.0.1",1234),"http_version":"1.1"}, receive, send)
    return sent

def build(current):
    auth = TwinAuthorizer("test-secret", clock=lambda: current[0])
    owner = LeLabFollowerTelemetryAdapter(robot_id="so101-a", organization_id="org-a", owner_id="lelab-a")
    return create_app(rate_hz=100, authorizer=auth, physical_owner=owner, clock=lambda: current[0]), auth

def payload():
    return {"owner_id":"lelab-a","organization_id":"org-a","robot_id":"so101-a","measured_at":NOW.isoformat(),"observation":OBSERVATION}

def test_only_authorized_hardware_owner_can_publish_measured_state():
    current=[NOW]; app, auth=build(current)
    token=auth.issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")
    async def run():
        assert (await post(app,payload(),token))[0]["status"] == 202
        assert (await post(app,payload(),"bad-token"))[0]["status"] == 403
    asyncio.run(run())

def test_socket_opened_for_mock_closes_before_later_physical_telemetry_without_viewer_scope():
    current=[NOW]; app, auth=build(current)
    publisher=auth.issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")
    async def run():
        incoming,outgoing=asyncio.Queue(),asyncio.Queue(); await incoming.put({"type":"websocket.connect"})
        scope={"type":"websocket","path":"/ws/twin","raw_path":b"/ws/twin","query_string":b"","headers":[],"scheme":"ws","server":("127.0.0.1",8000),"client":("127.0.0.1",1234),"subprotocols":[],"extensions":{}}
        async with app.router.lifespan_context(app):
            task=asyncio.create_task(app(scope,incoming.get,outgoing.put))
            try:
                assert (await asyncio.wait_for(outgoing.get(),2))["type"] == "websocket.accept"
                assert (await asyncio.wait_for(outgoing.get(),2))["type"] == "websocket.send"
                assert (await post(app,payload(),publisher))[0]["status"] == 202
                assert (await asyncio.wait_for(outgoing.get(),2)) == {"type":"websocket.close","code":4403,"reason":"viewer scope required"}
            finally:
                task.cancel()
                try: await task
                except asyncio.CancelledError: pass
    asyncio.run(run())

def test_physical_websocket_closes_when_viewer_scope_expires_after_connecting():
    current=[NOW]; app, auth=build(current)
    publisher=auth.issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")
    viewer=auth.issue_viewer(subject="user-a", organization_id="org-a", robot_ids=["so101-a"])
    async def run():
        assert (await post(app,payload(),publisher))[0]["status"] == 202
        incoming,outgoing=asyncio.Queue(),asyncio.Queue(); await incoming.put({"type":"websocket.connect"})
        scope={"type":"websocket","path":"/ws/twin","raw_path":b"/ws/twin","query_string":b"","headers":[],"scheme":"ws","server":("127.0.0.1",8000),"client":("127.0.0.1",1234),"subprotocols":[f"vista.twin.{viewer}"],"extensions":{}}
        async with app.router.lifespan_context(app):
            task=asyncio.create_task(app(scope,incoming.get,outgoing.put))
            try:
                assert (await asyncio.wait_for(outgoing.get(),2))["type"] == "websocket.accept"
                assert (await asyncio.wait_for(outgoing.get(),2))["type"] == "websocket.send"
                current[0]=NOW.replace(minute=6)
                assert (await asyncio.wait_for(outgoing.get(),2)) == {"type":"websocket.close","code":4403,"reason":"viewer scope expired"}
            finally:
                task.cancel()
                try: await task
                except asyncio.CancelledError: pass
    asyncio.run(run())
