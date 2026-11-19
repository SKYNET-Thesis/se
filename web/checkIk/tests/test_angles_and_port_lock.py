import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from robot.safety import angular_delta_deg, shortest_arc_target_deg, wrap_deg  # noqa: E402
from port_lock import PortBusy, PortLease  # noqa: E402


def test_wrist_roll_delta_is_circular_across_the_180_degree_seam():
    assert angular_delta_deg(-179.0, 179.0) == pytest.approx(2.0)      # crossing the seam is a 2 degree move, not 358
    assert angular_delta_deg(179.0, -179.0) == pytest.approx(-2.0)
    assert angular_delta_deg(10.0, 350.0) == pytest.approx(20.0)
    assert angular_delta_deg(0.0, 0.0) == 0.0
    assert wrap_deg(540.0) == pytest.approx(-180.0) and wrap_deg(-190.0) == pytest.approx(170.0)
    assert shortest_arc_target_deg(179.0, -179.0) == pytest.approx(181.0)  # interpolate through the seam, never the long way round


def test_port_lease_gives_a_single_owner_and_releases(tmp_path):
    first = PortLease("/dev/serial/by-id/usb-test-1", tmp_path).acquire()
    assert first.held and first.path.read_text().strip() == str(os.getpid())
    with pytest.raises(PortBusy):
        PortLease("/dev/serial/by-id/usb-test-1", tmp_path).acquire()
    other = PortLease("/dev/serial/by-id/usb-test-2", tmp_path).acquire()  # different port is independent
    first.release()
    with PortLease("/dev/serial/by-id/usb-test-1", tmp_path) as again:     # reusable once released
        assert again.held
    other.release()
    with pytest.raises(ValueError):
        PortLease("", tmp_path)
