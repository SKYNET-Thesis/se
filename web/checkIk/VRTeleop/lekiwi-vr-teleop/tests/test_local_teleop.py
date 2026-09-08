import pytest

from lekiwi_vr_teleop.local_teleop import FakeSOFollower, make_follower


def test_fake_follower_is_the_default_and_never_needs_a_port():
    robot = make_follower(real=False, robot_port=None)
    assert isinstance(robot, FakeSOFollower)
    robot.connect()
    before = robot.get_observation()
    robot.send_action({"shoulder_pan.pos": 12.0})
    assert robot.get_observation()["shoulder_pan.pos"] == 12.0
    assert robot.get_observation()["gripper.pos"] == before["gripper.pos"]


def test_real_follower_refuses_to_guess_a_serial_port():
    with pytest.raises(ValueError, match="explicit follower serial port"):
        make_follower(real=True, robot_port=None)


def test_real_follower_uses_the_registered_so101_config_without_connecting():
    robot = make_follower(
        real=True, robot_port="/dev/not-opened-by-construction", robot_id="test_follower"
    )
    assert robot.config.id == "test_follower"
    assert robot.config.port == "/dev/not-opened-by-construction"
    assert robot.config.max_relative_target is None
