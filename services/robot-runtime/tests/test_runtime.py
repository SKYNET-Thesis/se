import sys
from pathlib import Path
import unittest
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from runtime import CheckikHttpAdapter, Runtime


def config():
    return {"hardwareEnabled": False, "profiles": {"lesson": {"maxWaitMs": 60000, "maxRunMs": 1000}}, "arms": {}}


class FakeCheckikAdapter:
    def __init__(self, status=None):
        self.snapshot = status or {"backend": {"motionEnabled": True, "latchedMotionLock": False}, "readiness": {"ready": True}}
        self.commands = []
        self.cancelled = []

    def status(self):
        return self.snapshot

    def execute(self, run_id, step, timeout_ms):
        self.commands.append((run_id, step, timeout_ms))
        return {"ok": True}

    def cancel(self, run_id):
        self.cancelled.append(run_id)

    def stop(self, run_id=None):
        self.cancelled.append(run_id or "all")


def program(steps):
    return {"runId": "run-1", "programVersionId": "version-1", "profile": "lesson", "program": {"kind": "robot_program", "schemaVersion": 1, "steps": steps}}


class RuntimeContractTests(unittest.TestCase):
    def test_http_adapter_allows_the_command_deadline_to_exceed_transport_default(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_args): return None
            def read(self): return b'{"ok":true}'
        with patch("runtime.urlopen", return_value=Response()) as request:
            CheckikHttpAdapter("http://127.0.0.1:8016", "token").execute("run-1", {"type": "wait", "durationMs": 3000}, 3500)
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
        self.assertEqual([step[1]["type"] for step in checked.commands], ["arm.select", "gripper.open", "wait", "gripper.close"])

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
            def execute(self, run_id, step, timeout_ms): return {"ok": False}
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
            def execute(self, run_id, step, timeout_ms):
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
            def execute(self, run_id, step, timeout_ms):
                raise TimeoutError("private detail")
        cfg = config() | {"hardwareEnabled": True, "adapterMode": "fake_follower"}
        runtime = Runtime(cfg, SlowAdapter())
        runtime.submit(program([{"type": "wait", "durationMs": 1}]))
        deadline = time.time() + 1
        while runtime.get("run-1")["state"] not in {"failed", "succeeded"} and time.time() < deadline:
            time.sleep(0.01)
        self.assertEqual(runtime.get("run-1")["errorCode"], "runtime_execution_timeout")


if __name__ == "__main__":
    unittest.main()
