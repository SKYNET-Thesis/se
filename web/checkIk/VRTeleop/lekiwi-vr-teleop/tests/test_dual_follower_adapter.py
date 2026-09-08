import pytest

from lekiwi_vr_teleop.follower_adapter import (
    DualSO101FollowerRobot,
    FakeSOFollower,
)


def test_left_only_connects_and_routes_only_left_action():
    robot = DualSO101FollowerRobot(
        mode="left-only",
        left_port="fake-left-port",
        left_device_id="fake-left-id",
        follower_factory=lambda spec: FakeSOFollower(spec.port, spec.device_id),
    )

    assert robot.is_connected is False
    robot.connect()

    assert robot.is_connected is True
    observation = robot.get_observation()
    assert set(observation) == {
        "left_arm_shoulder_pan.pos",
        "left_arm_shoulder_lift.pos",
        "left_arm_elbow_flex.pos",
        "left_arm_wrist_flex.pos",
        "left_arm_wrist_roll.pos",
        "left_arm_gripper.pos",
    }

    robot.send_action({"left_arm_shoulder_pan.pos": 12.0})
    assert robot.left_follower.last_action == {"shoulder_pan.pos": 12.0}
    robot.disconnect()

    assert robot.is_connected is False
    assert robot.left_follower.disconnect_count == 1


def test_unselected_right_action_is_rejected():
    robot = DualSO101FollowerRobot(
        mode="left-only",
        left_port="fake-left-port",
        left_device_id="fake-left-id",
        follower_factory=lambda spec: FakeSOFollower(spec.port, spec.device_id),
    )
    robot.connect()

    with pytest.raises(KeyError, match="right_arm"):
        robot.send_action({"right_arm_shoulder_pan.pos": 8.0})

    robot.disconnect()


def test_right_only_connects_and_routes_only_right_action():
    robot = DualSO101FollowerRobot(
        mode="right-only",
        right_port="fake-right-port",
        right_device_id="fake-right-id",
    )

    robot.connect()
    robot.send_action({"right_arm_elbow_flex.pos": 37.0})

    assert robot.active_arms == ("right",)
    assert robot.left_follower is None
    assert robot.right_follower.last_action == {"elbow_flex.pos": 37.0}
    assert set(robot.get_observation()) == {
        "right_arm_shoulder_pan.pos",
        "right_arm_shoulder_lift.pos",
        "right_arm_elbow_flex.pos",
        "right_arm_wrist_flex.pos",
        "right_arm_wrist_roll.pos",
        "right_arm_gripper.pos",
    }
    robot.disconnect()


def test_dual_arm_has_distinct_identities_and_routes_actions_without_crossing():
    robot = DualSO101FollowerRobot(
        mode="dual-arm",
        left_port="fake-left-port",
        left_device_id="fake-left-id",
        right_port="fake-right-port",
        right_device_id="fake-right-id",
    )

    robot.connect()
    robot.send_action(
        {
            "left_arm_shoulder_pan.pos": -11.0,
            "right_arm_shoulder_pan.pos": 22.0,
        }
    )

    assert robot.active_arms == ("left", "right")
    assert robot.left_follower.device_id == "fake-left-id"
    assert robot.right_follower.device_id == "fake-right-id"
    assert robot.left_follower.last_action == {"shoulder_pan.pos": -11.0}
    assert robot.right_follower.last_action == {"shoulder_pan.pos": 22.0}
    robot.disconnect()
    assert robot.left_follower.disconnect_count == 1
    assert robot.right_follower.disconnect_count == 1


def test_dual_arm_rejects_duplicate_identity():
    with pytest.raises(ValueError, match="distinct"):
        DualSO101FollowerRobot(
            mode="dual-arm",
            left_port="same-port",
            left_device_id="same-id",
            right_port="same-port",
            right_device_id="same-id",
        )

    with pytest.raises(ValueError, match="distinct"):
        DualSO101FollowerRobot(
            mode="dual-arm",
            left_port="left-port",
            left_device_id="same-id",
            right_port="right-port",
            right_device_id="same-id",
        )


def test_connect_failure_disconnects_already_opened_followers():
    created = []

    class FailingFollower(FakeSOFollower):
        def connect(self, calibrate=True):
            super().connect(calibrate)
            if self.device_id == "fake-right-id":
                raise RuntimeError("right follower failed")

    def factory(spec):
        follower = FailingFollower(spec.port, spec.device_id)
        created.append(follower)
        return follower

    robot = DualSO101FollowerRobot(
        mode="dual-arm",
        left_port="fake-left-port",
        left_device_id="fake-left-id",
        right_port="fake-right-port",
        right_device_id="fake-right-id",
        follower_factory=factory,
    )

    with pytest.raises(RuntimeError, match="right follower failed"):
        robot.connect()

    assert created[0].is_connected is False
    assert created[0].disconnect_count == 1
    assert created[1].is_connected is False
    robot.disconnect()
