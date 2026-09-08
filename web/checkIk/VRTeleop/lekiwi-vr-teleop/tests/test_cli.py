"""CLI wiring. A safety flag that silently fails to reach the config is worse than none."""

import pytest

from lekiwi_vr_teleop import cli


def _config(argv):
    parser = cli._build_parser("test")
    parser.add_argument("--remote-ip", default=None)
    parser.add_argument("--robot-id", default="lekiwi_01")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true")
    return cli._build_config(parser.parse_args(argv))


def test_dry_run_defaults_off():
    assert _config([]).dry_run is False


def test_dry_run_reaches_the_config():
    assert _config(["--dry-run"]).dry_run is True


def test_smoothing_reaches_the_arm_config():
    assert _config(["--smoothing", "0.35"]).arm.joint_smoothing_alpha == 0.35


def test_tls_requires_both_halves():
    # Half a TLS config silently serves plain HTTP, and WebXR then refuses the page with
    # no obvious reason. Fail loudly instead.
    with pytest.raises(SystemExit):
        _config(["--cert", "cert.pem"])


def test_hands_and_scale_are_carried_through():
    config = _config(["--arms", "left", "--base-hand", "right", "--position-scale", "0.5"])
    assert config.arm.hand == "left"
    assert config.base.hand == "right"
    assert config.base.turn_hand == "left"
    assert config.arm.position_scale == 0.5


def test_one_arm_is_the_default_and_keeps_lekiwis_wire_prefix():
    config = _config([])
    assert [(arm.hand, arm.prefix) for arm in config.arms] == [("right", "arm_")]


def test_two_arms_need_only_a_second_entry():
    """The whole point of the per-controller layout: a second arm costs one flag."""
    config = _config(["--arms", "left:left_arm_,right:right_arm_"])
    assert [(arm.hand, arm.prefix) for arm in config.arms] == [
        ("left", "left_arm_"),
        ("right", "right_arm_"),
    ]
    # Per-arm tuning applies to both until there is a reason for it not to.
    assert {arm.position_scale for arm in config.arms} == {1.0}


def test_two_arms_without_distinct_prefixes_are_refused():
    """Both arms on one prefix would command the same motors from two hands at once.

    Silently accepting it looks like it works right up until the arm is fought over by two
    controllers, so it is refused at parse time rather than discovered on hardware.
    """
    with pytest.raises(SystemExit):
        _config(["--arms", "left,right"])


def test_one_controller_cannot_drive_two_arms():
    with pytest.raises(SystemExit):
        _config(["--arms", "right:a_,right:b_"])


def test_a_hand_that_is_not_a_hand_is_refused():
    with pytest.raises(SystemExit):
        _config(["--arms", "middle"])


def test_asking_for_the_single_arm_of_a_two_armed_robot_raises():
    """`.arm` is a convenience for the one-armed case; it must not silently pick one."""
    config = _config(["--arms", "left:left_arm_,right:right_arm_"])
    with pytest.raises(ValueError):
        _ = config.arm


def test_the_robots_address_has_no_default():
    """Nobody else's robot lives at the author's address, and a baked-in one publishes a
    LAN layout to everyone who clones the repository."""
    assert _config([]).remote_ip is None
    assert _config(["--remote-ip", "10.0.0.5"]).remote_ip == "10.0.0.5"


def test_the_environment_supplies_the_address(monkeypatch):
    """So the operator's own robot need not be typed every run, nor committed."""
    monkeypatch.setenv(cli.REMOTE_IP_ENV, "10.1.2.3")
    parser = cli._build_parser("test")
    parser.add_argument("--remote-ip", default=__import__("os").environ.get(cli.REMOTE_IP_ENV))
    assert parser.parse_args([]).remote_ip == "10.1.2.3"
    assert parser.parse_args(["--remote-ip", "10.9.9.9"]).remote_ip == "10.9.9.9"
