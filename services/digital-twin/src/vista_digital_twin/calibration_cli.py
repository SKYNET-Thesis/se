"""Local operator-only authoring for VISTA visual calibration profiles."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from .calibration import CalibrationProfile, CalibrationStatus, VisualCalibrationStore
from .contracts import SO101_JOINTS


def _draft(args: argparse.Namespace) -> CalibrationProfile:
    limits = {"shoulder_pan": (-1.91986, 1.91986), "shoulder_lift": (-1.74533, 1.74533), "elbow_flex": (-1.74533, 1.5708), "wrist_flex": (-1.65806, 1.65806), "wrist_roll": (-2.79253, 2.79253), "gripper": (-0.174533, 1.74533)}
    return CalibrationProfile.model_validate({"profile_version": args.version, "robot_id": args.robot_id, "follower_id": args.follower_id, "status": "DRAFT", "lelab_calibration_reference": args.lelab_reference, "joints": [
        {"name": name, "source_unit": "percent" if name == "gripper" else "deg", "sign": 1, "zero_offset": 0, "source_min": 0 if name == "gripper" else -180, "source_max": 100 if name == "gripper" else 180, "target_min": limits[name][0], "target_max": limits[name][1], "conversion": "linear" if name == "gripper" else "angular"} for name in SO101_JOINTS]})


def main() -> None:
    parser = argparse.ArgumentParser(description="Local, read-only-to-hardware VISTA visual calibration CLI")
    parser.add_argument("--directory", type=Path, default=None)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-draft"); create.add_argument("--robot-id", required=True); create.add_argument("--follower-id", required=True); create.add_argument("--version", required=True); create.add_argument("--lelab-reference")
    inspect = sub.add_parser("inspect"); inspect.add_argument("--robot-id", required=True); inspect.add_argument("--version", required=True)
    evidence = sub.add_parser("record-evidence"); evidence.add_argument("--robot-id", required=True); evidence.add_argument("--version", required=True); evidence.add_argument("--reference", required=True); evidence.add_argument("--kind", choices=("calibration_record", "validation_capture", "operator_attestation"), default="validation_capture")
    verify = sub.add_parser("verify"); verify.add_argument("--robot-id", required=True); verify.add_argument("--version", required=True); verify.add_argument("--confirm", action="store_true")
    activate = sub.add_parser("activate"); activate.add_argument("--robot-id", required=True); activate.add_argument("--follower-id", required=True); activate.add_argument("--version", required=True)
    args = parser.parse_args(); store = VisualCalibrationStore(args.directory)
    if args.command == "create-draft": store.save(_draft(args))
    elif args.command == "inspect": print(store.load(robot_id=args.robot_id, profile_version=args.version).model_dump_json(indent=2))
    elif args.command == "record-evidence":
        profile = store.load(robot_id=args.robot_id, profile_version=args.version); profile.evidence.append({"kind": args.kind, "reference": args.reference, "recorded_at": datetime.now(timezone.utc).isoformat()}); store.save(profile)
    elif args.command == "verify":
        if not args.confirm: raise SystemExit("--confirm is required; valid JSON is not physical verification")
        profile = store.load(robot_id=args.robot_id, profile_version=args.version)
        if not profile.evidence: raise SystemExit("evidence is required before verification")
        profile.status = CalibrationStatus.VERIFIED; profile.operator_confirmed_at = datetime.now(timezone.utc).isoformat(); store.save(profile)
    else: store.activate(robot_id=args.robot_id, follower_id=args.follower_id, profile_version=args.version)


if __name__ == "__main__":
    main()
