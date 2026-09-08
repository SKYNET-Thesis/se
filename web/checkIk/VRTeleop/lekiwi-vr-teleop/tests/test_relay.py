"""Relay bookkeeping that the panel's honesty depends on."""

import time

from lekiwi_vr_teleop.config import RelayConfig
from lekiwi_vr_teleop.relay import Relay
from lekiwi_vr_teleop.state import XRState

import numpy as np


def _relay():
    return Relay(RelayConfig(), XRState())


def test_telemetry_age_is_none_before_the_loop_ticks():
    assert _relay()._telemetry_age_s() is None


def test_telemetry_age_grows_with_time():
    relay = _relay()
    relay.publish_telemetry({"robotConnected": True})
    first = relay._telemetry_age_s()
    time.sleep(0.05)
    assert relay._telemetry_age_s() > first >= 0


def test_frames_get_a_new_sequence_number_even_when_the_buffer_is_reused():
    """The decoder upstream reuses one array per camera; identity cannot detect a new frame.

    This is the freeze: the picture stopped on frame one because every later frame was the
    same object.
    """
    relay = _relay()
    buffer = np.zeros((4, 4, 3), dtype=np.uint8)

    relay.publish_cameras({"front": buffer})
    first = relay._frame_seq["front"]
    stored_first = relay._frames["front"].copy()

    buffer[:] = 255  # the SAME object, new contents
    relay.publish_cameras({"front": buffer})

    assert relay._frame_seq["front"] != first
    # And the stored frame is a copy, so a slow encode cannot read a half-overwritten one.
    assert not np.array_equal(stored_first, relay._frames["front"])


def test_non_image_observation_entries_are_ignored():
    relay = _relay()
    relay.publish_cameras({"front": 1.23, "wrist": None})
    assert relay._frames == {}


def test_every_script_the_page_asks_for_is_actually_served():
    """A <script src> with no matching route is a 404 the headset reports as nothing.

    The static routes are enumerated by hand — deliberately, so the server never serves a
    file nobody meant it to — which means adding a script to index.html and forgetting the
    route gives a page that loads, runs half its code, and fails somewhere unrelated.
    """
    import re
    from pathlib import Path

    web = Path(__file__).resolve().parent.parent / "lekiwi_vr_teleop" / "web"
    served = set(re.findall(r'"([\w.-]+\.(?:js|json|png))"', (web.parent / "relay.py").read_text()))
    wanted = set(re.findall(r'src="/([\w.-]+)"', (web / "index.html").read_text()))
    assert wanted, "index.html should reference at least one script"
    assert wanted <= served, f"referenced but not served: {sorted(wanted - served)}"
    for name in wanted:
        assert (web / name).exists(), f"{name} is routed but missing from web/"
