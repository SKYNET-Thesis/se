import pytest

from lekiwi_vr_teleop.process import (
    parse_process_args,
    start_fake_session,
)


def _argv(*extra: str) -> list[str]:
    return [
        "--left-port",
        "/dev/fake-left",
        "--left-device-id",
        "left-id",
        "--right-port",
        "/dev/fake-right",
        "--right-device-id",
        "right-id",
        "--certificate",
        "cert.pem",
        "--key",
        "key.pem",
        "--relay-port",
        "9443",
        *extra,
    ]


def test_process_defaults_to_dual_arm_and_keeps_explicit_configuration():
    config = parse_process_args(_argv())

    assert config.mode == "dual-arm"
    assert config.left_port == "/dev/fake-left"
    assert config.right_device_id == "right-id"
    assert config.certificate.name == "cert.pem"
    assert config.key.name == "key.pem"
    assert config.relay_port == 9443


@pytest.mark.parametrize("mode, selected", [("left-only", "left"), ("right-only", "right")])
def test_single_arm_mode_does_not_require_unselected_follower(mode, selected):
    args = [
        "--mode",
        mode,
        f"--{selected}-port",
        f"/dev/fake-{selected}",
        f"--{selected}-device-id",
        f"{selected}-id",
        "--certificate",
        "cert.pem",
        "--key",
        "key.pem",
        "--relay-port",
        "9443",
    ]

    config = parse_process_args(args)

    assert config.mode == mode


@pytest.mark.parametrize(
    "extra, message",
    [
        (["--mode", "invalid"], "invalid choice"),
        (["--certificate", "cert.pem"], "--certificate and --key"),
        (["--relay-port", "0"], "relay port"),
        (["--remote-ip", "127.0.0.1"], "unrecognized arguments"),
    ],
)
def test_invalid_process_configuration_has_clear_cli_error(extra, message, capsys):
    if extra == ["--certificate", "cert.pem"]:
        args = _argv()
        args.remove("--key")
        args.remove("key.pem")
        args.extend(extra)
    else:
        args = _argv(*extra)
    with pytest.raises(SystemExit) as error:
        parse_process_args(args)

    assert error.value.code == 2
    assert message in capsys.readouterr().err


def test_fake_startup_connects_and_seeds_each_selected_arm():
    config = parse_process_args(_argv())

    session = start_fake_session(config)

    assert session.active_arms == ("left", "right")
    assert set(session.seed_observation) == {
        "left_arm_shoulder_pan.pos",
        "left_arm_shoulder_lift.pos",
        "left_arm_elbow_flex.pos",
        "left_arm_wrist_flex.pos",
        "left_arm_wrist_roll.pos",
        "left_arm_gripper.pos",
        "right_arm_shoulder_pan.pos",
        "right_arm_shoulder_lift.pos",
        "right_arm_elbow_flex.pos",
        "right_arm_wrist_flex.pos",
        "right_arm_wrist_roll.pos",
        "right_arm_gripper.pos",
    }
    session.close()


@pytest.mark.parametrize(
    "mode, arm",
    [("left-only", "left"), ("right-only", "right"), ("dual-arm", "both")],
)
def test_fake_startup_supports_all_arm_modes(mode, arm):
    config = parse_process_args(
        _argv("--mode", mode)
        if mode == "dual-arm"
        else [
            "--mode",
            mode,
            f"--{arm}-port",
            f"/dev/fake-{arm}",
            f"--{arm}-device-id",
            f"{arm}-id",
            "--certificate",
            "cert.pem",
            "--key",
            "key.pem",
            "--relay-port",
            "9443",
        ]
    )

    session = start_fake_session(config)

    expected_arms = ("left", "right") if arm == "both" else (arm,)
    assert session.active_arms == expected_arms
    session.close()
