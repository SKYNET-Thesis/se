"""The standalone ``vr_lekiwi`` process boundary.

Ticket 02 deliberately stops after fake follower startup and pose seeding.  The HTTPS
relay, readiness handshake, and health endpoint belong to Ticket 03.  Keeping this module
small makes the process configuration independently testable and keeps CHECKIK state out of
the operator process.
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
from dataclasses import dataclass
from pathlib import Path
from types import FrameType
from typing import Callable

from .config import RelayConfig
from .follower_adapter import (
    ArmMode,
    DualSO101FollowerRobot,
    FakeSOFollower,
    FollowerFactory,
)
from .relay import Relay
from .state import XRState

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProcessConfig:
    """All process inputs supplied by the CHECKIK process adapter."""

    mode: ArmMode
    left_port: str | None
    right_port: str | None
    left_device_id: str | None
    right_device_id: str | None
    certificate: Path
    key: Path
    relay_port: int
    relay_host: str = "127.0.0.1"


class FakeVRLeKiwiSession:
    """A connected fake session with the measured startup pose captured."""

    def __init__(self, robot: DualSO101FollowerRobot, seed_observation: dict[str, object]) -> None:
        self.robot = robot
        self.seed_observation = seed_observation

    @property
    def active_arms(self) -> tuple[str, ...]:
        return self.robot.active_arms

    def close(self) -> None:
        if self.robot.is_connected:
            self.robot.disconnect()


@dataclass
class ReadyVRLeKiwiRuntime:
    """A fully initialized offline process runtime and its readiness payload."""

    session: FakeVRLeKiwiSession
    relay: Relay
    config: ProcessConfig

    @property
    def readiness(self) -> dict[str, object]:
        return {
            "mode": self.config.mode,
            "activeArms": list(self.session.active_arms),
            "operatorUrl": self.relay.operator_url,
            "relayPort": self.config.relay_port,
        }

    def close(self) -> None:
        errors: list[Exception] = []
        try:
            self.relay.stop()
        except Exception as exc:
            errors.append(exc)
        try:
            self.session.close()
        except Exception as exc:
            errors.append(exc)
        if errors:
            raise errors[0]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="vr_lekiwi",
        description="Start the VR LeKiwi process against deterministic fake followers.",
    )
    parser.add_argument(
        "--mode",
        choices=("left-only", "right-only", "dual-arm"),
        default="dual-arm",
        help="Follower session scope (default: dual-arm).",
    )
    parser.add_argument("--left-port", help="Explicit left follower port.")
    parser.add_argument("--right-port", help="Explicit right follower port.")
    parser.add_argument("--left-device-id", help="Explicit left follower device ID.")
    parser.add_argument("--right-device-id", help="Explicit right follower device ID.")
    parser.add_argument(
        "--certificate",
        "--cert",
        dest="certificate",
        type=Path,
        help="Certificate path reserved for the Ticket 03 HTTPS relay.",
    )
    parser.add_argument(
        "--key",
        dest="key",
        type=Path,
        help="Private key path reserved for the Ticket 03 HTTPS relay.",
    )
    parser.add_argument(
        "--relay-port",
        type=int,
        required=True,
        help="Explicit relay port reserved for the Ticket 03 HTTPS relay.",
    )
    parser.add_argument(
        "--relay-host",
        default="127.0.0.1",
        help="Bind address for the relay; use 0.0.0.0 for phone access on the LAN.",
    )
    return parser


def _require_selected_follower(parser: argparse.ArgumentParser, args: argparse.Namespace) -> None:
    arms = {
        "left": (args.left_port, args.left_device_id),
        "right": (args.right_port, args.right_device_id),
    }
    selected = ("left", "right") if args.mode == "dual-arm" else (args.mode.removesuffix("-only"),)
    for arm in selected:
        port, device_id = arms[arm]
        if not port or not device_id:
            parser.error(f"{args.mode} requires --{arm}-port and --{arm}-device-id")


def parse_process_args(argv: list[str] | None = None) -> ProcessConfig:
    parser = build_parser()
    args = parser.parse_args(argv)
    if (args.certificate is None) != (args.key is None) or args.certificate is None:
        parser.error("--certificate and --key must be given together")
    _require_selected_follower(parser, args)
    if not 1 <= args.relay_port <= 65535:
        parser.error("relay port must be between 1 and 65535")
    return ProcessConfig(
        mode=args.mode,
        left_port=args.left_port,
        right_port=args.right_port,
        left_device_id=args.left_device_id,
        right_device_id=args.right_device_id,
        certificate=args.certificate,
        key=args.key,
        relay_port=args.relay_port,
        relay_host=args.relay_host,
    )


def start_fake_session(
    config: ProcessConfig,
    follower_factory: FollowerFactory | None = None,
) -> FakeVRLeKiwiSession:
    """Connect selected fake followers and capture each selected measured pose."""
    factory = follower_factory or (lambda spec: FakeSOFollower(spec.port, spec.device_id))
    robot = DualSO101FollowerRobot(
        mode=config.mode,
        left_port=config.left_port,
        right_port=config.right_port,
        left_device_id=config.left_device_id,
        right_device_id=config.right_device_id,
        follower_factory=factory,
    )
    try:
        robot.connect()
        return FakeVRLeKiwiSession(robot, robot.get_observation())
    except Exception:
        try:
            robot.disconnect()
        except Exception:
            pass
        raise


def start_ready_runtime(
    config: ProcessConfig,
    follower_factory: FollowerFactory | None = None,
    relay_factory: Callable[..., Relay] = Relay,
) -> ReadyVRLeKiwiRuntime:
    """Connect, seed, listen and return the runtime only after all are ready."""
    session = start_fake_session(config, follower_factory)
    relay: Relay | None = None
    try:
        state = XRState()
        relay = relay_factory(
            RelayConfig(
                host=config.relay_host,
                port=config.relay_port,
                cert_file=config.certificate,
                key_file=config.key,
            ),
            state,
            status_provider=lambda: {
                "processState": "ready",
                "mode": config.mode,
                "activeArms": list(session.active_arms),
            },
        )
        relay.start()
        relay.health_check()
        return ReadyVRLeKiwiRuntime(session, relay, config)
    except Exception:
        if relay is not None:
            try:
                relay.stop()
            except Exception:
                pass
        session.close()
        raise


def run(config: ProcessConfig) -> None:
    """Keep the fake process alive until shutdown after the readiness handshake."""
    runtime = start_ready_runtime(config)
    print(
        "VR_LEKIWI_READY "
        + json.dumps(runtime.readiness),
        flush=True,
    )
    stopped = False

    def stop(_signum: int, _frame: FrameType | None) -> None:
        nonlocal stopped
        stopped = True

    previous = signal.signal(signal.SIGTERM, stop)
    try:
        signal.signal(signal.SIGINT, stop)
        while not stopped:
            signal.pause()
    finally:
        signal.signal(signal.SIGTERM, previous)
        runtime.close()


def main() -> None:
    config = parse_process_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        run(config)
    except Exception as exc:
        LOGGER.error("vr_lekiwi startup failed: %s", exc)
        raise SystemExit(f"vr_lekiwi: {exc}") from exc


if __name__ == "__main__":
    main()
