"""Freshness gating: the loop must treat silence as 'no operator', not 'last command'."""

import time

import numpy as np

from lekiwi_vr_teleop.state import XRState

PAYLOAD = {
    "sessionActive": True,
    "controllers": {
        "right": {
            "position": [0.1, 0.2, 0.3],
            "orientation": [0, 0, 0, 1],
            "trigger": 0.4,
            "squeeze": 0.9,
            "stickX": 0.5,
            "stickY": -0.5,
            "tracked": True,
        }
    },
}


def test_no_input_yet_is_never_fresh():
    state = XRState()
    assert not state.snapshot().is_fresh(0.25)


def test_fresh_after_an_update():
    state = XRState()
    state.update_from_page(PAYLOAD)
    snapshot = state.snapshot()
    assert snapshot.is_fresh(0.25)
    assert snapshot.controller("right").squeeze == 0.9
    assert snapshot.controller("right").tracked


def test_goes_stale_with_time():
    state = XRState()
    state.update_from_page(PAYLOAD)
    time.sleep(0.05)
    assert not state.snapshot().is_fresh(0.01)


def test_missing_hand_reads_as_neutral():
    state = XRState()
    state.update_from_page(PAYLOAD)
    left = state.snapshot().controller("left")
    assert left.squeeze == 0.0 and left.stick_x == 0.0 and not left.tracked


def test_stop_latches_until_explicitly_cleared():
    state = XRState()
    state.update_from_page(PAYLOAD)
    state.trigger_stop()
    assert not state.snapshot().is_fresh(0.25)
    # Fresh controller frames must NOT release the stop on their own.
    state.update_from_page(PAYLOAD)
    assert not state.snapshot().is_fresh(0.25)
    state.clear_stop()
    assert state.snapshot().is_fresh(0.25)


def test_closed_session_is_not_fresh():
    state = XRState()
    state.update_from_page(PAYLOAD)
    state.set_session_active(False)
    assert not state.snapshot().is_fresh(0.25)


def test_raw_buttons_survive_the_wire():
    """A controller whose layout differs from xr-standard has to be diagnosable.

    Assuming index 4 was A/X and index 5 was B/Y cost a session in which the resume key
    latched the very stop it was supposed to clear, with no way to see why from outside
    the headset.
    """
    state = XRState()
    state.update_from_page(
        {
            "controllers": {
                "right": {
                    "position": [0, 0, 0],
                    "orientation": [0, 0, 0, 1],
                    "tracked": True,
                    "buttons": [0, 1, 0, 0, 1, 0],
                }
            }
        }
    )
    assert state.snapshot().controller("right").buttons == (0, 1, 0, 0, 1, 0)
    assert state.status()["controllers"]["right"]["buttons"] == [0, 1, 0, 0, 1, 0]


def test_a_controller_without_a_gamepad_reports_no_buttons():
    state = XRState()
    state.update_from_page(
        {"controllers": {"left": {"position": [0, 0, 0], "tracked": True, "kind": "hand"}}}
    )
    assert state.snapshot().controller("left").buttons == ()


def test_non_finite_pose_revokes_tracking():
    state = XRState()
    bad = {**PAYLOAD, "controllers": {"right": {**PAYLOAD["controllers"]["right"], "position": [np.nan, 0, 0]}}}
    state.update_from_page(bad)
    assert not state.snapshot().controller("right").tracked


def test_quaternion_is_normalized_at_the_boundary():
    state = XRState()
    scaled = {**PAYLOAD, "controllers": {"right": {**PAYLOAD["controllers"]["right"], "orientation": [0, 0, 0, 0.75]}}}
    state.update_from_page(scaled)
    assert state.snapshot().controller("right").orientation.tolist() == [0.0, 0.0, 0.0, 1.0]


def test_adjacent_tracking_spike_revokes_tracking():
    state = XRState()
    state.update_from_page(PAYLOAD)
    jumped = {**PAYLOAD, "controllers": {"right": {**PAYLOAD["controllers"]["right"], "position": [0.5, 0.2, 0.3]}}}
    state.update_from_page(jumped)
    assert not state.snapshot().controller("right").tracked


def test_invalid_controls_are_neutralized_and_clamped():
    state = XRState()
    payload = {**PAYLOAD, "controllers": {"right": {**PAYLOAD["controllers"]["right"], "trigger": np.nan, "squeeze": "bad", "stickX": 4}}}
    state.update_from_page(payload)
    controller = state.snapshot().controller("right")
    assert controller.trigger == 0.0
    assert controller.squeeze == 0.0
    assert controller.stick_x == 1.0
