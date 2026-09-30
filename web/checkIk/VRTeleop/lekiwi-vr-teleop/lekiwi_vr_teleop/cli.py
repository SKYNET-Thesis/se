"""Command-line entry points.

Two commands, matching the two bring-up stages:

* ``lekiwi-vr-relay`` — serve the VR panel with no robot attached. Nothing can move.
* ``lekiwi-vr-teleop`` — the full loop against the LeKiwi host on the Pi.
"""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

# Where the robot's address comes from when it is not on the command line.
REMOTE_IP_ENV = "LEKIWI_REMOTE_IP"

from .config import ARM_PREFIX, ArmConfig, BaseConfig, RelayConfig, TeleopConfig
from .teleop import run, run_relay_only


def _build_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--host", default="127.0.0.1", help="Bind address (default: loopback, for adb reverse)")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--cert", type=Path, default=None, help="TLS certificate (LAN transport only)")
    parser.add_argument("--key", type=Path, default=None, help="TLS private key (LAN transport only)")
    parser.add_argument(
        "--arms",
        default="right",
        help="Arms to drive, as HAND[:WIRE_PREFIX], comma separated. One controller carries "
        "a whole arm, so a second arm is just a second entry: 'right' for LeKiwi, "
        "'left:left_arm_,right:right_arm_' for a two-armed robot. The prefix must match "
        "what the robot calls that arm's motors; it is not guessed",
    )
    parser.add_argument("--base-hand", default="left", choices=["left", "right"])
    parser.add_argument(
        "--phone-hand",
        default="right",
        choices=["left", "right"],
        help="Follower hand selected by the phone app (default: right)",
    )
    parser.add_argument(
        "--turn-hand",
        default=None,
        choices=["left", "right"],
        help="Stick that turns the base (default: the hand that is not translating)",
    )
    parser.add_argument(
        "--position-scale",
        type=float,
        default=1.0,
        help="Hand-to-arm motion ratio; below 1.0 the arm moves less than your hand",
    )
    parser.add_argument(
        "--base-yaw-offset",
        type=float,
        default=0.0,
        help="Degrees the arm base is turned relative to the operator; try 180 if hand "
        "motion drives the arm the opposite way",
    )
    parser.add_argument(
        "--roll-gain",
        type=float,
        default=1.0,
        help="Jaw degrees per degree of hand roll; negative flips the direction",
    )
    parser.add_argument(
        "--pitch-gain",
        type=float,
        default=1.0,
        help="Jaw degrees per degree of hand pitch; negative flips the direction",
    )
    parser.add_argument(
        "--track-hand-orientation",
        action="store_true",
        help="Let bare-hand palm rotation drive tool pitch/roll. Off by default for stable translation.",
    )
    parser.add_argument(
        "--hand-axis-lock-ratio",
        type=float,
        default=1.25,
        help="XRHand dominant-axis ratio; 0 disables axis locking (default: 1.25)",
    )
    parser.add_argument(
        "--smoothing",
        type=float,
        default=1.0,
        help="Joint target EMA factor in (0, 1]; lower is smoother",
    )
    parser.add_argument(
        "--gripper-open",
        type=float,
        default=100.0,
        help="Jaw opening a fully released finger commands (RANGE_0_100, 100 = wide open). "
        "Lower it so the finger's travel spans the aperture the work needs instead of "
        "mostly empty air",
    )
    parser.add_argument(
        "--gripper-closed",
        type=float,
        default=0.0,
        help="Jaw opening a fully pulled finger commands",
    )
    parser.add_argument(
        "--gripper-squeeze",
        type=float,
        default=18.0,
        help="How far the jaw command may run past the jaw's actual position. Past contact "
        "this is grip force, not travel; lower it to squeeze more gently",
    )
    parser.add_argument(
        "--elbow-down",
        action="store_true",
        help="Fold the elbow the other way. Reachable in about 1%% of the workspace; "
        "offered so the branch is a stated choice rather than a solver's whim",
    )
    parser.add_argument("--log-level", default="info", choices=["debug", "info", "warning", "error"])
    return parser


def _parse_arms(spec: str) -> list[tuple[str, str]]:
    """``"right"`` or ``"left:left_arm_,right:right_arm_"`` -> [(hand, prefix), ...]."""
    parsed: list[tuple[str, str]] = []
    for entry in (part.strip() for part in spec.split(",") if part.strip()):
        hand, _, prefix = entry.partition(":")
        if hand not in ("left", "right"):
            raise SystemExit(f"--arms: '{hand}' is not a hand; use left or right")
        parsed.append((hand, prefix or ARM_PREFIX))
    if not parsed:
        raise SystemExit("--arms needs at least one arm")
    hands = [hand for hand, _ in parsed]
    if len(set(hands)) != len(hands):
        raise SystemExit(f"--arms: one controller cannot drive two arms ({', '.join(hands)})")
    if len(parsed) > 1 and len({prefix for _, prefix in parsed}) != len(parsed):
        raise SystemExit(
            "--arms: each arm needs its own wire prefix, or both arms are commanded onto "
            "the same motors"
        )
    return parsed


def _build_config(args: argparse.Namespace) -> TeleopConfig:
    if (args.cert is None) != (args.key is None):
        raise SystemExit("--cert and --key must be given together")
    arms = _parse_arms(args.arms)
    return TeleopConfig(
        remote_ip=getattr(args, "remote_ip", None),
        robot_id=getattr(args, "robot_id", "lekiwi_01"),
        fps=getattr(args, "fps", 30),
        dry_run=getattr(args, "dry_run", False),
        relay=RelayConfig(
            host=args.host,
            port=args.port,
            cert_file=args.cert,
            key_file=args.key,
            phone_hand=args.phone_hand,
        ),
        arms=tuple(
            ArmConfig(
                hand=hand,
                prefix=prefix,
                position_scale=args.position_scale,
                base_yaw_offset_deg=args.base_yaw_offset,
                roll_gain=args.roll_gain,
                pitch_gain=args.pitch_gain,
                track_hand_orientation=args.track_hand_orientation,
                hand_axis_lock_ratio=args.hand_axis_lock_ratio,
                joint_smoothing_alpha=args.smoothing,
                elbow_up=not args.elbow_down,
                gripper_open=args.gripper_open,
                gripper_closed=args.gripper_closed,
                gripper_squeeze_margin=args.gripper_squeeze,
            )
            for hand, prefix in arms
        ),
        base=BaseConfig(
            hand=args.base_hand,
            turn_hand=args.turn_hand
            or ("right" if args.base_hand == "left" else "left"),
        ),
    )


def relay_main() -> None:
    parser = _build_parser("Serve the LeKiwi VR panel without connecting to the robot.")
    args = parser.parse_args()
    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(message)s")
    run_relay_only(_build_config(args))


def teleop_main() -> None:
    parser = _build_parser("Teleoperate LeKiwi from a Meta Quest headset over WebXR.")
    parser.add_argument(
        "--remote-ip",
        default=os.environ.get(REMOTE_IP_ENV),
        help=f"Address of the Raspberry Pi running the LeKiwi host. Defaults to the "
        f"{REMOTE_IP_ENV} environment variable, so the address of your own robot need not "
        f"be typed every time — nor committed to a repository",
    )
    parser.add_argument("--robot-id", default="lekiwi_01")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the full loop against the robot but never send an action — nothing moves",
    )
    args = parser.parse_args()
    if not args.remote_ip:
        raise SystemExit(
            f"The robot's address is required: pass --remote-ip, or set {REMOTE_IP_ENV} "
            f"(for example: export {REMOTE_IP_ENV}=192.168.1.42)"
        )
    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(message)s")
    run(_build_config(args))


def so101_main() -> None:
    parser = _build_parser("Teleoperate one local SO-101 follower from a Meta Quest headset.")
    # Match the coordinate convention and joint smoothing used by the Oasis Vuer demo.
    # Its raw relative hand delta is retained by disabling the optional dominant-axis lock.
    parser.set_defaults(
        arms="left",
        base_yaw_offset=-90.0,
        hand_axis_lock_ratio=0.0,
        smoothing=0.35,
    )
    parser.add_argument(
        "--robot-id",
        default="my_awesome_bimanual_follower_left",
        help="Calibration identity for the local follower",
    )
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument(
        "--real",
        action="store_true",
        help="Enable physical motion. Without this flag the follower is simulated.",
    )
    parser.add_argument(
        "--robot-port",
        default=None,
        help="Follower serial port, required with --real. It is never auto-detected.",
    )
    args = parser.parse_args()
    if not 0 < args.smoothing <= 1:
        raise SystemExit("--smoothing must be in (0, 1]")
    if args.real and not args.robot_port:
        raise SystemExit("--real requires --robot-port /dev/... for the FOLLOWER arm")
    if len(_parse_arms(args.arms)) != 1:
        raise SystemExit("local SO-101 mode accepts exactly one hand/arm")
    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)s %(message)s", force=True)
    from .local_teleop import run_local_so101

    run_local_so101(_build_config(args), real=args.real, robot_port=args.robot_port)
