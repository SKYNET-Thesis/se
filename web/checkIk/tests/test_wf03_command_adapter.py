import threading
import time

import pytest

from wf03_command_adapter import AdapterError, FakeFollower, Wf03CommandAdapter


def adapter(**overrides):
    config = {
        "mode": "fake_follower",
        "motionEnabled": True,
        "latchedMotionLock": False,
        "ready": True,
    }
    config.update(overrides)
    return Wf03CommandAdapter(config, FakeFollower())


def test_requires_explicit_fake_follower_mode_without_fallback():
    with pytest.raises(AdapterError, match="adapter_mode_not_supported"):
        Wf03CommandAdapter({"mode": "real"}, FakeFollower())


@pytest.mark.parametrize(
    ("override", "code"),
    [
        ({"motionEnabled": False}, "motion_not_authorized"),
        ({"latchedMotionLock": True}, "safety_stop_active"),
        ({"ready": False}, "follower_not_ready"),
    ],
)
def test_fails_closed_when_checkik_is_not_ready(override, code):
    subject = adapter(**override)
    with pytest.raises(AdapterError, match=code):
        subject.execute("run-1", {"type": "wait", "durationMs": 1}, threading.Event(), 1.0)


def test_executes_canonical_gripper_sequence_on_fake_follower():
    follower = FakeFollower()
    subject = Wf03CommandAdapter(
        {"mode": "fake_follower", "motionEnabled": True, "latchedMotionLock": False, "ready": True},
        follower,
    )
    cancel = threading.Event()
    deadline = time.monotonic() + 1
    subject.execute("run-1", {"type": "arm.select", "arm": "left"}, cancel, deadline)
    subject.execute("run-1", {"type": "gripper.open", "resolvedArm": "left"}, cancel, deadline)
    subject.execute("run-1", {"type": "wait", "durationMs": 1}, cancel, deadline)
    subject.execute("run-1", {"type": "gripper.close", "resolvedArm": "left"}, cancel, deadline)
    assert follower.commands == [
        {"type": "arm.select", "arm": "left"},
        {"type": "gripper.open", "arm": "left"},
        {"type": "wait", "durationMs": 1},
        {"type": "gripper.close", "arm": "left"},
    ]


def test_cancellation_and_deadline_are_enforced():
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(AdapterError, match="execution_cancelled"):
        adapter().execute("run-1", {"type": "wait", "durationMs": 1}, cancel, time.monotonic() + 1)
    with pytest.raises(AdapterError, match="execution_timeout"):
        adapter().execute("run-2", {"type": "wait", "durationMs": 1}, threading.Event(), time.monotonic() - 1)


def test_stop_latches_motion_lock_and_cancels_run():
    subject = adapter()
    subject.stop("run-1")
    assert subject.status()["backend"] == {"motionEnabled": False, "latchedMotionLock": True}
    with pytest.raises(AdapterError, match="safety_stop_active"):
        subject.execute("run-1", {"type": "wait", "durationMs": 1}, threading.Event(), time.monotonic() + 1)
