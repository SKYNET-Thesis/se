import numpy as np

from lekiwi_vr_teleop.phone import PhonePose, Vector3, phone_position
from lekiwi_vr_teleop.state import XRState
from lekiwi_vr_teleop.arm import ArmController
from lekiwi_vr_teleop.config import ArmConfig
from lekiwi_vr_teleop.local_teleop import FakeSOFollower
from lerobot.utils.rotation import Rotation


def test_arkit_up_right_forward_map_to_robot_axes():
    assert np.allclose(phone_position(Vector3(x=0, y=.05, z=0)), [0, 0, .05])
    assert np.allclose(phone_position(Vector3(x=.05, y=0, z=0)), [0, -.05, 0])
    assert np.allclose(phone_position(Vector3(x=0, y=0, z=-.05)), [.05, 0, 0])


def test_phone_rotation_does_not_translate_and_gripper_opens_then_closes():
    robot = FakeSOFollower()
    robot.connect()
    state = XRState()
    state.start_phone_session("test", "left")
    arm = ArmController(ArmConfig(hand="left"))
    arm.seed(robot.get_observation())

    def tick(seq, closed=False, quaternion=(0, 0, 0, 1), tracking="tracking"):
        pose = PhonePose(type="phone_pose", protocolVersion=1, platform="ios",
                         sessionId="test", sequence=seq, timestampNs=seq + 1,
                         trackingState=tracking, enabled=True, fineMode=False,
                         position={"x": 0, "y": 0, "z": 0},
                         quaternion=dict(zip(("x", "y", "z", "w"), quaternion)),
                         gripperVelocity=0, gripperClosed=closed)
        state.update_from_phone(pose)
        action = arm.compute(state.snapshot().controller("left"), robot.get_observation(), 1 / 30)
        if action is not None:
            robot.send_action(action)
        return action

    for i in range(60):
        tick(i)
    before = robot.get_observation()
    assert before["gripper.pos"] == 100
    rotation = Rotation.from_rotvec([.2, .1, .3]).as_quat()
    after = tick(60, quaternion=rotation)
    for name in before:
        if name != "gripper.pos":
            assert abs(before[name] - after[name]) < .01
    for i in range(61, 121):
        tick(i, closed=True)
    assert robot.get_observation()["gripper.pos"] == 0
    assert tick(121, tracking="limited") is None
