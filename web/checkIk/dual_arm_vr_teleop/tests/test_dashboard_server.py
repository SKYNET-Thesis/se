import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).resolve().parents[1] / "backend" / "dashboard_server.py"
SPEC = importlib.util.spec_from_file_location("dashboard_server", MODULE_PATH)
assert SPEC and SPEC.loader
dashboard = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = dashboard
SPEC.loader.exec_module(dashboard)


class DashboardControllerTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.previous_state_file = dashboard.STATE_FILE
        dashboard.STATE_FILE = Path(self.tempdir.name) / "state.json"
        self.controller = dashboard.Controller(enable_motion=False)

    def tearDown(self):
        dashboard.STATE_FILE = self.previous_state_file
        self.tempdir.cleanup()

    def test_assignments_start_unconfigured_and_persist(self):
        self.assertTrue(all(value is None for value in self.controller.state["assignments"].values()))
        self.controller.assign("left-follower", "/dev/ttyACM7")
        restored = dashboard.Controller(enable_motion=False)
        self.assertEqual(restored.state["assignments"]["left-follower"], "/dev/ttyACM7")

    def test_duplicate_port_is_rejected(self):
        self.controller.assign("left-follower", "/dev/ttyACM7")
        with self.assertRaises(ValueError):
            self.controller.assign("right-follower", "/dev/ttyACM7")

    def test_guided_find_can_transfer_a_stale_port_assignment(self):
        self.controller.assign("right-follower", "/dev/ttyACM0")
        self.controller.assign("left-leader", "/dev/ttyACM0", reassign=True)

        self.assertEqual(self.controller.state["assignments"]["left-leader"], "/dev/ttyACM0")
        self.assertIsNone(self.controller.state["assignments"]["right-follower"])

    def test_arbitrary_device_path_is_rejected(self):
        with self.assertRaises(ValueError):
            self.controller.assign("left-follower", "/tmp/not-a-serial-port")

    def test_real_motion_is_locked_by_default(self):
        with self.assertRaises(PermissionError):
            self.controller.start_leader_teleop("ENABLE MOTION")

    def test_estop_lock_survives_and_unlock_requires_readiness_check(self):
        self.controller.emergency_stop()
        self.assertTrue(self.controller.snapshot()["backend"]["latchedMotionLock"])
        with self.assertRaises(PermissionError):
            self.controller.start_vr_lekiwi("dual-arm")
        with self.assertRaises(PermissionError):
            self.controller.unlock("wrong", "dual-arm")
        checks = self.controller.unlock("UNLOCK MOTION", "dual-arm")
        self.assertTrue(checks["ready"])
        self.assertFalse(self.controller.snapshot()["backend"]["latchedMotionLock"])

    def test_left_real_teleop_uses_direct_usb_worker_and_only_left_follower(self):
        calibration = Path(self.tempdir.name) / "left-follower.json"
        calibration.write_text("{}")
        cert = Path(self.tempdir.name) / "cert.pem"
        key = Path(self.tempdir.name) / "key.pem"
        cert.write_text("test")
        key.write_text("test")
        previous_calibration_path = dashboard.calibration_path
        previous_cert, previous_key = dashboard.VUER_CERT, dashboard.VUER_KEY
        dashboard.calibration_path = lambda _device_id: calibration
        dashboard.VUER_CERT, dashboard.VUER_KEY = cert, key
        try:
            controller = dashboard.Controller(enable_motion=True)
            controller.state["assignments"]["left-follower"] = "/dev/ttyACM7"

            def capture_start(kind, command):
                controller.task = SimpleNamespace(
                    process=SimpleNamespace(poll=lambda: None),
                    output=["VR_TELEOP_READY followers=left"],
                    command=command,
                    kind=kind,
                )

            controller._start = capture_start
            controller.start_vr_real("ENABLE VR MOTION", 0.45, "left", "balanced")
            command = " ".join(controller.task.command)
            self.assertIn("real_vr_teleop_server.py", command)
            self.assertIn("--arm left", command)
            self.assertIn("--follower /dev/ttyACM7", command)
            self.assertNotIn("leader", command)
        finally:
            dashboard.calibration_path = previous_calibration_path
            dashboard.VUER_CERT, dashboard.VUER_KEY = previous_cert, previous_key

    def test_calibration_joint_completes_only_after_full_target_range(self):
        calibration = {
            "target": "leader",
            "stage": "range",
            "joints": self.controller._new_joint_state(),
        }
        values = {
            name: {"min": 1000, "position": 1500, "max": 1100}
            for name in dashboard.CALIBRATION_JOINTS
        }
        values["wrist_roll"] = {"min": 0, "position": 2047, "max": 4095}
        self.controller._update_direct_calibration(calibration, {"event": "positions", "joints": values})
        self.assertEqual(calibration["joints"][0]["status"], "waiting")

        # Leader shoulder_pan needs 98% of the empirically validated 2400-count span.
        values["shoulder_pan"] = {"min": 500, "position": 1600, "max": 2852}
        self.controller._update_direct_calibration(calibration, {"event": "positions", "joints": values})
        self.assertEqual(calibration["joints"][0]["status"], "observed")


if __name__ == "__main__":
    unittest.main()
