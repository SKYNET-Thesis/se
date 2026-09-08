"""Local SO-101 follower runtime for the WebXR teleoperator.

The default driver is deliberately simulated. A serial port is opened only when the
operator supplies both ``--real`` and ``--robot-port``; this prevents auto-discovery from
ever selecting a connected leader arm.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Protocol

from lerobot.utils.robot_utils import precise_sleep

from .arm import ArmController, HoldLatch
from .config import ARM_MOTORS, TeleopConfig
from .relay import Relay
from .state import XRState

logger = logging.getLogger(__name__)

START_POSE = {
    "shoulder_pan.pos": 0.0,
    "shoulder_lift.pos": -40.0,
    "elbow_flex.pos": 50.0,
    "wrist_flex.pos": 20.0,
    "wrist_roll.pos": 0.0,
    "gripper.pos": 60.0,
}


class LocalFollower(Protocol):
    is_connected: bool

    def connect(self, calibrate: bool = True) -> None: ...
    def get_observation(self) -> dict[str, Any]: ...
    def send_action(self, action: dict[str, float]) -> dict[str, float]: ...
    def disconnect(self) -> None: ...


class FakeSOFollower:
    """Minimal deterministic follower used for browser and IK bring-up."""

    def __init__(self) -> None:
        self.is_connected = False
        self._observation = dict(START_POSE)

    def connect(self, calibrate: bool = True) -> None:
        del calibrate
        self.is_connected = True

    def get_observation(self) -> dict[str, float]:
        return dict(self._observation)

    def send_action(self, action: dict[str, float]) -> dict[str, float]:
        if not self.is_connected:
            raise RuntimeError("fake follower is disconnected")
        self._observation.update({key: float(value) for key, value in action.items()})
        return dict(action)

    def disconnect(self) -> None:
        self.is_connected = False


def make_follower(
    *, real: bool, robot_port: str | None, robot_id: str = "my_awesome_bimanual_follower_left"
) -> LocalFollower:
    if not real:
        return FakeSOFollower()
    if not robot_port:
        raise ValueError("real mode requires an explicit follower serial port")

    # Lazy import keeps fake/offline mode independent from serial hardware discovery.
    from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig

    return SO101Follower(
        SO101FollowerConfig(
            port=robot_port,
            id=robot_id,
            use_degrees=True,
            disable_torque_on_disconnect=True,
            # ArmController already rate-limits against its last command and fault-limits
            # against the measured pose. Enabling LeRobot's second clamp changes the sent
            # action without feeding that change back to the controller, so its limiter
            # anchors drift apart and the arm can neither catch up nor reach full height.
            max_relative_target=None,
        )
    )


def run_local_so101(
    config: TeleopConfig, *, real: bool = False, robot_port: str | None = None
) -> None:
    """Run one local SO-101 follower from one selected Quest hand."""
    if len(config.arms) != 1:
        raise ValueError("local SO-101 runtime supports exactly one follower arm")

    state = XRState()
    relay = Relay(config.relay, state)
    robot = make_follower(real=real, robot_port=robot_port, robot_id=config.robot_id)
    arm = ArmController(config.arm)
    hold = HoldLatch()
    mode = "REAL FOLLOWER" if real else "FAKE (no serial port opened)"

    print(f"Driver: {mode}; control hand: {config.arm.hand}", flush=True)
    if not real:
        print("Offline simulation is active. Add --real --robot-port /dev/... only after testing.", flush=True)

    last_tick = time.perf_counter()
    try:
        robot.connect()
        observation = robot.get_observation()
        arm.seed(observation)
        relay.start()
        print(f"VR panel READY: {relay.operator_url}?hand={config.arm.hand}", flush=True)
        logger.info("Follower seeded; waiting for fresh Quest tracking and clutch")

        while True:
            started = time.perf_counter()
            dt_s = started - last_tick
            last_tick = started
            try:
                observation = robot.get_observation()
                snapshot = state.snapshot()
                fresh = snapshot.is_fresh(config.input_timeout_s)
                if fresh:
                    target = arm.compute(
                        snapshot.controller(config.arm.hand), observation, dt_s=dt_s
                    )
                else:
                    arm.release()
                    target = None
                action = hold.resolve(target, observation)
                robot.send_action(action)
                relay.publish_cameras(observation)
                relay.publish_telemetry(
                    {
                        "robotConnected": True,
                        "driver": "real" if real else "fake",
                        "inputFresh": fresh,
                        "inputAgeS": round(snapshot.age_s, 3) if snapshot.age_s < 1e5 else None,
                        "arms": {
                            config.arm.hand: {
                                "engaged": arm.engaged,
                                "simulated": not real,
                                "joints": {
                                    name: round(float(observation[f"{name}.pos"]), 1)
                                    for name in ARM_MOTORS
                                },
                                "jointsTarget": {
                                    name: round(float(action[f"{name}.pos"]), 1)
                                    for name in ARM_MOTORS
                                },
                                "gripperTaken": arm.gripper_taken,
                                "gripperHolding": arm.gripper_holding,
                                **arm.diagnostics(),
                            }
                        },
                        "error": None,
                    }
                )
            except Exception as exc:  # keep the server alive but revoke motion authority
                arm.release()
                hold.reset()
                state.trigger_stop()
                relay.publish_telemetry(
                    {"robotConnected": bool(robot.is_connected), "driver": "real" if real else "fake", "error": str(exc)}
                )
                logger.exception("SO-101 control tick failed; STOP has been latched")
            precise_sleep(max(1 / config.fps - (time.perf_counter() - started), 0.0))
    except KeyboardInterrupt:
        print("Stopping.")
    finally:
        try:
            if robot.is_connected:
                observation = robot.get_observation()
                robot.send_action(
                    {f"{name}.pos": float(observation[f"{name}.pos"]) for name in ARM_MOTORS}
                )
        except Exception as exc:
            logger.warning("Could not send final hold: %s", exc)
        relay.stop()
        if robot.is_connected:
            robot.disconnect()
