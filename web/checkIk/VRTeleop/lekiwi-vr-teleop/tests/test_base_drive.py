"""Base mapping: deadzone, and the sign conventions inherited from the screen panel."""

import pytest

from lekiwi_vr_teleop.base_drive import base_action
from lekiwi_vr_teleop.config import BaseConfig

CONFIG = BaseConfig()


def test_centred_stick_is_a_full_stop():
    action = base_action(0.0, 0.0, 0.0, CONFIG)
    assert action == {"x.vel": 0.0, "y.vel": 0.0, "theta.vel": 0.0}


@pytest.mark.parametrize("value", [0.1, -0.1, 0.14])
def test_deadzone_swallows_stick_rest_noise(value):
    action = base_action(value, value, value, CONFIG)
    assert action == {"x.vel": 0.0, "y.vel": 0.0, "theta.vel": 0.0}


def test_forward_push_drives_physically_forward():
    # Gamepad Y is negative when the stick is pushed away from the operator, and LeKiwi's
    # x.vel is inverted relative to that (documented in LEKIWI_SETUP_AND_TELEOP.md).
    action = base_action(0.0, -1.0, 0.0, CONFIG)
    assert action["x.vel"] == pytest.approx(-CONFIG.linear_speed_m_s)
    assert action["y.vel"] == 0.0


def test_right_push_strafes_right():
    action = base_action(1.0, 0.0, 0.0, CONFIG)
    assert action["y.vel"] == pytest.approx(-CONFIG.linear_speed_m_s)


def test_turn_right_is_negative_theta():
    action = base_action(0.0, 0.0, 1.0, CONFIG)
    assert action["theta.vel"] == pytest.approx(-CONFIG.angular_speed_deg_s)


def test_speed_never_exceeds_the_configured_limit():
    for x in (-1.0, -0.5, 0.5, 1.0):
        action = base_action(x, x, x, CONFIG)
        assert abs(action["x.vel"]) <= CONFIG.linear_speed_m_s + 1e-9
        assert abs(action["y.vel"]) <= CONFIG.linear_speed_m_s + 1e-9
        assert abs(action["theta.vel"]) <= CONFIG.angular_speed_deg_s + 1e-9
