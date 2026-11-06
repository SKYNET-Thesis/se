import multiprocessing
import os
import signal
import time
from pathlib import Path

import pytest
from robot_hardware_adapter.ownership import DeviceOwner, DeviceOwnershipConflict


def _attempt_claim(root: str, device_id: str, queue):
    try:
        with DeviceOwner(Path(root), device_id, "teleoperation"):
            queue.put("claimed")
    except DeviceOwnershipConflict:
        queue.put("conflict")


def _hold_lock_until_killed(root: str, device_id: str, ready_queue):
    owner = DeviceOwner(Path(root), device_id, "active-teleop")
    owner.acquire()
    ready_queue.put(os.getpid())
    while True:
        time.sleep(0.1)


def test_device_lock_excludes_another_process_and_releases_on_owner_exit(tmp_path):
    queue = multiprocessing.Queue()
    with DeviceOwner(tmp_path, "follower-1", "calibration"):
        # Contender in separate process cannot acquire
        contender = multiprocessing.Process(target=_attempt_claim, args=(str(tmp_path), "follower-1", queue))
        contender.start()
        contender.join(timeout=5)
        assert queue.get(timeout=1) == "conflict"

        # check_ownership reports locked
        locked, info = DeviceOwner.check_ownership(tmp_path, "follower-1")
        assert locked is True
        assert info["purpose"] == "calibration"

    # After exit, check_ownership reports unlocked
    locked, _ = DeviceOwner.check_ownership(tmp_path, "follower-1")
    assert locked is False

    # Second process now claims successfully
    succeeding = multiprocessing.Process(target=_attempt_claim, args=(str(tmp_path), "follower-1", queue))
    succeeding.start()
    succeeding.join(timeout=5)
    assert queue.get(timeout=1) == "claimed"


def test_device_lock_cleaned_up_automatically_on_process_crash(tmp_path):
    ready_queue = multiprocessing.Queue()
    worker = multiprocessing.Process(target=_hold_lock_until_killed, args=(str(tmp_path), "leader-1", ready_queue))
    worker.start()
    pid = ready_queue.get(timeout=5)

    try:
        # Lock should be active
        locked, info = DeviceOwner.check_ownership(tmp_path, "leader-1")
        assert locked is True
        assert info["pid"] == pid

        # Contender cannot acquire
        test_queue = multiprocessing.Queue()
        p = multiprocessing.Process(target=_attempt_claim, args=(str(tmp_path), "leader-1", test_queue))
        p.start()
        p.join(timeout=5)
        assert test_queue.get(timeout=1) == "conflict"

        # Crash the worker process abruptly with SIGKILL (simulating unhandled segfault or OOM)
        os.kill(pid, signal.SIGKILL)
        worker.join(timeout=5)

        # Linux kernel immediately releases flock upon process termination
        locked, _ = DeviceOwner.check_ownership(tmp_path, "leader-1")
        assert locked is False

        # Another process can immediately claim the lock
        p2 = multiprocessing.Process(target=_attempt_claim, args=(str(tmp_path), "leader-1", test_queue))
        p2.start()
        p2.join(timeout=5)
        assert test_queue.get(timeout=1) == "claimed"
    finally:
        if worker.is_alive():
            worker.terminate()
