import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from runtime import Runtime


def config():
    return {"hardwareEnabled": False, "profiles": {"lesson": {"maxWaitMs": 60000}}, "arms": {}}


def program(steps):
    return {"runId": "run-1", "programVersionId": "version-1", "profile": "lesson", "program": {"kind": "robot_program", "schemaVersion": 1, "steps": steps}}


class RuntimeContractTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
