#!/usr/bin/env python3
"""Exercise the physical bridge logic with fake buses; never imports LeRobot."""

import math
import sys
import time
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.offline_teleop_server import ControllerPacket, TELEOP_START_Q
from backend.real_vr_teleop_server import JOINTS, RealVRBridge


class FakeArm:
    def __init__(self) -> None:
        self.actions = []

    def send_action(self, action):
        applied = dict(action)
        self.actions.append(applied)
        return applied


class FakeRobot:
    def __init__(self, joint_overrides=None) -> None:
        self.left_arm = FakeArm()
        self.right_arm = FakeArm()
        self.joint_overrides = joint_overrides or {}

    def get_observation(self):
        result = {}
        for side in ("left", "right"):
            for joint, value in zip(JOINTS, np.degrees(TELEOP_START_Q), strict=True):
                result[f"{side}_{joint}.pos"] = float(
                    self.joint_overrides.get((side, joint), value)
                )
            result[f"{side}_gripper.pos"] = 100.0
        return result


class FakeSingleFollower(FakeArm):
    """One follower bus, matching the real single-arm LeRobot object shape."""

    def get_observation(self):
        result = {
            f"{joint}.pos": float(value)
            for joint, value in zip(JOINTS, np.degrees(TELEOP_START_Q), strict=True)
        }
        result["gripper.pos"] = 100.0
        return result


def hand(*, enabled=False, position=(0.0, 1.4, -0.4), rotation=(0.0, 0.0, 0.0, 1.0), trigger=0.0, source="controller"):
    return {
        "connected": True,
        "enabled": enabled,
        "position": list(position),
        "rotation": list(rotation),
        "trigger": trigger,
        "grip": 1.0 if enabled else 0.0,
        "source": source,
    }


def packet(sequence, left, right):
    return ControllerPacket.model_validate({
        "sequence": sequence,
        "timestamp": time.time(),
        "left": left,
        "right": right,
    })


def main():
    robot = FakeRobot()
    bridge = RealVRBridge(
        robot,
        translation_scale=0.45,
        max_joint_step_deg=1.5,
        joint_smoothing=0.35,
        gripper_open=100.0,
        gripper_closed=0.0,
    )

    idle = bridge.process(packet(0, hand(), hand()))
    assert idle["commanded_hands"] == []
    assert not robot.left_arm.actions and not robot.right_arm.actions

    active = bridge.process(packet(1, hand(enabled=True, trigger=1.0), hand()))
    assert active["status"] == "hardware_ok"
    assert active["commanded_hands"] == ["left"]
    assert len(robot.left_arm.actions) == 1 and not robot.right_arm.actions
    assert robot.left_arm.actions[-1]["gripper.pos"] == 98.5
    assert np.allclose(
        active["hardware_pose"]["left"]["joint_positions"],
        np.radians([robot.left_arm.actions[-1][f"{joint}.pos"] for joint in JOINTS]),
    )

    moved = bridge.process(packet(2, hand(enabled=True, position=(0.0, 1.4, -0.42)), hand()))
    assert moved["results"]["left"]["success"]
    delta = np.abs(np.array([
        robot.left_arm.actions[-1][f"{joint}.pos"] - robot.left_arm.actions[-2][f"{joint}.pos"]
        for joint in JOINTS
    ]))
    assert np.all(delta <= 1.500001)

    # WebXR +Y is physical controller-up and must become robot TCP +Z.  This
    # guards against silently swapping elevation with forward/elbow motion.
    bridge.release_clutches()
    bridge.process(packet(3, hand(enabled=True), hand()))
    start_z = bridge.teleop.hands["left"].robot_origin[2]
    raised = bridge.process(packet(4, hand(enabled=True, position=(0.0, 1.46, -0.4)), hand()))
    assert raised["results"]["left"]["success"]
    assert raised["results"]["left"]["target"][2] > start_z

    # Pitching in place is a wrist-only gesture. It must move wrist_flex while
    # leaving elbow_flex at the position-IK solution instead of coupling the
    # two joints together.
    bridge.release_clutches()
    bridge.process(packet(5, hand(enabled=True), hand()))
    before = np.asarray(bridge.teleop.hands["left"].current_q).copy()
    pitch = math.radians(25.0)
    tilted = bridge.process(packet(
        6,
        hand(enabled=True, rotation=(math.sin(pitch / 2), 0.0, 0.0, math.cos(pitch / 2))),
        hand(),
    ))
    tilted_q = np.asarray(tilted["results"]["left"]["joint_positions"])
    assert abs(tilted_q[3] - before[3]) > math.radians(15.0)
    assert abs(tilted_q[2] - before[2]) < math.radians(0.5)

    # A calibrated follower may rest slightly beyond conservative URDF limits.
    # Accept its exact measured pose without auto-recovery: clutching in with a
    # stationary controller must command precisely the same joint positions.
    rest_robot = FakeRobot({("left", "shoulder_lift"): -102.64})
    rest_bridge = RealVRBridge(
        rest_robot,
        translation_scale=0.45,
        max_joint_step_deg=1.5,
        joint_smoothing=0.35,
        gripper_open=100.0,
        gripper_closed=0.0,
    )
    rest_bridge.process(packet(7, hand(enabled=True), hand()))
    assert rest_robot.left_arm.actions
    assert abs(rest_robot.left_arm.actions[-1]["shoulder_lift.pos"] - -102.64) < 1e-6

    # A larger disagreement is still rejected before any command is sent.
    try:
        RealVRBridge(
            FakeRobot({("left", "shoulder_lift"): -106.0}),
            translation_scale=0.45,
            max_joint_step_deg=1.5,
            joint_smoothing=0.35,
            gripper_open=100.0,
            gripper_closed=0.0,
        )
    except RuntimeError:
        pass
    else:
        raise AssertionError("out-of-range startup pose was not rejected")

    # Passthrough mode connects only the selected follower. Input from the
    # other controller must be ignored and must never create a motor command.
    single = FakeSingleFollower()
    single_bridge = RealVRBridge(
        single,
        active_sides=("right",),
        translation_scale=0.45,
        max_joint_step_deg=1.5,
        joint_smoothing=0.35,
        gripper_open=100.0,
        gripper_closed=0.0,
    )
    single_bridge.process(packet(9, hand(enabled=True), hand()))
    assert not single.actions
    single_result = single_bridge.process(packet(10, hand(), hand(enabled=True)))
    assert single_result["commanded_hands"] == ["right"]
    assert len(single.actions) == 1

    # Hardware mode must preserve the same intuitive mapping as offline mode:
    # moving the Quest controller upward raises the TCP, while pitching it up
    # changes wrist_flex without requiring a Cartesian translation.
    right_state = single_bridge.teleop.hands["right"]
    tcp_before = single_bridge.teleop.model.forward_kinematics(single_bridge.last_q["right"]).position
    raised = single_bridge.process(packet(
        11,
        hand(),
        hand(enabled=True, position=(0.0, 1.48, -0.4)),
    ))
    assert raised["commanded_hands"] == ["right"]
    tcp_after = single_bridge.teleop.model.forward_kinematics(single_bridge.last_q["right"]).position
    assert tcp_after[2] > tcp_before[2], (tcp_before, tcp_after)

    single_bridge.release_clutches()
    single_bridge.process(packet(12, hand(), hand(enabled=True)))
    wrist_before = float(single_bridge.last_q["right"][3])
    pitch = math.radians(20.0)
    pitched = single_bridge.process(packet(
        13,
        hand(),
        hand(enabled=True, rotation=(math.sin(pitch / 2), 0.0, 0.0, math.cos(pitch / 2))),
    ))
    assert pitched["commanded_hands"] == ["right"]
    assert abs(float(single_bridge.last_q["right"][3]) - wrist_before) > math.radians(0.5)

    # Hand mode uses the multi-keypoint palm frame. A near-closed pinch freezes
    # orientation so grasping cannot disturb the wrist; releasing the pinch
    # allows the same palm flex to drive wrist_flex through the filtered path.
    single_bridge.release_clutches()
    single_bridge.process(packet(14, hand(), hand(enabled=True, source="hand")))
    hand_wrist_before = single_bridge.last_q["right"][3:].copy()
    single_bridge.process(packet(
        15,
        hand(),
        hand(
            enabled=True,
            source="hand",
            rotation=(math.sin(pitch / 2), 0.0, 0.0, math.cos(pitch / 2)),
            trigger=1.0,
        ),
    ))
    assert np.allclose(single_bridge.last_q["right"][3:], hand_wrist_before)
    single_bridge.process(packet(
        16,
        hand(),
        hand(
            enabled=True,
            source="hand",
            rotation=(math.sin(pitch / 2), 0.0, 0.0, math.cos(pitch / 2)),
            trigger=0.0,
        ),
    ))
    assert abs(float(single_bridge.last_q["right"][3]) - hand_wrist_before[0]) > math.radians(0.5)

    # Reject a single optical tracking relocation instead of slowly chasing it
    # through the physical slew limiter. No motor command is produced.
    action_count = len(single.actions)
    spike = single_bridge.process(packet(
        17,
        hand(),
        hand(enabled=True, source="hand", position=(0.20, 1.4, -0.4)),
    ))
    assert "tracking spike rejected" in spike["results"]["right"]["message"]
    assert len(single.actions) == action_count
    print("REAL VR BRIDGE FAKE-BUS + CLUTCH + SLEW LIMIT: PASS")


if __name__ == "__main__":
    main()
