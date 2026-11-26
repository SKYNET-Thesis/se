from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from vista_digital_twin.mock import LatestState, MockTelemetry, load_fixture


FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "so101_joint_states.json"
START = datetime(2026, 11, 5, tzinfo=timezone.utc)


def test_fixture_drives_continuous_six_joint_trajectory():
    source = MockTelemetry(load_fixture(FIXTURE), robot_id="so101-left")
    first = source.next_state(START)
    second = source.next_state(START + timedelta(milliseconds=33))
    assert [joint.name for joint in first.measured] == [
        "shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"
    ]
    assert [first.sequence, second.sequence] == [0, 1]
    # A 30 Hz sample advances only a small part of the one-second segment;
    # fixture waypoints never teleport into the render target.
    assert second.measured[1].position == pytest.approx(-0.2 * 0.033, abs=0.001)
    assert first.source_mode.value == "SIMULATION"


def test_mock_trajectory_is_time_based_and_continuous_at_the_loop_boundary():
    source = MockTelemetry(load_fixture(FIXTURE))
    start = source.next_state(START)
    near_end = source.next_state(START + timedelta(seconds=2.99))
    wrapped = source.next_state(START + timedelta(seconds=3.01))
    assert start.measured[0].position == 0
    assert abs(near_end.measured[0].position - wrapped.measured[0].position) < 0.01


def test_disconnect_holds_last_measurement_and_reconnect_resumes():
    source = MockTelemetry(load_fixture(FIXTURE), disconnect_at=1, reconnect_at=3)
    connected = source.next_state(START)
    disconnected = source.next_state(START + timedelta(seconds=1))
    still_disconnected = source.next_state(START + timedelta(seconds=2))
    reconnected = source.next_state(START + timedelta(seconds=3))
    assert [frame.connection for frame in (connected, disconnected, still_disconnected, reconnected)] == [
        "connected", "disconnected", "disconnected", "connected"
    ]
    assert disconnected.measured == connected.measured
    assert disconnected.measured_at == connected.measured_at
    assert reconnected.measured[1].position == 0.0
    assert reconnected.measured_at == START + timedelta(seconds=3)


def test_latest_state_rejects_duplicate_and_out_of_order_sequences():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = LatestState(stale_after_seconds=0.5)
    first = source.next_state(START)
    second = source.next_state(START + timedelta(milliseconds=33))
    assert slot.publish(first)
    assert slot.publish(second)
    assert not slot.publish(first)
    assert not slot.publish(second)
    assert slot.latest(START + timedelta(milliseconds=100)).sequence == 1


def test_latest_state_rejects_connected_frame_with_older_measurement_time():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = LatestState()
    newer = source.next_state(START + timedelta(seconds=1))
    older = source.next_state(START)
    assert slot.publish(newer)
    assert not slot.publish(older)
    assert slot.latest(START + timedelta(seconds=1)).sequence == 0


def test_latest_state_marks_old_measurement_stale_without_rewriting_pose():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = LatestState(stale_after_seconds=0.5)
    state = source.next_state(START)
    slot.publish(state)
    stale = slot.latest(START + timedelta(seconds=1))
    assert stale.connection == "stale"
    assert stale.measured == state.measured


@pytest.mark.parametrize("rate", [0, -1, 101])
def test_mock_rate_must_be_bounded(rate):
    with pytest.raises(ValueError):
        MockTelemetry(load_fixture(FIXTURE), rate_hz=rate)


def test_mock_cannot_disconnect_before_first_measurement():
    with pytest.raises(ValueError):
        MockTelemetry(load_fixture(FIXTURE), disconnect_at=0)


# --- relayed (cloud) freshness: receipt age and measurement age are separate and latency is never hidden ---

def relay_slot():
    return LatestState(relay_stale_after_seconds=3.0, max_measurement_age_seconds=5.0)


def test_relay_mode_keeps_a_delayed_but_recently_received_frame_connected_and_reports_the_transport_delay():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = relay_slot()
    state = source.next_state(START)
    assert slot.publish(state, received_at=START + timedelta(seconds=1.4))
    # measured 1.5 s ago, received 0.1 s ago: connected under the relay rule (the 0.5 s direct rule would call it stale)
    assert slot.latest(START + timedelta(seconds=1.5)).connection == "connected"
    timing = slot.timing(START + timedelta(seconds=1.5))
    assert timing == {"measurement_age_ms": 1500, "received_age_ms": 100, "transport_delay_ms": 1400}


def test_relay_mode_marks_stale_when_nothing_was_received_recently_even_if_the_measurement_is_young():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = relay_slot()
    slot.publish(source.next_state(START), received_at=START)
    assert slot.latest(START + timedelta(seconds=2.9)).connection == "connected"
    assert slot.latest(START + timedelta(seconds=3.1)).connection == "stale"


def test_relay_mode_does_not_hide_a_large_transport_delay():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = relay_slot()
    slot.publish(source.next_state(START), received_at=START + timedelta(seconds=6))  # arrived 6 s after it was measured
    frame = slot.latest(START + timedelta(seconds=6.1))
    assert frame.connection == "stale"                       # measurement older than the 5 s bound
    assert slot.timing(START + timedelta(seconds=6.1))["transport_delay_ms"] == 6000


def test_relay_mode_never_rewrites_the_measured_pose_or_timestamp():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = relay_slot()
    state = source.next_state(START)
    slot.publish(state, received_at=START + timedelta(seconds=0.5))
    seen = slot.latest(START + timedelta(seconds=10))
    assert seen.connection == "stale" and seen.measured == state.measured and seen.measured_at == state.measured_at


def test_relay_mode_still_rejects_duplicates_and_out_of_order_frames():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = relay_slot()
    first, second = source.next_state(START), source.next_state(START + timedelta(milliseconds=500))
    assert slot.publish(first, received_at=START) and slot.publish(second, received_at=START + timedelta(seconds=1))
    assert not slot.publish(first, received_at=START + timedelta(seconds=2)) and not slot.publish(second, received_at=START + timedelta(seconds=2))


def test_default_direct_publisher_semantics_are_unchanged():
    source = MockTelemetry(load_fixture(FIXTURE))
    slot = LatestState()
    slot.publish(source.next_state(START), received_at=START + timedelta(seconds=1))
    assert slot.latest(START + timedelta(seconds=1)).connection == "stale"     # 0.5 s measurement rule, receipt time is irrelevant


@pytest.mark.parametrize("kwargs", [{"relay_stale_after_seconds": 0, "max_measurement_age_seconds": 5}, {"relay_stale_after_seconds": 3}, {"relay_stale_after_seconds": 3, "max_measurement_age_seconds": 2}])
def test_relay_mode_needs_coherent_bounds(kwargs):
    with pytest.raises(ValueError):
        LatestState(**kwargs)
