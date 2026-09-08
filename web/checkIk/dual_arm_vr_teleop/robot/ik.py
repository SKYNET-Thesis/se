"""Bounded numerical IK with mandatory FK verification."""

from __future__ import annotations

from dataclasses import dataclass
import numpy as np

from .kinematics import SO101Kinematics
from .safety import validate_finite, validate_joint_limits


@dataclass(frozen=True)
class IKResult:
    success: bool
    joint_positions: np.ndarray | None
    position_error: float
    orientation_error: float | None
    message: str

    def as_dict(self, model: SO101Kinematics) -> dict:
        return {
            "success": self.success,
            "joint_positions": None if self.joint_positions is None else model.joint_dict(self.joint_positions),
            "position_error": self.position_error,
            "orientation_error": self.orientation_error,
            "message": self.message,
        }


def _rotation_vector(rotation: np.ndarray) -> np.ndarray:
    cos_angle = np.clip((np.trace(rotation) - 1.0) / 2.0, -1.0, 1.0)
    angle = float(np.arccos(cos_angle))
    if angle < 1e-9:
        return np.zeros(3)
    if np.pi - angle < 1e-5:
        values, vectors = np.linalg.eigh((rotation + np.eye(3)) / 2.0)
        axis = vectors[:, np.argmax(values)]
        return axis * angle
    axis = np.array([rotation[2, 1]-rotation[1, 2], rotation[0, 2]-rotation[2, 0], rotation[1, 0]-rotation[0, 1]])
    return axis * (angle / (2.0 * np.sin(angle)))


def _quaternion_matrix(q: np.ndarray) -> np.ndarray:
    q = np.asarray(q, dtype=float)
    if q.shape != (4,) or not validate_finite(q) or np.linalg.norm(q) < 1e-12:
        raise ValueError("target quaternion must be finite [qx, qy, qz, qw]")
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)],
    ])


def _target_rotation(value) -> np.ndarray | None:
    if value is None:
        return None
    value = np.asarray(value, dtype=float)
    rotation = _quaternion_matrix(value) if value.shape == (4,) else value
    if rotation.shape != (3, 3) or not validate_finite(rotation):
        raise ValueError("target_rotation must be a 3x3 matrix or [qx, qy, qz, qw]")
    if not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-5) or np.linalg.det(rotation) < 0.999:
        raise ValueError("target_rotation is not a valid rotation matrix")
    return rotation


def solve_ik(
    model: SO101Kinematics,
    target_position,
    target_rotation=None,
    initial_q=None,
    *,
    position_tolerance: float = 1e-4,
    orientation_tolerance: float = 2e-2,
    max_iterations: int = 350,
    multi_start: bool = True,
    joint_target=None,
    joint_target_weights=None,
    orientation_weight: float = 0.35,
    require_orientation: bool = True,
) -> IKResult:
    """Solve and verify IK. Failure results never expose an unverified configuration."""
    target = np.asarray(target_position, dtype=float)
    if target.shape != (3,) or not validate_finite(target):
        return IKResult(False, None, float("inf"), None, "Target position must contain three finite values")
    try:
        desired_rotation = _target_rotation(target_rotation)
    except ValueError as error:
        return IKResult(False, None, float("inf"), None, str(error))
    if not np.isfinite(orientation_weight) or orientation_weight < 0:
        return IKResult(False, None, float("inf"), None, "orientation_weight must be finite and non-negative")

    lower, upper = model.lower_limits, model.upper_limits
    if initial_q is None:
        initial = np.clip(np.zeros(5), lower, upper)
    else:
        initial = np.asarray(initial_q, dtype=float)
        if initial.shape != (5,) or not validate_finite(initial) or not validate_joint_limits(initial, lower, upper):
            return IKResult(False, None, float("inf"), None, "initial_q is invalid or outside joint limits")

    if joint_target is None:
        preferred_q = initial
        preferred_weights = np.full(5, 1e-3)
    else:
        preferred_q = np.asarray(joint_target, dtype=float)
        preferred_weights = np.asarray(joint_target_weights, dtype=float)
        if (
            preferred_q.shape != (5,)
            or preferred_weights.shape != (5,)
            or not validate_finite(preferred_q)
            or not validate_finite(preferred_weights)
            or np.any(preferred_weights < 0)
        ):
            return IKResult(False, None, float("inf"), None, "joint target/weights must contain five finite values")

    def task_error(q: np.ndarray) -> np.ndarray:
        pose = model.forward_kinematics(q)
        parts = [target - pose.position]
        if desired_rotation is not None:
            # Rotation taking the current end-effector frame to the desired frame.
            parts.append(orientation_weight * _rotation_vector(desired_rotation @ pose.rotation.T))
        return np.concatenate(parts)

    # A small seed-distance residual resolves redundant position-only solutions
    # without materially trading away Cartesian accuracy. This is essential for
    # continuous teleoperation: joints such as wrist_roll must not wander when
    # they do not help the requested XYZ motion.
    def optimization_error(q: np.ndarray) -> np.ndarray:
        return np.concatenate((task_error(q), preferred_weights * (q - preferred_q)))

    midpoint = (lower + upper) / 2.0
    seeds = [initial]
    if multi_start:
        seeds.append(midpoint)
        # Deterministic coverage helps one-shot position-only IK escape local
        # singularities. Realtime tracking disables this and seeds from the
        # previous solution, avoiding twelve complete solves per controller tick.
        fractions = (0.2, 0.8)
        for i in range(5):
            for fraction in fractions:
                seed = midpoint.copy()
                seed[i] = lower[i] + fraction * (upper[i] - lower[i])
                seeds.append(seed)

    best_q, best_score = None, float("inf")
    for seed in seeds:
        q = seed.copy()
        damping = 2e-3
        for _ in range(max_iterations):
            error = optimization_error(q)
            score = float(np.linalg.norm(error))
            if score < best_score:
                best_q, best_score = q.copy(), score
            jacobian = np.empty((error.size, 5))
            step = 1e-6
            for index in range(5):
                shifted = q.copy()
                shifted[index] = min(upper[index], shifted[index] + step)
                actual_step = shifted[index] - q[index]
                if actual_step < step / 2:
                    shifted[index] = max(lower[index], q[index] - step)
                    actual_step = shifted[index] - q[index]
                jacobian[:, index] = (optimization_error(shifted) - error) / actual_step
            # error is target-current, while its numerical derivative has the opposite
            # sign of the usual task Jacobian, hence the leading minus below.
            system = jacobian.T @ jacobian + damping * np.eye(5)
            delta = -np.linalg.solve(system, jacobian.T @ error)
            norm = np.linalg.norm(delta)
            if norm > 0.2:
                delta *= 0.2 / norm
            candidate = np.clip(q + delta, lower, upper)
            if np.linalg.norm(optimization_error(candidate)) < score:
                q, damping = candidate, max(damping * 0.7, 1e-7)
            else:
                damping = min(damping * 5.0, 1e5)
            if np.linalg.norm(delta) < 1e-9:
                break

    if best_q is None or not validate_finite(best_q) or not validate_joint_limits(best_q, lower, upper):
        return IKResult(False, None, float("inf"), None, "IK produced no finite joint-limited solution")
    pose = model.forward_kinematics(best_q)
    position_error = float(np.linalg.norm(target - pose.position))
    orientation_error = None
    if desired_rotation is not None:
        orientation_error = float(np.linalg.norm(_rotation_vector(desired_rotation @ pose.rotation.T)))
    success = position_error <= position_tolerance and (
        orientation_error is None or not require_orientation or orientation_error <= orientation_tolerance
    )
    if not success:
        return IKResult(False, None, position_error, orientation_error, "Target unreachable or solver did not converge")
    return IKResult(True, best_q, position_error, orientation_error, "success")
