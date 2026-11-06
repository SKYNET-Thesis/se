import time
import pytest
from robot_hardware_adapter.ports import PortDetection, PortInfo, PortDetectionError


class Snapshots:
    def __init__(self, values):
        self.values = iter(values)

    def list(self):
        return next(self.values)


def test_detection_requires_one_removed_then_one_new_port_before_confirmation():
    detector = PortDetection(Snapshots([
        [PortInfo(device="/dev/ttyACM0", serial_number="old")],
        [],
        [PortInfo(device="/dev/ttyACM1", serial_number="new")],
    ]))
    session = detector.start("leader-1", "LEADER")
    assert detector.capture_unplug(session.id).phase == "RECONNECT"
    ready = detector.capture_reconnect(session.id)
    assert ready.candidate.device == "/dev/ttyACM1"
    assert detector.confirm(session.id).confirmed_port.device == "/dev/ttyACM1"


def test_detection_handles_same_port_reassignment_on_linux():
    # Linux reassigns the exact same /dev/ttyACM0 after unplug and replug
    detector = PortDetection(Snapshots([
        [PortInfo(device="/dev/ttyACM0", serial_number="sn123"), PortInfo(device="/dev/ttyUSB0", serial_number="other")],
        [PortInfo(device="/dev/ttyUSB0", serial_number="other")],
        [PortInfo(device="/dev/ttyUSB0", serial_number="other"), PortInfo(device="/dev/ttyACM0", serial_number="sn123")],
    ]))
    session = detector.start("leader-1", "LEADER")
    unplugged = detector.capture_unplug(session.id)
    assert unplugged.phase == "RECONNECT"
    assert unplugged.disconnected_port.device == "/dev/ttyACM0"
    reconnected = detector.capture_reconnect(session.id)
    assert reconnected.phase == "CONFIRM"
    assert reconnected.candidate.device == "/dev/ttyACM0"
    confirmed = detector.confirm(session.id)
    assert confirmed.confirmed_port.device == "/dev/ttyACM0"


def test_detection_rejects_ambiguous_port_removal():
    detector = PortDetection(Snapshots([
        [PortInfo(device="/dev/ttyACM0"), PortInfo(device="/dev/ttyACM1")],
        [],
    ]))
    session = detector.start("leader-1", "LEADER")
    with pytest.raises(PortDetectionError, match="exactly one port must disappear"):
        detector.capture_unplug(session.id)


def test_detection_rejects_ambiguous_port_reconnect():
    detector = PortDetection(Snapshots([
        [PortInfo(device="/dev/ttyACM0")],
        [],
        [PortInfo(device="/dev/ttyACM0"), PortInfo(device="/dev/ttyACM1")],
    ]))
    session = detector.start("leader-1", "LEADER")
    detector.capture_unplug(session.id)
    with pytest.raises(PortDetectionError, match="exactly one newly connected port is required"):
        detector.capture_reconnect(session.id)


def test_detection_session_cancellation():
    detector = PortDetection(Snapshots([[PortInfo(device="/dev/ttyACM0")]]))
    session = detector.start("leader-1", "LEADER")
    cancelled = detector.cancel(session.id)
    assert cancelled.phase == "CANCELLED"


def test_detection_session_expiration():
    detector = PortDetection(Snapshots([[PortInfo(device="/dev/ttyACM0")]]), timeout_seconds=0)
    session = detector.start("leader-1", "LEADER")
    time.sleep(0.01)
    with pytest.raises(PortDetectionError, match="expired"):
        detector.capture_unplug(session.id)
