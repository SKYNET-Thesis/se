"""Offline executor contracts: real models/URDF, injected hardware boundary."""

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.gesture_pick.calibration import TableCalibration
from backend.gesture_pick.config import GesturePickConfig
from backend.gesture_pick.models import DetectedTag, PickPlaceTask, TaskPhase
from robot.ik import IKResult
from robot.kinematics import SO101Kinematics

STAGES = ["open", "approach", "descend", "close", "lift", "travel", "place", "release", "retreat"]


class FakeFollower:
    """Simulates blocking completion and allows faults at the adapter boundary."""

    def __init__(self):
        self.model = SO101Kinematics(ROOT / "so101_new_calib.urdf")
        self.q = np.zeros(5)
        self.gripper = 25.0
        self.commands = []
        self.targets = []
        self.stage = lambda: None
        self.after_move = lambda: None
        self.after_solve = lambda: None
        self.solution = None
        self.move_error = None

    def get_joint_positions(self):
        return self.q.copy(), self.gripper

    def solve_end_effector(self, position, *, initial_q=None, target_rotation=None):
        self.targets.append((tuple(position), np.asarray(target_rotation).copy()))
        self.after_solve()
        if self.solution is not None:
            return self.solution
        return IKResult(True, np.asarray(initial_q) + 0.01, 0.0, 0.0, "verified")

    def move_joints(self, target_q, *, start_q, gripper, max_total_delta_deg, speed_deg_s):
        self.commands.append((self.stage(), np.asarray(target_q).copy(), gripper,
                              max_total_delta_deg, speed_deg_s))
        if self.move_error:
            raise self.move_error
        self.q = np.asarray(target_q).copy()
        self.gripper = gripper
        self.after_move()


def setup_executor(**kwargs):
    from backend.gesture_pick.executor import PickPlaceExecutor

    follower = kwargs.pop("follower", FakeFollower())
    config = GesturePickConfig(camera_path="/dev/video-test", tags={7: "object", 8: "box"},
                               follower_side="right", max_tag_age_s=0.5)
    calibration = TableCalibration.from_points(
        [[0, 0], [100, 0], [100, 100], [0, 100]],
        [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]],
        camera_path=config.camera_path, table_z=0.1,
    )
    tags = [DetectedTag(tag_id=7, kind="object", image_center=(25.0, 25.0),
                        robot_point=(0.1, 0.1, 0.1), observed_at=10.0),
            DetectedTag(tag_id=8, kind="box", image_center=(50.0, 50.0),
                        robot_point=(0.2, 0.2, 0.1), observed_at=10.0)]
    detection_hook = kwargs.pop("detection_hook", lambda: None)

    def detections():
        detection_hook()
        return tags

    executor = PickPlaceExecutor(follower, config, calibration, detections,
                                 clock=kwargs.pop("clock", lambda: 10.0), **kwargs)
    follower.stage = lambda: executor.status().stage
    task = PickPlaceTask(object_tag_id=7, box_tag_id=8, follower_side="right", requested_at=10.0)
    return executor, follower, tags, task


def test_executor_requires_preview_confirmation_and_runs_named_stages():
    executor, follower, _, task = setup_executor()
    assert executor.status().phase is TaskPhase.IDLE
    preview = executor.preview(task)
    assert preview.phase is TaskPhase.PREVIEW
    assert preview.task_id == task.task_id
    assert follower.commands == []
    state = executor.confirm(task.task_id)
    assert state.phase is TaskPhase.SUCCEEDED
    assert state.stage == "retreat"
    assert state.updated_at == 10.0
    assert [command[0] for command in follower.commands] == STAGES
    assert [command[2] for command in follower.commands] == [75.0, 75.0, 75.0, 0.0, 0.0, 0.0, 0.0, 75.0, 75.0]
    assert all(command[3:] == (10.0, 3.0) for command in follower.commands)
    assert all(np.array_equal(rotation, np.diag([1.0, -1.0, -1.0]))
               for _, rotation in follower.targets)
    assert [position for position, _ in follower.targets[-6:]] == [
        (0.1, 0.1, 0.18), (0.1, 0.1, 0.115), (0.1, 0.1, 0.18),
        (0.2, 0.2, 0.18), (0.2, 0.2, 0.115), (0.2, 0.2, 0.18),
    ]
    assert executor.confirm(task.task_id) == state
    assert len(follower.commands) == 9  # Confirmation is not a retry.


def test_confirmation_without_matching_preview_never_moves():
    executor, follower, _, task = setup_executor()
    assert executor.confirm(task.task_id).reason == "no_preview"
    executor.preview(task)
    state = executor.confirm("other-task")
    assert state.phase is TaskPhase.HELD
    assert state.reason == "task_id_mismatch"
    assert follower.commands == []


def test_preview_cancel_blocks_confirmation():
    executor, follower, _, task = setup_executor()
    executor.preview(task)
    state = executor.cancel("operator_cancelled")
    assert executor.confirm(task.task_id) == state
    assert state.phase is TaskPhase.HELD
    assert state.reason == "operator_cancelled"
    assert follower.commands == []


@pytest.mark.parametrize("after_stage", STAGES)
def test_cancel_during_execution_stops_every_later_stage(after_stage):
    executor, follower, _, task = setup_executor()
    executor.preview(task)
    follower.after_move = lambda: (executor.cancel("operator_cancelled")
                                    if follower.stage() == after_stage else None)
    state = executor.confirm(task.task_id)
    assert state.phase is TaskPhase.HELD
    assert state.reason == "operator_cancelled"
    assert state.stage == after_stage
    assert [item[0] for item in follower.commands] == STAGES[:STAGES.index(after_stage) + 1]


@pytest.mark.parametrize("callback,reason", [("is_estopped", "estop"), ("should_cancel", "cancelled")])
def test_stop_callbacks_block_motion_and_are_rechecked_after_each_stage(callback, reason):
    stop = [False]
    executor, follower, _, task = setup_executor(**{callback: lambda: stop[0]})
    executor.preview(task)
    follower.after_move = lambda: stop.__setitem__(0, True)
    state = executor.confirm(task.task_id)
    assert state.phase is TaskPhase.HELD
    assert state.reason == reason
    assert [item[0] for item in follower.commands] == ["open"]


def test_estop_active_at_preview_never_moves():
    executor, follower, _, task = setup_executor(is_estopped=lambda: True)
    assert executor.preview(task).reason == "estop"
    assert follower.commands == []


@pytest.mark.parametrize("change,reason", [
    ({"observed_at": 9.49}, "stale_tag:7"),
    ({"observed_at": 10.01}, "future_tag:7"),
    ({"visible": False}, "missing_tag:7"),
    ({"kind": "box"}, "tag_kind_mismatch:7"),
    ({"robot_point": (0.4000000001, 0.1, 0.1)}, "outside_table:7"),
    ({"robot_point": (0.1, 0.1, 0.2)}, "off_table_plane:7"),
])
def test_invalid_detection_blocks_preflight(change, reason):
    executor, follower, tags, task = setup_executor()
    tags[0] = tags[0].model_copy(update=change)
    state = executor.preview(task)
    assert state.phase is TaskPhase.HELD
    assert state.stage == "preflight"
    assert state.reason == reason
    assert follower.commands == []


@pytest.mark.parametrize("mutation,reason", [
    (lambda tags: tags.clear(), "missing_tag:7"),
    (lambda tags: tags.append(tags[0]), "ambiguous_tag:7"),
    (lambda tags: tags.__setitem__(0, tags[0].model_copy(update={"tag_id": 9})), "missing_tag:7"),
])
def test_missing_duplicate_and_unknown_selected_detections_block_preview(mutation, reason):
    executor, follower, tags, task = setup_executor()
    mutation(tags)
    assert executor.preview(task).reason == reason
    assert follower.commands == []


def test_configuration_rejects_wrong_follower_and_unconfigured_selection():
    executor, follower, _, task = setup_executor()
    assert executor.preview(task.model_copy(update={"follower_side": "left"})).reason == "follower_side_mismatch"
    assert executor.preview(task.model_copy(update={"object_tag_id": 9})).reason == "unknown_tag:9"
    assert follower.commands == []


@pytest.mark.parametrize("change,reason", [
    ({"observed_at": 9.49}, "stale_tag:7"),
    ({"visible": False}, "missing_tag:7"),
    ({"robot_point": (0.5, 0.1, 0.1)}, "outside_table:7"),
])
def test_detection_guards_run_again_before_confirm_and_each_stage(change, reason):
    executor, follower, tags, task = setup_executor()
    executor.preview(task)
    follower.after_move = lambda: tags.__setitem__(0, tags[0].model_copy(update=change))
    state = executor.confirm(task.task_id)
    assert state.phase is TaskPhase.HELD
    assert state.reason == reason
    assert state.stage == "approach"
    assert len(follower.commands) == 1


def test_expired_preview_is_rechecked_before_first_command():
    now = [10.0]
    executor, follower, _, task = setup_executor(clock=lambda: now[0])
    executor.preview(task)
    now[0] = 10.51
    assert executor.confirm(task.task_id).reason == "stale_tag:7"
    assert follower.commands == []


def test_tag_expiry_during_ik_is_rechecked_immediately_before_command():
    now = [10.0]
    executor, follower, _, task = setup_executor(clock=lambda: now[0])
    executor.preview(task)
    follower.after_solve = lambda: now.__setitem__(0, 10.6)
    state = executor.confirm(task.task_id)
    assert state.phase is TaskPhase.HELD
    assert state.reason == "stale_tag:7"
    assert follower.commands == []


def test_tag_expiry_during_detection_read_blocks_the_pending_command():
    now = [10.0]
    delay = [False]

    def slow_detection_read():
        if delay[0]:
            now[0] = 10.6

    executor, follower, _, task = setup_executor(clock=lambda: now[0], detection_hook=slow_detection_read)
    executor.preview(task)
    follower.after_solve = lambda: delay.__setitem__(0, len(follower.commands) == 1)
    state = executor.confirm(task.task_id)
    assert state.reason == "stale_tag:7"
    assert state.stage == "approach"
    assert [command[0] for command in follower.commands] == ["open"]


@pytest.mark.parametrize("callback,reason", [("is_estopped", "estop"), ("should_cancel", "cancelled")])
def test_stop_activated_during_detection_read_blocks_the_pending_command(callback, reason):
    stop, activate = [False], [False]

    def read_detections():
        if activate[0]:
            stop[0] = True

    executor, follower, _, task = setup_executor(
        detection_hook=read_detections, **{callback: lambda: stop[0]},
    )
    executor.preview(task)
    follower.after_solve = lambda: activate.__setitem__(0, len(follower.commands) == 1)
    state = executor.confirm(task.task_id)
    assert state.reason == reason
    assert state.stage == "approach"
    assert [command[0] for command in follower.commands] == ["open"]


@pytest.mark.parametrize("solution,reason", [
    (IKResult(False, None, 1.0, 1.0, "unreachable"), "ik_failed:unreachable"),
    (IKResult(True, None, 0.0, 0.0, "malformed"), "invalid_ik_joints"),
    (IKResult(True, np.full(5, np.nan), 0.0, 0.0, "malformed"), "invalid_ik_joints"),
    (IKResult(True, np.full(5, 100.0), 0.0, 0.0, "bad limits"), "joint_limits"),
    (IKResult(True, np.full(5, 0.2), 0.0, 0.0, "too far"), "joint_delta"),
    (IKResult(True, np.zeros(5), 0.1, 0.0, "bad residual"), "ik_position_error"),
    (IKResult(True, np.zeros(5), 0.0, None, "no orientation"), "ik_orientation_error"),
    (IKResult(True, np.zeros(5), 0.0, 0.1, "bad orientation"), "ik_orientation_error"),
])
def test_unsafe_ik_blocks_all_commands_during_preflight(solution, reason):
    executor, follower, _, task = setup_executor()
    follower.solution = solution
    state = executor.preview(task)
    assert state.phase is TaskPhase.HELD
    assert state.stage == "approach"
    assert state.reason == reason
    assert follower.commands == []


def test_runtime_ik_is_checked_again_after_successful_preflight():
    executor, follower, _, task = setup_executor()
    executor.preview(task)
    follower.after_move = lambda: setattr(follower, "solution", IKResult(False, None, 1.0, 1.0, "lost_ik"))
    state = executor.confirm(task.task_id)
    assert state.reason == "ik_failed:lost_ik"
    assert state.stage == "approach"
    assert len(follower.commands) == 1


def test_adapter_failures_stop_execution_and_report_exact_stage():
    executor, follower, _, task = setup_executor()
    executor.preview(task)
    follower.move_error = RuntimeError("servo failure")
    state = executor.confirm(task.task_id)
    assert state.phase is TaskPhase.FAILED
    assert state.stage == "open"
    assert state.reason == "adapter_error:servo failure"
    assert len(follower.commands) == 1


@pytest.mark.parametrize("q", [np.array([np.nan] * 5), np.zeros(4), np.full(5, 100.0)])
def test_invalid_measured_joint_state_never_moves(q):
    executor, follower, _, task = setup_executor()
    follower.q = q
    assert executor.preview(task).reason == "invalid_measured_joints"
    assert follower.commands == []


def test_position_only_adapter_is_blocked_before_any_command():
    class PositionOnlyFollower(FakeFollower):
        def solve_end_effector(self, position, *, initial_q=None):
            return IKResult(True, initial_q, 0.0, None, "position only")

    executor, follower, _, task = setup_executor(follower=PositionOnlyFollower())
    state = executor.preview(task)
    assert state.phase is TaskPhase.HELD
    assert state.reason == "orientation_unsupported"
    assert follower.commands == []


def test_new_preview_during_execution_cannot_replace_active_task():
    executor, follower, _, task = setup_executor()
    executor.preview(task)
    states = []
    follower.after_move = lambda: states.append(executor.preview(task.model_copy(update={"task_id": "replacement"})))
    final = executor.confirm(task.task_id)
    assert final.phase is TaskPhase.SUCCEEDED
    assert final.task_id == task.task_id
    assert all(state.phase is TaskPhase.EXECUTING and state.task_id == task.task_id for state in states)


def test_bad_motion_configuration_is_rejected_before_execution():
    from backend.gesture_pick.executor import MotionConfig

    for changes in [{"hover_height_m": 0.0}, {"descent_height_m": -0.1},
                    {"speed_deg_s": 0.0}, {"gripper_open": 101.0},
                    {"max_joint_delta_deg": float("inf")}]:
        with pytest.raises(ValueError):
            MotionConfig(**changes)
