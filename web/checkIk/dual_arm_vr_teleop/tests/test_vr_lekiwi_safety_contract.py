import sys
import time
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[2] / "VRTeleop" / "lekiwi-vr-teleop"
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))

from lekiwi_vr_teleop.follower_adapter import DualSO101FollowerRobot  # noqa: E402
from lekiwi_vr_teleop.state import XRState  # noqa: E402


def test_stale_or_lost_session_is_not_actionable():
    state = XRState()
    state.update_from_page({"sessionActive": True, "controllers": {}})
    assert state.snapshot().is_fresh(1.0)
    time.sleep(0.01)
    assert not state.snapshot().is_fresh(0.0)
    state.set_session_active(False)
    assert not state.snapshot().is_fresh(1.0)


def test_estop_latch_and_follower_disconnect_leave_no_command_path():
    state = XRState()
    state.trigger_stop()
    assert state.snapshot().stopped

    robot = DualSO101FollowerRobot(
        mode="dual-arm",
        left_port="fake://left",
        right_port="fake://right",
        left_device_id="left-follower",
        right_device_id="right-follower",
    )
    robot.connect()
    robot.disconnect()
    assert not robot.is_connected
