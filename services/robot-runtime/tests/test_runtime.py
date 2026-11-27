import sys
from pathlib import Path
import json
import unittest
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from runtime import CheckikHttpAdapter, Runtime
from iot import IotBridge


def config():
    return {"hardwareEnabled": False, "profiles": {"lesson": {"maxWaitMs": 60000, "maxRunMs": 1000}}, "arms": {}}


class FakeCheckikAdapter:
    def __init__(self, status=None):
        self.snapshot = status or {"mode": "fake_follower", "backend": {"motionEnabled": True, "latchedMotionLock": False}, "readiness": {"ready": True}}
        self.commands = []
        self.cancelled = []

    def status(self):
        return self.snapshot

    def execute(self, run_id, robot_id, step, timeout_ms):
        self.commands.append((run_id, robot_id, step, timeout_ms))
        return {"ok": True}

    def cancel(self, run_id):
        self.cancelled.append(run_id)

    def stop(self, run_id=None):
        self.cancelled.append(run_id or "all")


def program(steps):
    return {"runId": "run-1", "robotId": "robot-a", "programVersionId": "version-1", "profile": "lesson", "program": {"kind": "robot_program", "schemaVersion": 1, "steps": steps}}


class RuntimeContractTests(unittest.TestCase):
    def test_http_adapter_allows_the_command_deadline_to_exceed_transport_default(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_args): return None
            def read(self): return b'{"ok":true}'
        with patch("runtime.urlopen", return_value=Response()) as request:
            CheckikHttpAdapter("http://127.0.0.1:8016", "token").execute("run-1", "robot-a", {"type": "wait", "durationMs": 3000}, 3500)
        self.assertGreaterEqual(request.call_args.kwargs["timeout"], 3.5)

    def test_rejects_hardware_before_any_execution(self):
        runtime = Runtime(config())
        result = runtime.submit(program([{"type": "arm.select", "arm": "left"}, {"type": "gripper.open"}]))
        self.assertEqual(result["state"], "preflight_failed")
        self.assertEqual(result["errorCode"], "hardware_not_commissioned")

    def test_rejects_missing_arm_context(self):
        runtime = Runtime(config())
        with self.assertRaisesRegex(ValueError, "arm_context_missing"):
            runtime.submit(program([{"type": "home"}]))

    def test_rejects_unsupported_motion(self):
        runtime = Runtime(config())
        with self.assertRaisesRegex(ValueError, "program_step_not_allowed"):
            runtime.submit(program([{"type": "move.cartesian"}]))

    def test_rejects_wait_above_profile_limit(self):
        runtime = Runtime(config())
        with self.assertRaisesRegex(ValueError, "wait_duration_invalid"):
            runtime.submit(program([{"type": "wait", "durationMs": 60001}]))

    def test_explicit_fake_adapter_executes_canonical_sequence(self):
        checked = FakeCheckikAdapter()
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "fake_follower", "arms": {"left": {"enabled": True, "gripperOpen": 100, "gripperClosed": 0}}}
        runtime = Runtime(cfg, checked)
        first = runtime.submit(program([{"type": "arm.select", "arm": "left"}, {"type": "gripper.open"}, {"type": "wait", "durationMs": 1}, {"type": "gripper.close"}]))
        self.assertIn(first["state"], {"queued", "running", "succeeded"})
        deadline = time.time() + 1
        while runtime.get("run-1")["state"] not in {"succeeded", "failed"} and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(runtime.get("run-1")["state"], "succeeded")
        self.assertEqual([step[2]["type"] for step in checked.commands], ["arm.select", "gripper.open", "wait", "gripper.close"])

    def test_same_run_id_is_idempotent_and_does_not_execute_twice(self):
        checked = FakeCheckikAdapter()
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "fake_follower"}
        runtime = Runtime(cfg, checked)
        request = program([{"type": "wait", "durationMs": 20}])
        runtime.submit(request)
        runtime.submit(request)
        deadline = time.time() + 1
        while runtime.get("run-1")["state"] not in {"succeeded", "failed"} and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(len(checked.commands), 1)

    def test_same_run_id_rejects_a_different_immutable_payload(self):
        checked = FakeCheckikAdapter()
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "fake_follower"}
        runtime = Runtime(cfg, checked)
        runtime.submit(program([{"type": "wait", "durationMs": 20}]))
        changed = program([{"type": "wait", "durationMs": 21}])
        with self.assertRaisesRegex(ValueError, "run_identity_conflict"):
            runtime.submit(changed)

    def test_adapter_false_success_fails_the_run(self):
        class RejectingAdapter(FakeCheckikAdapter):
            def execute(self, run_id, robot_id, step, timeout_ms): return {"ok": False}
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "fake_follower"}
        runtime = Runtime(cfg, RejectingAdapter())
        runtime.submit(program([{"type": "wait", "durationMs": 1}]))
        deadline = time.time() + 1
        while runtime.get("run-1")["state"] not in {"failed", "succeeded"} and time.time() < deadline: time.sleep(0.01)
        self.assertEqual(runtime.get("run-1")["state"], "failed")

    def test_runtime_stop_delegates_to_checkik(self):
        checked = FakeCheckikAdapter()
        runtime = Runtime(config(), checked)
        runtime.stop()
        self.assertEqual(checked.cancelled, ["all"])

    def test_rejects_missing_or_non_fake_adapter_mode(self):
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "real"}
        result = Runtime(cfg, FakeCheckikAdapter()).submit(program([{"type": "wait", "durationMs": 1}]))
        self.assertEqual((result["state"], result["errorCode"]), ("preflight_failed", "adapter_mode_not_supported"))

    def test_cancel_is_delegated_to_checked_adapter(self):
        class BlockingAdapter(FakeCheckikAdapter):
            def execute(self, run_id, robot_id, step, timeout_ms):
                time.sleep(0.05)
                raise RuntimeError("adapter reports cooperative cancellation")
        checked = BlockingAdapter()
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "fake_follower"}
        runtime = Runtime(cfg, checked)
        runtime.submit(program([{"type": "wait", "durationMs": 100}]))
        runtime.cancel_run("run-1")
        self.assertEqual(checked.cancelled, ["run-1"])
        deadline = time.time() + 1
        while runtime.get("run-1")["state"] not in {"cancelled", "failed"} and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(runtime.get("run-1")["state"], "cancelled")

    def test_whole_run_timeout_is_terminal_and_sanitized(self):
        class SlowAdapter(FakeCheckikAdapter):
            def execute(self, run_id, robot_id, step, timeout_ms):
                raise TimeoutError("private detail")
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "fake_follower"}
        runtime = Runtime(cfg, SlowAdapter())
        runtime.submit(program([{"type": "wait", "durationMs": 1}]))
        deadline = time.time() + 1
        while runtime.get("run-1")["state"] not in {"failed", "succeeded"} and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(runtime.get("run-1")["errorCode"], "runtime_execution_timeout")


class IotBridgeTests(unittest.TestCase):
    def test_rejects_expired_or_replayed_commands_without_executing_runtime(self):
        class FakeRuntime:
            def __init__(self): self.submissions = []
            def submit(self, value): self.submissions.append(value); return {"state": "queued"}
            def status(self): return {"hardwareEnabled": False, "stopped": False}
        bridge = IotBridge({"thingName": "vista-demo-so101-001", "topicPrefix": "vista/demo/robots/so101-001"}, FakeRuntime(), clock=lambda: 1000)
        expired = {"schemaVersion": 1, "commandId": "c-1", "robotId": "vista-demo-so101-001", "sequence": 1, "expiresAtMs": 999, "kind": "run", "payload": {}}
        bridge.handle_command(expired)
        replay = expired | {"commandId": "c-2", "expiresAtMs": 1001}
        bridge.handle_command(replay)
        self.assertEqual([item["status"] for item in bridge.acks], ["rejected", "accepted"])
        self.assertEqual(len(bridge.runtime.submissions), 1)

    def test_publishes_ack_status_and_fake_telemetry_without_hardware(self):
        class FakeRuntime:
            def submit(self, _value): return {"state": "preflight_failed", "errorCode": "hardware_not_commissioned"}
            def status(self): return {"hardwareEnabled": False, "stopped": False}
        bridge = IotBridge({"thingName": "vista-demo-so101-001", "topicPrefix": "vista/demo/robots/so101-001", "fakeRobot": True}, FakeRuntime(), clock=lambda: 1000)
        bridge.handle_command({"schemaVersion": 1, "commandId": "c-1", "robotId": "vista-demo-so101-001", "sequence": 1, "expiresAtMs": 1001, "kind": "run", "payload": {}})
        published = bridge.drain_publications()
        self.assertEqual({topic.rsplit("/", 1)[-1] for topic, _ in published}, {"ack", "status", "telemetry"})
        self.assertFalse(next(value for topic, value in published if topic.endswith("/status"))["hardwareEnabled"])

    def test_deduplicates_redelivery_by_command_id(self):
        class FakeRuntime:
            def __init__(self): self.submissions = []
            def submit(self, value): self.submissions.append(value); return {"state": "queued"}
            def status(self): return {"hardwareEnabled": False, "stopped": False}
        bridge = IotBridge({"thingName": "vista-demo-so101-001", "topicPrefix": "vista/demo/robots/so101-001"}, FakeRuntime(), clock=lambda: 1000)
        command = {"schemaVersion": 1, "commandId": "stable-command", "robotId": "vista-demo-so101-001", "sequence": 1, "expiresAtMs": 1001, "kind": "run", "payload": {}}
        bridge.handle_command(command)
        bridge.handle_command(command)
        self.assertEqual(len(bridge.runtime.submissions), 1)
        self.assertEqual([item["status"] for item in bridge.acks], ["accepted", "accepted"])

    def test_reports_device_shadow_state_without_touching_the_existing_topics(self):
        class FakeRuntime:
            config = {"adapterMode": "fake_follower"}
            def submit(self, _value): return {"state": "queued"}
            def status(self): return {"hardwareEnabled": True, "stopped": False, "activeRunId": "run-1", "checkik": {"token": "must-not-leak"}}
        bridge = IotBridge({"thingName": "vista-demo-so101-001", "topicPrefix": "vista/demo/robots/so101-001"}, FakeRuntime(), clock=lambda: 1000)
        bridge.publish_state()
        self.assertEqual({topic.rsplit("/", 1)[-1] for topic, _ in bridge.drain_publications()}, {"status"})      # the command/feedback topics are unchanged
        (topic, payload), = bridge.drain_shadow_publications()
        self.assertEqual(topic, "$aws/things/vista-demo-so101-001/shadow/update")
        reported = payload["state"]["reported"]
        self.assertEqual(reported["runtimeKind"], "MOCK_RUNTIME")                                                  # a fake follower is never labelled physical
        self.assertEqual((reported["connection"], reported["hardwareEnabled"], reported["stopped"], reported["activeRunId"]), ("disconnected", False, False, "run-1"))   # no physical hardware: never claimed, whatever the runtime switch says
        self.assertEqual((reported["adapterMode"], reported["armed"], reported["calibrationReady"], reported["fault"]), ("fake_follower", False, False, None))
        self.assertNotIn("must-not-leak", json.dumps(payload))

    def test_unknown_runtime_is_never_reported_as_physical_and_the_shadow_can_be_turned_off(self):
        class FakeRuntime:
            def submit(self, _value): return {"state": "queued"}
            def status(self): return {"hardwareEnabled": True, "stopped": True}
        bridge = IotBridge({"thingName": "t", "topicPrefix": "p"}, FakeRuntime(), clock=lambda: 1)
        bridge.publish_state()
        self.assertEqual(bridge.drain_shadow_publications()[0][1]["state"]["reported"]["runtimeKind"], "UNVERIFIED_RUNTIME")
        off = IotBridge({"thingName": "t", "topicPrefix": "p", "deviceShadow": False}, FakeRuntime(), clock=lambda: 1)
        off.publish_state()
        self.assertEqual(off.drain_shadow_publications(), [])

    def test_connect_registers_a_last_will_that_marks_the_shadow_disconnected(self):
        calls = {}
        class Client:
            def __init__(self, **kw): calls["client_id"] = kw["client_id"]
            def tls_set_context(self, _c): pass
            def tls_insecure_set(self, _v): pass
            def will_set(self, topic, payload, qos): calls["will"] = (topic, json.loads(payload), qos)
            def connect_async(self, *_a, **_k): pass
            def loop_start(self): pass
        class FakeRuntime:
            def status(self): return {}
        bridge = IotBridge({"thingName": "vista-demo-so101-001", "topicPrefix": "p", "fakeRobot": True}, FakeRuntime())
        import ssl, unittest.mock
        with unittest.mock.patch("ssl.create_default_context") as ctx:
            ctx.return_value.load_cert_chain = lambda *_a, **_k: None
            from iot import TlsSettings
            bridge.connect(TlsSettings("e", "vista-demo-so101-001", "ca", "crt", "key"), mqtt_factory=Client)
        topic, payload, qos = calls["will"]
        self.assertEqual((topic, qos), ("$aws/things/vista-demo-so101-001/shadow/update", 1))
        self.assertEqual(payload["state"]["reported"]["connection"], "disconnected")

    def test_commands_are_addressed_by_the_api_robot_id_not_the_thing_name(self):
        """The Education API addresses a robot by its database UUID (command robotId and topic segment); acks must carry the same id."""
        uuid = "3f1c2a9e-6d41-4a1b-9c53-0d7e5b2a8f10"
        class FakeRuntime:
            def __init__(self): self.submissions = []
            def submit(self, value): self.submissions.append(value); return {"state": "queued"}
            def status(self): return {"hardwareEnabled": False, "stopped": False}
        bridge = IotBridge({"thingName": f"vista-demo-{uuid}", "robotId": uuid, "topicPrefix": f"vista/demo/robots/{uuid}"}, FakeRuntime(), clock=lambda: 1000)
        command = {"schemaVersion": 1, "commandId": "c-1", "robotId": uuid, "sequence": 1, "expiresAtMs": 2000, "kind": "run", "payload": {}}
        bridge.handle_command(command)
        self.assertEqual(len(bridge.runtime.submissions), 1)
        self.assertEqual(bridge.acks[0]["robotId"], uuid)                      # the feedback service matches this against the lifecycle row
        other = command | {"commandId": "c-2", "sequence": 2, "robotId": f"vista-demo-{uuid}"}
        bridge.handle_command(other)                                           # the Thing name is not the robot id
        self.assertEqual(bridge.acks[-1]["status"], "rejected")
        self.assertEqual(len(bridge.runtime.submissions), 1)
        topics = {value["robotId"] for _topic, value in bridge.drain_publications()}
        self.assertEqual(topics, {uuid})

    # ---- the feedback contract of the Education worker (iot-feedback.repository.ts `parse` and iot-feedback.service.ts) ----
    @staticmethod
    def _worker_accepts(event: dict) -> bool:
        """Mirror of the worker's `parse`: eventId, kind ack|status, robotId, optional string commandId, integer sequence and occurredAtMs."""
        return (isinstance(event.get("eventId"), str) and bool(event["eventId"]) and event.get("kind") in ("ack", "status") and isinstance(event.get("robotId"), str)
                and bool(event["robotId"]) and isinstance(event.get("commandId", ""), str) and all(isinstance(event.get(k), int) and not isinstance(event.get(k), bool) for k in ("sequence", "occurredAtMs")))

    def _bridge(self, snapshots, robot_id="3f1c2a9e-6d41-4a1b-9c53-0d7e5b2a8f10"):
        class FakeRuntime:
            def __init__(self): self.queue = list(snapshots)
            def submit(self, _value): return self.queue.pop(0)
            def get(self, _run_id): return self.queue.pop(0) if len(self.queue) > 1 else self.queue[0]
            def status(self): return {"hardwareEnabled": False, "stopped": False}
        return IotBridge({"thingName": f"vista-demo-{robot_id}", "robotId": robot_id, "topicPrefix": f"vista/demo/robots/{robot_id}", "watchProgress": False}, FakeRuntime(), clock=lambda: 5000), robot_id

    def test_ack_and_status_events_have_the_shape_the_feedback_worker_requires(self):
        bridge, uuid = self._bridge([{"state": "queued", "runId": "run-1"}])
        bridge.handle_command({"schemaVersion": 1, "commandId": "cmd-1", "robotId": uuid, "sequence": 1700000000000, "expiresAtMs": 6000, "kind": "run", "payload": {}})
        bridge.report_progress("cmd-1", 1700000000000, {"state": "running"})
        bridge.report_progress("cmd-1", 1700000000000, {"state": "succeeded"})
        events = [value for topic, value in bridge.drain_publications() if value.get("commandId")]
        self.assertEqual([(e["kind"], e["status"]) for e in events], [("ack", "accepted"), ("status", "executing"), ("status", "completed")])
        self.assertTrue(all(self._worker_accepts(e) for e in events))
        self.assertEqual([e["sequence"] for e in events], [1700000000000, 1700000000001, 1700000000002])   # strictly increasing, so no event is stale
        self.assertEqual(len({e["eventId"] for e in events}), 3)
        self.assertTrue(all(e["robotId"] == uuid for e in events))

    def test_a_failed_run_is_reported_failed_with_its_code_and_each_event_is_published_once(self):
        bridge, uuid = self._bridge([{"state": "queued", "runId": "run-1"}])
        bridge.report_progress("cmd-2", 10, {"state": "failed", "errorCode": "runtime_execution_timeout"})
        bridge.report_progress("cmd-2", 10, {"state": "failed", "errorCode": "runtime_execution_timeout"})   # a second poll must not publish again
        (event,) = [v for _t, v in bridge.drain_publications()]
        self.assertEqual((event["status"], event["code"], event["sequence"]), ("failed", "runtime_execution_timeout", 12))
        self.assertTrue(self._worker_accepts(event))
        for state in ("stopped", "cancelled", "timeout", "preflight_failed"):
            fresh, _ = self._bridge([{"state": "queued", "runId": "r"}]); fresh.report_progress("c", 1, {"state": state})
            self.assertEqual([v["status"] for _t, v in fresh.drain_publications()], ["failed"])

    def test_redelivered_commands_reuse_the_same_event_ids_so_the_worker_can_deduplicate(self):
        bridge, uuid = self._bridge([{"state": "queued", "runId": "run-1"}])
        command = {"schemaVersion": 1, "commandId": "cmd-3", "robotId": uuid, "sequence": 5, "expiresAtMs": 6000, "kind": "run", "payload": {}}
        bridge.handle_command(command); bridge.handle_command(command)
        self.assertEqual(len({a["eventId"] for a in bridge.acks}), 1)

    def test_a_rejected_command_publishes_an_ack_but_no_execution_status(self):
        bridge, uuid = self._bridge([{"state": "preflight_failed", "runId": "run-1", "errorCode": "hardware_not_commissioned"}])
        bridge.handle_command({"schemaVersion": 1, "commandId": "cmd-4", "robotId": uuid, "sequence": 7, "expiresAtMs": 6000, "kind": "run", "payload": {}})
        events = [v for _t, v in bridge.drain_publications() if v.get("commandId")]
        self.assertEqual([(e["kind"], e["status"]) for e in events], [("ack", "rejected")])
        self.assertTrue(all(self._worker_accepts(e) for e in events))

    def test_a_watcher_reports_executing_then_completed_from_the_runtime(self):
        bridge, uuid = self._bridge([{"state": "queued", "runId": "run-9"}, {"state": "running"}, {"state": "succeeded"}])
        bridge.config["watchProgress"] = True
        bridge.handle_command({"schemaVersion": 1, "commandId": "cmd-9", "robotId": uuid, "sequence": 3, "expiresAtMs": 6000, "kind": "run", "payload": {}})
        for thread in bridge._watchers: thread.join(timeout=5)
        statuses = [v["status"] for _t, v in bridge.drain_publications() if v.get("kind") == "status" and v.get("commandId")]
        self.assertEqual(statuses, ["executing", "completed"])
        bridge.close()

    def test_the_committed_fixture_used_by_the_api_contract_test_matches_what_the_bridge_emits(self):
        """services/education-api reads tests/fixtures/edge-feedback-events.json (iot-edge-contract.spec.ts); if the bridge changes, this fails first."""
        import pathlib
        fixture = json.loads((pathlib.Path(__file__).parent / "fixtures" / "edge-feedback-events.json").read_text())
        uuid, command = fixture["robotId"], fixture["commandId"]
        class FakeRuntime:
            def submit(self, _v): return {"state": "queued", "runId": "run-1"}
            def get(self, _r): return {"state": "succeeded"}
            def status(self): return {"hardwareEnabled": False, "stopped": False}
        bridge = IotBridge({"thingName": f"vista-demo-{uuid}", "robotId": uuid, "topicPrefix": f"vista/demo/robots/{uuid}", "watchProgress": False}, FakeRuntime(), clock=lambda: 1700000005000)
        bridge.handle_command({"schemaVersion": 1, "kind": "run", "commandId": command, "robotId": uuid, "sequence": fixture["commandSequence"], "issuedAtMs": 1700000000000, "expiresAtMs": 1700000010000, "payload": {}})
        bridge.report_progress(command, fixture["commandSequence"], {"state": "running"}); bridge.report_progress(command, fixture["commandSequence"], {"state": "succeeded"})
        emitted = [v for _t, v in bridge.drain_publications() if v.get("commandId")]
        self.assertEqual(json.loads(json.dumps(emitted, sort_keys=True)), json.loads(json.dumps(fixture["events"], sort_keys=True)))


if __name__ == "__main__":
    unittest.main()


ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9"
CMD = "11111111-1111-4111-8111-111111111111"
JOINTS = ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper")


def frame(sequence, robot=ROBOT, source="SIMULATION"):
    return {"schema_version": 1, "robot_id": robot, "source_mode": source, "controller_id": "checkik", "sequence": sequence,
            "measured_at": "2026-11-27T00:00:00Z", "connection": "connected",
            "measured": [{"name": n, "position": 0.1, "unit": "percent" if n == "gripper" else "rad"} for n in JOINTS]}


class CloudSimulationDeviceTests(unittest.TestCase):
    def bridge(self, **extra):
        class FakeRuntime:
            config = {"adapterMode": "fake_follower"}
            def submit(self, _value): return {"state": "queued"}
            def status(self): return {"hardwareEnabled": True, "stopped": False, "activeRunId": None}
        t = [1000]
        def clock():
            t[0] += 1; return t[0]
        return IotBridge({"thingName": "vista-demo-" + ROBOT, "robotId": ROBOT, "topicPrefix": "vista/demo/robots/" + ROBOT, **extra}, FakeRuntime(), clock=clock)

    def test_correlated_telemetry_is_relayed_once_per_sequence_on_the_status_topic(self):
        bridge = self.bridge()
        bridge.report_progress(CMD, 1, {"state": "running", "telemetry": frame(5)})
        bridge.report_progress(CMD, 1, {"state": "running", "telemetry": frame(5)})        # same sequence: not repeated
        bridge.report_progress(CMD, 1, {"state": "succeeded", "telemetry": frame(6)})      # terminal frame bypasses the rate limit only
        events = [v for topic, v in bridge.drain_publications() if topic.endswith("/status") and v.get("status") == "telemetry"]
        self.assertEqual([e["sequence"] for e in events], [5, 6])
        self.assertEqual({(e["commandId"], e["robotId"], e["kind"]) for e in events}, {(CMD, ROBOT, "status")})
        self.assertEqual(events[0]["eventId"], f"{CMD}:telemetry:5")
        self.assertIn("telemetry", events[0]); self.assertNotIn("jointState", events[0])

    def test_telemetry_is_rate_limited_and_never_relays_foreign_or_non_simulation_frames(self):
        bridge = self.bridge()
        bridge.report_progress(CMD, 1, {"state": "running", "telemetry": frame(1)})
        bridge.report_progress(CMD, 1, {"state": "running", "telemetry": frame(2)})         # inside 0.5 s of the previous frame
        bridge.report_progress(CMD, 1, {"state": "running", "telemetry": frame(3, robot="other")})
        bridge.report_progress(CMD, 1, {"state": "running", "telemetry": frame(4, source="PHYSICAL_ROBOT")})
        sequences = [v["sequence"] for t, v in bridge.drain_publications() if v.get("status") == "telemetry"]
        self.assertEqual(sequences, [1])

    def test_idle_heartbeat_reports_a_fresh_honest_shadow_within_ten_seconds(self):
        bridge = self.bridge(heartbeatSeconds=99)                                            # clamped to the 10 s ceiling
        self.assertEqual(bridge._heartbeat_seconds, 10.0)
        bridge.connected = True
        bridge._heartbeat()
        bridge._closing.set()
        (topic, payload), = bridge.drain_shadow_publications()
        reported = payload["state"]["reported"]
        self.assertEqual((reported["runtimeKind"], reported["hardwareEnabled"], reported["connection"]), ("MOCK_RUNTIME", False, "connected"))
        self.assertGreater(reported["reportedAtMs"], 1000)
        if bridge._heartbeat_timer: bridge._heartbeat_timer.cancel()

    def test_default_paho_client_uses_the_v2_callback_api_and_the_thing_name_as_client_id(self):
        calls = []
        class Client:
            def __init__(self, **kw): calls.append(kw)
            def tls_set_context(self, *_): pass
            def tls_insecure_set(self, *_): pass
            def will_set(self, *_a, **_k): pass
            def connect_async(self, *_a, **_k): pass
            def loop_start(self): pass
        import types, iot
        mqtt = types.SimpleNamespace(Client=Client, MQTTv311=4, CallbackAPIVersion=types.SimpleNamespace(VERSION2="v2"))
        paho = types.ModuleType("paho"); paho_mqtt = types.ModuleType("paho.mqtt"); paho_client = types.ModuleType("paho.mqtt.client")
        paho_client.Client, paho_client.MQTTv311, paho_client.CallbackAPIVersion = Client, 4, mqtt.CallbackAPIVersion
        bridge = self.bridge()
        with patch.dict(sys.modules, {"paho": paho, "paho.mqtt": paho_mqtt, "paho.mqtt.client": paho_client}), \
             patch.object(iot.ssl, "create_default_context") as ctx:
            ctx.return_value.load_cert_chain = lambda *_: None
            bridge.connect(iot.TlsSettings("e", "vista-demo-" + ROBOT, "ca", "cert", "key"))
        self.assertEqual(calls[0]["client_id"], "vista-demo-" + ROBOT)
        self.assertEqual((calls[0]["callback_api_version"], calls[0]["clean_session"]), ("v2", True))
