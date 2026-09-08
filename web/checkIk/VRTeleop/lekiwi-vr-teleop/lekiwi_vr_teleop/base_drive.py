"""Thumbstick -> omni base velocity.

Mirrors the direction conventions of the existing screen panel (``src/lekiwi_control_app.py``
in the RobotBuild project) so muscle memory carries over: pushing the stick forward drives
the robot physically forward, which on LeKiwi means a NEGATIVE ``x.vel``.
"""

from __future__ import annotations

from .config import BaseConfig


def _apply_deadzone(value: float, deadzone: float) -> float:
    """Zero out stick noise, then rescale so the live range still spans [0, 1]."""
    if abs(value) <= deadzone:
        return 0.0
    scaled = (abs(value) - deadzone) / (1.0 - deadzone)
    return scaled if value > 0 else -scaled


def base_action(
    stick_x: float,
    stick_y: float,
    turn: float,
    config: BaseConfig,
) -> dict[str, float]:
    """Map stick axes to a LeKiwi base command.

    Args:
        stick_x: Translation stick, +1 = pushed right.
        stick_y: Translation stick, +1 = pulled back (WebXR/Gamepad sign convention).
        turn: Rotation axis, +1 = rotate right (clockwise seen from above).
        config: Speed and deadzone envelope.

    Returns:
        ``{"x.vel", "y.vel", "theta.vel"}`` ready to merge into a LeKiwi action.
    """
    right = _apply_deadzone(stick_x, config.deadzone)
    # Gamepad Y is positive when the stick is pulled back, so forward is the negation.
    forward = -_apply_deadzone(stick_y, config.deadzone)
    yaw = _apply_deadzone(turn, config.deadzone)

    longitudinal = -forward if config.invert_longitudinal else forward
    return {
        "x.vel": longitudinal * config.linear_speed_m_s,
        "y.vel": -right * config.linear_speed_m_s,
        "theta.vel": -yaw * config.angular_speed_deg_s,
    }


ZERO_BASE_ACTION: dict[str, float] = {"x.vel": 0.0, "y.vel": 0.0, "theta.vel": 0.0}
