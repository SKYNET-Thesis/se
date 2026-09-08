"""The synchronous 30 Hz control loop.

Shape of one tick::

    observation  ->  freshness gate  ->  arm (clutch + kinematics)  ->  action  ->  robot
                                     ->  base (thumbstick)

Nothing here talks to the headset directly: the relay thread keeps :class:`XRState`
up to date, and this loop only reads snapshots. That means a hung browser, a closed
socket and a removed headset all look identical to the loop — stale input — and all
produce the same response: zero base velocity and a held arm pose.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from lerobot.robots.lekiwi import LeKiwiClient, LeKiwiClientConfig
from lerobot.utils.robot_utils import precise_sleep

from .arm import ArmController, HoldLatch
from .base_drive import ZERO_BASE_ACTION, base_action
from .config import ARM_MOTORS, ArmConfig, TeleopConfig
from .relay import Relay
from .state import XRState

logger = logging.getLogger(__name__)


def _arm_observation(observation: dict[str, Any], prefix: str) -> dict[str, float]:
    """Strip the robot's arm prefix, in motor order, for the kinematics pipeline."""
    return {f"{name}.pos": float(observation[f"{prefix}{name}.pos"]) for name in ARM_MOTORS}


def _prefix_arm_action(action: dict[str, float], prefix: str) -> dict[str, float]:
    return {f"{prefix}{key}": value for key, value in action.items()}


class _Arm:
    """One arm and the per-arm state the loop keeps for it.

    Bundled rather than left as parallel dicts so adding a second arm cannot leave one of
    them half-wired — the failure mode would be an arm that is commanded but never held,
    or held from another arm's observation.
    """

    def __init__(self, config: ArmConfig, simulate: bool = False):
        self.config = config
        self.controller = ArmController(config)
        self.hold = HoldLatch()
        # Dry run models an arm that follows its command exactly, and says so.
        #
        # Without it a dry run cannot test control at all: nothing is ever sent, so the
        # measured pose never changes, so the following-error limiter -- correctly --
        # refuses to let the command travel more than max_tracking_error_deg from an arm
        # that is standing still. A whole session was spent reading that as erratic
        # kinematics; the commanded shoulder_pan ranged over exactly the parked angle
        # +-25 deg, which is the limiter and nothing else.
        self.simulate = simulate
        self._simulated: dict[str, float] | None = None

    def observation(self, observation: dict[str, Any]) -> dict[str, float]:
        measured = _arm_observation(observation, self.config.prefix)
        if not self.simulate:
            return measured
        if self._simulated is None:
            self._simulated = dict(measured)
        return dict(self._simulated)

    def accept(self, action: dict[str, float]) -> None:
        """Let the simulated arm arrive where it was told to be."""
        if self.simulate:
            self._simulated = dict(action)

    def telemetry(self, measured: dict[str, float], commanded: dict[str, float]) -> dict[str, Any]:
        return {
            "engaged": self.controller.engaged,
            "approachingReady": self.controller.approaching_ready,
            # Both, and never again just one. The headset draws a skeleton from each: where
            # the arm IS, and where it has been TOLD to be. The gap between them is the
            # servo lag, in degrees, visible at a glance — which is the only honest way to
            # show a lag that varies with network jitter. Publishing only the command, as
            # this once did, showed the operator what was asked for and called it the arm's
            # position.
            # In a dry run these are the simulated arm, not the real one; `simulated` says so.
            "simulated": self.simulate,
            "joints": {name: round(measured[f"{name}.pos"], 1) for name in ARM_MOTORS},
            "jointsTarget": {name: round(commanded[f"{name}.pos"], 1) for name in ARM_MOTORS},
            "gripperTaken": self.controller.gripper_taken,
            "gripperHolding": self.controller.gripper_holding,
            **self.controller.diagnostics(),
        }


def run(config: TeleopConfig) -> None:
    """Connect to the LeKiwi host and teleoperate until interrupted."""
    state = XRState()
    relay = Relay(config.relay, state)
    robot = LeKiwiClient(LeKiwiClientConfig(remote_ip=config.remote_ip, id=config.robot_id))
    arms = [_Arm(arm_config, simulate=config.dry_run) for arm_config in config.arms]

    relay.start()
    # flush: connecting to the robot below takes several seconds, and without this the
    # "where do I point the headset" line sits in the buffer for all of it — which reads in
    # the headset as "localhost refused the connection".
    print(f"VR panel: {getattr(relay, 'operator_url', relay.url)}", flush=True)
    print("Open this URL in the Quest browser, then press 'Войти в VR'.", flush=True)
    if config.dry_run:
        print(
            "DRY RUN: nothing is ever sent to the robot. The arm shown is a SIMULATION that "
            "follows its command exactly — the real arm never moves, so its measured pose "
            "would otherwise freeze the safety limiters and no control could be judged.",
            flush=True,
        )

    last_error: str | None = None
    last_error_log_at = 0.0
    try:
        robot.connect()
        if not robot.is_connected:
            raise RuntimeError("LeKiwi host is not connected")
        first = robot.get_observation()
        for arm in arms:
            arm.controller.seed(arm.observation(first))
        logger.info(
            "Clutch seeded from the measured pose of %d arm(s); entering the control loop",
            len(arms),
        )

        while True:
            started = time.perf_counter()
            try:
                observation = robot.get_observation()
                snapshot = state.snapshot()
                fresh = snapshot.is_fresh(config.input_timeout_s)

                if fresh:
                    stick = snapshot.controller(config.base.hand)
                    turn = snapshot.controller(config.base.turn_hand).stick_x
                    base_target = base_action(stick.stick_x, stick.stick_y, turn, config.base)
                else:
                    # No trustworthy operator input: open every clutch and stop the wheels.
                    base_target = dict(ZERO_BASE_ACTION)

                action: dict[str, float] = {}
                measured: dict[str, dict[str, float]] = {}
                commanded: dict[str, dict[str, float]] = {}
                for arm in arms:
                    arm_obs = arm.observation(observation)
                    if fresh:
                        target = arm.controller.compute(
                            snapshot.controller(arm.config.hand), arm_obs
                        )
                    else:
                        arm.controller.release()
                        target = None
                    arm_action = arm.hold.resolve(target, arm_obs)
                    arm.accept(arm_action)
                    action.update(_prefix_arm_action(arm_action, arm.config.prefix))
                    measured[arm.config.hand] = arm_obs
                    commanded[arm.config.hand] = arm_action

                if not config.dry_run:
                    robot.send_action({**action, **base_target})

                relay.publish_cameras(observation)
                relay.publish_telemetry(
                    {
                        "robotConnected": True,
                        "inputFresh": fresh,
                        "inputAgeS": round(snapshot.age_s, 3) if snapshot.age_s < 1e5 else None,
                        # Keyed by the hand that drives each arm, always — even with one
                        # arm. A shape that changes when a second arm appears is a shape
                        # every consumer has to special-case twice.
                        "arms": {
                            arm.config.hand: arm.telemetry(
                                measured[arm.config.hand], commanded[arm.config.hand]
                            )
                            for arm in arms
                        },
                        "base": {key: round(value, 3) for key, value in base_target.items()},
                        "dryRun": config.dry_run,
                        "error": None,
                    }
                )
                last_error = None
            except Exception as exc:  # noqa: BLE001 - the loop must survive transport hiccups
                # Never leave a non-zero base command behind an error. The Pi watchdog
                # stops the wheels on silence too, but that is the second layer, not the
                # first.
                for arm in arms:
                    arm.controller.release()
                    arm.hold.reset()
                last_error = str(exc)
                relay.publish_telemetry({"robotConnected": False, "error": last_error})
                if time.monotonic() - last_error_log_at > 1:
                    logger.error("Teleop error: %s", exc)
                    last_error_log_at = time.monotonic()

            precise_sleep(max(1 / config.fps - (time.perf_counter() - started), 0.0))
    except KeyboardInterrupt:
        print("Stopping.")
    finally:
        _shutdown(robot, relay, config)


def _shutdown(robot: LeKiwiClient, relay: Relay, config: TeleopConfig) -> None:
    """Zero the base and hold every arm where it is, then drop the connections."""
    try:
        if robot.is_connected:
            observation = robot.get_observation()
            arm_action = {
                f"{arm.prefix}{name}.pos": float(observation[f"{arm.prefix}{name}.pos"])
                for arm in config.arms
                for name in ARM_MOTORS
            }
            robot.send_action({**arm_action, **ZERO_BASE_ACTION})
    except Exception as exc:  # noqa: BLE001 - shutdown must not raise over a dead link
        logger.warning("Could not send the final stop command: %s", exc)
    relay.stop()
    if robot.is_connected:
        robot.disconnect()


def run_relay_only(config: TeleopConfig) -> None:
    """Serve the VR panel with no robot attached — the safe first bring-up.

    Prints the input rate and round-trip time so the transport can be judged before any
    motor is powered.
    """
    state = XRState()
    relay = Relay(config.relay, state)
    relay.start()
    print(f"VR panel (no robot): {getattr(relay, 'operator_url', relay.url)}")
    print("Open this URL in the Quest browser and press 'Войти в VR'. Ctrl+C to stop.")

    previous_frames = 0
    previous_at = time.monotonic()
    try:
        while True:
            time.sleep(2.0)
            status = state.status()
            now = time.monotonic()
            rate = (status["framesReceived"] - previous_frames) / (now - previous_at)
            previous_frames, previous_at = status["framesReceived"], now
            snapshot = state.snapshot()
            hands = ", ".join(
                f"{hand}[{c.kind}]: squeeze={c.squeeze:.2f} trigger={c.trigger:.2f} "
                f"stick=({c.stick_x:+.2f},{c.stick_y:+.2f}) "
                f"pos=({c.position[0]:+.2f},{c.position[1]:+.2f},{c.position[2]:+.2f})"
                for hand, c in sorted(snapshot.controllers.items())
            )
            rtt = status["rttMs"]
            # flush: this line IS the instrument. Block-buffered into a pipe or a log file
            # it arrives in 8 KB batches, which is useless while watching a live session.
            print(
                f"[{rate:5.1f} Hz] age={status['ageS']} s "
                f"rtt={rtt if rtt is None else round(rtt)} ms "
                f"stop={status['stopped']} {hands or '(no controllers)'}",
                flush=True,
            )
    except KeyboardInterrupt:
        print("Stopping.")
    finally:
        relay.stop()
