from robot_hardware_adapter.progress import JointProgressTracker, JOINT_NAMES


def test_progress_tracks_actual_observed_range_without_inventing_expected_limits():
    tracker = JointProgressTracker(device_id="leader-1", device_role="LEADER", session_id="session-1")

    tracker.observe({"shoulder_pan": 10.0, "gripper": 25.0}, timestamp="2026-11-05T12:00:00Z")
    events = tracker.observe({"shoulder_pan": -20.0, "gripper": 70.0}, timestamp="2026-11-05T12:00:01Z")

    pan = next(event for event in events if event.joint_name == "shoulder_pan")
    gripper = next(event for event in events if event.joint_name == "gripper")
    assert (pan.observed_min, pan.observed_max, pan.coverage_percentage) == (-20.0, 10.0, None)
    assert (gripper.observed_min, gripper.observed_max, gripper.expected_min, gripper.expected_max) == (25.0, 70.0, None, None)


def test_progress_computes_coverage_only_when_trusted_limits_exist():
    expected = {
        "shoulder_pan": (0.0, 1000.0),
        "shoulder_lift": (500.0, 2500.0),
    }
    tracker = JointProgressTracker(
        device_id="follower-1",
        device_role="FOLLOWER",
        session_id="session-2",
        expected_ranges=expected,
    )

    # Initial position
    tracker.observe({"shoulder_pan": 200.0, "shoulder_lift": 1000.0, "gripper": 50.0})
    # Move shoulder_pan from 200 to 700 (span = 500 out of 1000 => 50%)
    events = tracker.observe({"shoulder_pan": 700.0, "shoulder_lift": 1000.0, "gripper": 80.0})

    pan = next(e for e in events if e.joint_name == "shoulder_pan")
    gripper = next(e for e in events if e.joint_name == "gripper")

    assert pan.expected_min == 0.0
    assert pan.expected_max == 1000.0
    assert pan.coverage_percentage == 50.0

    # gripper has no trusted expected range -> coverage is None, not guessed
    assert gripper.expected_min is None
    assert gripper.coverage_percentage is None


def test_progress_updates_from_lelab_recorded_ranges():
    expected = {"elbow_flex": (1000.0, 3000.0)}
    tracker = JointProgressTracker(
        device_id="leader-1",
        device_role="LEADER",
        session_id="session-3",
        expected_ranges=expected,
    )
    lelab_recorded = {
        "elbow_flex": {"min": 1200.0, "max": 2200.0, "current": 2000.0},
        "wrist_roll": {"min": 500.0, "max": 1500.0, "current": 1000.0},
    }
    events = tracker.update_from_lelab(lelab_recorded, status="RECORDING")

    elbow = next(e for e in events if e.joint_name == "elbow_flex")
    wrist = next(e for e in events if e.joint_name == "wrist_roll")

    assert elbow.observed_min == 1200.0
    assert elbow.observed_max == 2200.0
    assert elbow.current_position == 2000.0
    assert elbow.coverage_percentage == 50.0  # (2200 - 1200) / (3000 - 1000) * 100

    assert wrist.observed_min == 500.0
    assert wrist.observed_max == 1500.0
    assert wrist.coverage_percentage is None  # no expected range


def test_progress_filters_invalid_readings():
    tracker = JointProgressTracker(device_id="leader-1", device_role="LEADER", session_id="session-4")
    # Disconnected motor reads float('nan') or float('inf') or invalid names
    events = tracker.observe({
        "shoulder_pan": float("nan"),
        "shoulder_lift": float("inf"),
        "unknown_joint": 42.0,
        "gripper": 120.0,
    })
    names = [e.joint_name for e in events]
    assert names == ["gripper"]
    assert events[0].current_position == 120.0
