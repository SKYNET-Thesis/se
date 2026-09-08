"""Offline safety validation primitives reusable by two arm controllers."""

from __future__ import annotations

import numpy as np


def validate_finite(values: np.ndarray | list[float]) -> bool:
    return bool(np.all(np.isfinite(np.asarray(values, dtype=float))))


def validate_joint_limits(q, lower, upper, tolerance: float = 1e-9) -> bool:
    q, lower, upper = map(lambda x: np.asarray(x, dtype=float), (q, lower, upper))
    return bool(q.shape == lower.shape == upper.shape and validate_finite(q) and
                np.all(q >= lower - tolerance) and np.all(q <= upper + tolerance))


def validate_workspace(position, minimum, maximum) -> bool:
    position, minimum, maximum = map(lambda x: np.asarray(x, dtype=float), (position, minimum, maximum))
    return bool(position.shape == minimum.shape == maximum.shape == (3,) and
                validate_finite(position) and np.all(position >= minimum) and np.all(position <= maximum))


def validate_joint_delta(current_q, target_q, max_delta) -> bool:
    current, target, limit = map(lambda x: np.asarray(x, dtype=float), (current_q, target_q, max_delta))
    if limit.ndim == 0:
        limit = np.full(current.shape, limit)
    return bool(current.shape == target.shape == limit.shape and validate_finite(current) and
                validate_finite(target) and np.all(limit >= 0) and np.all(np.abs(target-current) <= limit))
