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

async def post_path(app, path, body, token):
    sent = []
    async def send(message): sent.append(message)
    sent_request = False
    async def receive():
        nonlocal sent_request
        if not sent_request:
            sent_request = True
            return {"type":"http.request","body":json.dumps(body).encode(),"more_body":False}
        await asyncio.Event().wait()
    await app({"type":"http","method":"POST","path":path,"raw_path":path.encode(),"query_string":b"","headers":[(b"authorization",f"Bearer {token}".encode())],"scheme":"http","server":("127.0.0.1",8000),"client":("127.0.0.1",1234),"http_version":"1.1"}, receive, send)
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

def test_signed_simulation_publisher_accepts_only_ordered_simulation_joint_frames():
    current=[NOW]
    auth=TwinAuthorizer("test-secret", clock=lambda: current[0])
    app=create_app(rate_hz=100,authorizer=auth,clock=lambda:current[0])
    token=auth.issue_simulation_publisher(subject="r1-local",organization_id="org-a",robot_id="robot-a")
    telemetry={"schema_version":1,"robot_id":"robot-a","source_mode":"SIMULATION","controller_id":"checkik-fake-follower","measured_at":NOW.isoformat(),"sequence":1,"connection":"connected","measured":[{"name":name,"position":0,"unit":"percent" if name=="gripper" else "rad"} for name in ("shoulder_pan","shoulder_lift","elbow_flex","wrist_flex","wrist_roll","gripper")]}
    body={"organization_id":"org-a","robot_id":"robot-a","experiment_id":"exp-a","telemetry":telemetry}
    async def run():
        accepted=await post_path(app,"/internal/simulation-telemetry",body,token)
        assert accepted[0]["status"]==202
        assert json.loads(accepted[-1]["body"])["mujoco"]=="model_unconfigured"
        reordered=dict(body,telemetry=dict(telemetry,sequence=0))
        rejected=await post_path(app,"/internal/simulation-telemetry",reordered,token)
        assert rejected[0]["status"]==403
        forged=dict(body,telemetry=dict(telemetry,source_mode="LIVE_PHYSICAL"))
        rejected=await post_path(app,"/internal/simulation-telemetry",forged,token)
        assert rejected[0]["status"]==403
        rejected=await post_path(app,"/internal/simulation-telemetry",body,"bad-token")
        assert rejected[0]["status"]==403
    asyncio.run(run())


# --- physical ingestion authorization and relayed freshness (synthetic fixtures: software contract only, not physical acceptance) ---

def test_physical_route_rejects_wrong_robot_wrong_organization_wrong_owner_and_other_token_kinds():
    current=[NOW]; app, auth=build(current)
    assert (await_post(app, payload(), auth.issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-b")))[0]["status"] == 403      # token for another robot
    assert (await_post(app, payload(), auth.issue_publisher(owner_id="lelab-a", organization_id="org-b", robot_id="so101-a")))[0]["status"] == 403      # cross-tenant token
    assert (await_post(app, payload(), auth.issue_publisher(owner_id="someone-else", organization_id="org-a", robot_id="so101-a")))[0]["status"] == 403  # wrong owner
    assert (await_post(app, payload(), auth.issue_simulation_publisher(subject="education-api", organization_id="org-a", robot_id="so101-a")))[0]["status"] == 403  # simulation token on the physical route
    assert (await_post(app, payload(), auth.issue_viewer(subject="u", organization_id="org-a", robot_ids=["so101-a"])))[0]["status"] == 403              # a viewer token is not a publisher
    wrong = {**payload(), "robot_id": "so101-b"}
    assert (await_post(app, wrong, auth.issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")))[0]["status"] == 403         # payload names another robot


def test_physical_route_rejects_invalid_joint_data():
    current=[NOW]; app, auth=build(current)
    token=auth.issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")
    for bad in ({**OBSERVATION, "elbow_flex.pos": float("nan")}, {**OBSERVATION, "shoulder_pan.pos": 200}, {**OBSERVATION, "gripper.pos": 101}, {k: v for k, v in OBSERVATION.items() if k != "wrist_roll.pos"}, {**OBSERVATION, "gripper.pos": True}):
        assert (await_post(app, {**payload(), "observation": bad}, token))[0]["status"] == 403


def await_post(app, body, token):
    return asyncio.run(post(app, body, token))


def relay_app(current):
    auth = TwinAuthorizer("test-secret", clock=lambda: current[0])
    owner = LeLabFollowerTelemetryAdapter(robot_id="so101-a", organization_id="org-a", owner_id="lelab-a")
    return create_app(rate_hz=100, authorizer=auth, physical_owner=owner, clock=lambda: current[0], relay_stale_after_seconds=3.0, max_measurement_age_seconds=5.0), auth


def test_relayed_physical_frame_is_delivered_connected_with_separate_timing_in_the_heartbeat():
    from datetime import timedelta
    current=[NOW + timedelta(seconds=1.5)]                       # the frame was measured at NOW, the Twin receives it 1.5 s later
    app, auth=relay_app(current)
    publisher=auth.issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")
    viewer=auth.issue_viewer(subject="user-a", organization_id="org-a", robot_ids=["so101-a"])
    async def run():
        assert (await post(app,payload(),publisher))[0]["status"] == 202
        incoming,outgoing=asyncio.Queue(),asyncio.Queue(); await incoming.put({"type":"websocket.connect"})
        scope={"type":"websocket","path":"/ws/twin","raw_path":b"/ws/twin","query_string":b"heartbeat=0.25","headers":[],"scheme":"ws","server":("127.0.0.1",8000),"client":("127.0.0.1",1234),"subprotocols":[f"vista.twin.{viewer}"],"extensions":{}}
        async with app.router.lifespan_context(app):
            task=asyncio.create_task(app(scope,incoming.get,outgoing.put))
            try:
                assert (await asyncio.wait_for(outgoing.get(),2))["type"] == "websocket.accept"
                frame=json.loads((await asyncio.wait_for(outgoing.get(),2))["text"])
                assert frame["source_mode"] == "LIVE_PHYSICAL" and frame["connection"] == "connected"          # 1.5 s old measurement, 0 s since receipt
                assert datetime.fromisoformat(frame["measured_at"].replace("Z", "+00:00")) == NOW                    # the measurement time is never rewritten
                beat=json.loads((await asyncio.wait_for(outgoing.get(),2))["text"])
                assert beat["type"] == "heartbeat" and beat["origin"] == "physical"
                assert beat["timing"]["transport_delay_ms"] == 1500 and beat["timing"]["received_age_ms"] == 0 and beat["timing"]["measurement_age_ms"] == 1500
            finally:
                task.cancel()
                try: await task
                except asyncio.CancelledError: pass
    asyncio.run(run())
