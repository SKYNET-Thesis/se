"""Guarded synchronous execution over an already-authorized follower adapter.

No hardware is constructed here. The caller owns readiness, motion authorization,
exclusive follower ownership and the live detection/E-stop callbacks. A blocking
move must complete (or raise) before returning; cancellation prevents subsequent
stages. Interrupting an in-flight move remains the adapter's responsibility.
"""

from __future__ import annotations

from dataclasses import dataclass
from inspect import signature
from threading import RLock
from time import time
from typing import Callable, Iterable, Protocol

import numpy as np
from pydantic import Field, model_validator

from robot.ik import IKResult
from robot.kinematics import SO101Kinematics
from robot.safety import validate_joint_delta, validate_joint_limits

from .calibration import TableCalibration
from .config import GesturePickConfig
from .models import DetectedTag, FrozenModel, PickPlaceTask, TaskPhase, TaskState


class MotionConfig(FrozenModel):
    """Metres above the table, degrees per second and controller gripper [0,100]."""

    hover_height_m: float = Field(default=0.08, gt=0, allow_inf_nan=False)
    descent_height_m: float = Field(default=0.015, ge=0, allow_inf_nan=False)
    gripper_open: float = Field(default=75.0, ge=0, le=100, allow_inf_nan=False)
    gripper_closed: float = Field(default=0.0, ge=0, le=100, allow_inf_nan=False)
    speed_deg_s: float = Field(default=3.0, gt=0, allow_inf_nan=False)
    max_joint_delta_deg: float = Field(default=10.0, gt=0, allow_inf_nan=False)
    position_tolerance_m: float = Field(default=1e-4, gt=0, allow_inf_nan=False)
    orientation_tolerance_rad: float = Field(default=0.02, gt=0, allow_inf_nan=False)
    top_down_rotation: tuple[tuple[float, float, float], ...] = (
        (1.0, 0.0, 0.0), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0),
    )

    @model_validator(mode="after")
    def valid_geometry(self):
        if self.hover_height_m <= self.descent_height_m:
            raise ValueError("hover height must exceed descent height")
        rotation = np.asarray(self.top_down_rotation)
        if (rotation.shape != (3, 3) or not np.isfinite(rotation).all()
                or not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-8)
                or not np.isclose(np.linalg.det(rotation), 1.0)
                or not np.allclose(rotation[:, 2], [0.0, 0.0, -1.0], atol=1e-8)):
            raise ValueError("top-down rotation must point the tool Z axis downward")
        return self


class FollowerAdapter(Protocol):
    model: SO101Kinematics

    def get_joint_positions(self) -> tuple[np.ndarray, float]: ...

    def solve_end_effector(self, position, *, initial_q=None,
                           target_rotation=None) -> IKResult: ...

    def move_joints(self, target_q, *, start_q, gripper: float,
                    max_total_delta_deg: float, speed_deg_s: float) -> None: ...


@dataclass(frozen=True)
class _Stage:
    name: str
    position: tuple[float, float, float] | None
    gripper: float


class _Hold(Exception):
    pass


class PickPlaceExecutor:
    def __init__(
        self,
        follower: FollowerAdapter,
        config: GesturePickConfig,
        calibration: TableCalibration,
        detections: Callable[[], Iterable[DetectedTag]],
        *,
        clock: Callable[[], float] = time,
        should_cancel: Callable[[], bool] = lambda: False,
        is_estopped: Callable[[], bool] = lambda: False,
        motion: MotionConfig | None = None,
    ):
        self.follower = follower
        self.config = config
        self.calibration = calibration
        self.motion = motion or MotionConfig()
        self._detections = detections
        self._clock = clock
        self._should_cancel = should_cancel
        self._is_estopped = is_estopped
        self._lock = RLock()
        self._task: PickPlaceTask | None = None
        self._cancel_reason: str | None = None
        self._running = False
        self._state = TaskState(phase=TaskPhase.IDLE, updated_at=self._timestamp())

    def _timestamp(self):
        try:
            now = float(self._clock())
            if np.isfinite(now) and now >= 0:
                return now
        except Exception:
            pass
        return self._state.updated_at if hasattr(self, "_state") else 0.0

    def _set_state(self, phase, *, stage=None, reason=None):
        with self._lock:
            self._state = TaskState(phase=phase, task_id=self._task.task_id if self._task else None,
                                    stage=stage, reason=reason, updated_at=self._timestamp())
            return self._state

    def status(self) -> TaskState:
        with self._lock:
            return self._state

    def cancel(self, reason: str) -> TaskState:
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError("cancellation reason must be nonempty")
        with self._lock:
            if self._state.phase.is_terminal:
                return self._state
            self._cancel_reason = reason
            return self._set_state(TaskPhase.HELD, stage=self._state.stage, reason=reason)

    def _check_stop(self):
        if self._is_estopped():
            raise _Hold("estop")
        if self._cancel_reason:
            raise _Hold(self._cancel_reason)
        if self._should_cancel():
            raise _Hold("cancelled")

    def _guard(self):
        self._check_stop()
        if self.calibration.camera_path != self.config.camera_path:
            raise _Hold("calibration_camera_mismatch")
        if self._task.follower_side != self.config.follower_side:
            raise _Hold("follower_side_mismatch")
        observations = list(self._detections())
        # Reading the source can consume the entire freshness allowance.
        now = float(self._clock())
        if not np.isfinite(now) or now < 0:
            raise _Hold("invalid_clock")
        selected = []
        for tag_id, kind in [(self._task.object_tag_id, "object"), (self._task.box_tag_id, "box")]:
            if self.config.tags.get(tag_id) != kind:
                raise _Hold(f"unknown_tag:{tag_id}")
            candidates = [tag for tag in observations if tag.tag_id == tag_id]
            if len(candidates) > 1:
                raise _Hold(f"ambiguous_tag:{tag_id}")
            if not candidates or not candidates[0].visible:
                raise _Hold(f"missing_tag:{tag_id}")
            tag = candidates[0]
            if tag.kind != kind:
                raise _Hold(f"tag_kind_mismatch:{tag_id}")
            if tag.observed_at > now:
                raise _Hold(f"future_tag:{tag_id}")
            if now - tag.observed_at > self.config.max_tag_age_s:
                raise _Hold(f"stale_tag:{tag_id}")
            if not self.calibration.contains_robot_point(tag.robot_point):
                raise _Hold(f"outside_table:{tag_id}")
            if abs(tag.robot_point[2] - self.calibration.table_z) > 1e-9:
                raise _Hold(f"off_table_plane:{tag_id}")
            selected.append(tag)
        self._check_stop()  # The detection callback may have allowed a stop to arrive.
        return selected

    def _plan(self, selected):
        obj, box = selected
        def point(tag, height):
            return (tag.robot_point[0], tag.robot_point[1], self.calibration.table_z + height)

        hover_object = point(obj, self.motion.hover_height_m)
        descend_object = point(obj, self.motion.descent_height_m)
        hover_box = point(box, self.motion.hover_height_m)
        descend_box = point(box, self.motion.descent_height_m)
        opened, closed = self.motion.gripper_open, self.motion.gripper_closed
        return [
            _Stage("open", None, opened), _Stage("approach", hover_object, opened),
            _Stage("descend", descend_object, opened), _Stage("close", None, closed),
            _Stage("lift", hover_object, closed), _Stage("travel", hover_box, closed),
            _Stage("place", descend_box, closed), _Stage("release", None, opened),
            _Stage("retreat", hover_box, opened),
        ]

    def _measured_joints(self):
        q, gripper = self.follower.get_joint_positions()
        q = np.asarray(q, dtype=float)
        if q.shape != (5,) or not validate_joint_limits(
                q, self.follower.model.lower_limits, self.follower.model.upper_limits):
            raise _Hold("invalid_measured_joints")
        if not np.isfinite(gripper) or not 0 <= gripper <= 100:
            raise _Hold("invalid_measured_gripper")
        return q

    def _validate_joints(self, start, target):
        target = np.asarray(target, dtype=float)
        if target.shape != (5,) or not np.isfinite(target).all():
            raise _Hold("invalid_ik_joints")
        if not validate_joint_limits(target, self.follower.model.lower_limits,
                                     self.follower.model.upper_limits):
            raise _Hold("joint_limits")
        if not validate_joint_delta(start, target, np.radians(self.motion.max_joint_delta_deg)):
            raise _Hold("joint_delta")
        return target

    def _solve(self, stage, start):
        if stage.position is None:
            return self._validate_joints(start, start)
        if not self.calibration.contains_robot_point(stage.position):
            raise _Hold("outside_table_target")
        solve = self.follower.solve_end_effector
        try:
            signature(solve).bind(stage.position, initial_q=start,
                                  target_rotation=np.asarray(self.motion.top_down_rotation))
        except (TypeError, ValueError):
            raise _Hold("orientation_unsupported") from None
        result = solve(stage.position, initial_q=start,
                       target_rotation=np.asarray(self.motion.top_down_rotation))
        if not result.success:
            raise _Hold(f"ik_failed:{result.message}")
        if result.joint_positions is None:
            raise _Hold("invalid_ik_joints")
        target = self._validate_joints(start, result.joint_positions)
        if (not np.isfinite(result.position_error) or result.position_error < 0
                or result.position_error > self.motion.position_tolerance_m):
            raise _Hold("ik_position_error")
        if (result.orientation_error is None or not np.isfinite(result.orientation_error)
                or result.orientation_error < 0
                or result.orientation_error > self.motion.orientation_tolerance_rad):
            raise _Hold("ik_orientation_error")
        return target

    def _preflight(self):
        self._set_state(self._state.phase, stage="preflight")
        plan = self._plan(self._guard())
        q = self._measured_joints()
        for stage in plan:
            self._set_state(self._state.phase, stage=stage.name)
            self._guard()
            q = self._solve(stage, q)
            self._guard()  # IK may outlast a fresh camera observation.
        return plan

    def _failure(self, error):
        if self._cancel_reason:
            return self._set_state(TaskPhase.HELD, stage=self._state.stage, reason=self._cancel_reason)
        phase = TaskPhase.HELD if isinstance(error, _Hold) else TaskPhase.FAILED
        reason = str(error) if isinstance(error, _Hold) else f"adapter_error:{error}"
        return self._set_state(phase, stage=self._state.stage, reason=reason)

    def preview(self, task: PickPlaceTask) -> TaskState:
        with self._lock:
            if self._running:
                return self._state
            self._task = task
            self._cancel_reason = None
            self._set_state(TaskPhase.PREVIEW, stage="preflight")
            try:
                self._preflight()
                return self._set_state(TaskPhase.PREVIEW)
            except Exception as error:
                return self._failure(error)

    def confirm(self, task_id: str) -> TaskState:
        with self._lock:
            if self._running or self._state.phase.is_terminal and self._task and task_id == self._task.task_id:
                return self._state
            if self._task is None:
                return self._set_state(TaskPhase.HELD, reason="no_preview")
            if task_id != self._task.task_id:
                return self._set_state(TaskPhase.HELD, reason="task_id_mismatch")
            if self._state.phase is not TaskPhase.PREVIEW:
                return self._state
            self._running = True
            self._set_state(TaskPhase.EXECUTING, stage="preflight")
        try:
            plan = self._preflight()
            for stage in plan:
                if self._cancel_reason:
                    raise _Hold(self._cancel_reason)
                self._set_state(TaskPhase.EXECUTING, stage=stage.name)
                self._guard()
                start = self._measured_joints()
                target = self._solve(stage, start)
                measured = self._measured_joints()
                self._validate_joints(measured, target)
                self._guard()  # Last check immediately before the adapter command.
                self.follower.move_joints(
                    target, start_q=measured, gripper=stage.gripper,
                    max_total_delta_deg=self.motion.max_joint_delta_deg,
                    speed_deg_s=self.motion.speed_deg_s,
                )
                self._check_stop()
            return self._set_state(TaskPhase.SUCCEEDED, stage=plan[-1].name)
        except Exception as error:
            return self._failure(error)
        finally:
            with self._lock:
                self._running = False
