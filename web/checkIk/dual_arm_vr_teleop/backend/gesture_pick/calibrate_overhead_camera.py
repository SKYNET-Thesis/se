"""Save measured table corners without opening a camera or commanding a robot.

Run from dual_arm_vr_teleop:
  python -m backend.gesture_pick.calibrate_overhead_camera --help
Corners must be measured with the fixed camera, supplied in matching perimeter
order, with robot_points already expressed in the selected follower base frame.
"""

import argparse
import json

from .calibration import TableCalibration


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--camera-path", required=True, help="Exact camera path used in gesture-pick config")
    parser.add_argument("--image-points", required=True, type=json.loads, help="JSON array of four [x,y] pixel corners")
    parser.add_argument("--robot-points", required=True, type=json.loads, help="JSON array of four [x,y] robot-base metre corners")
    parser.add_argument("--table-z", type=float, default=0.0, help="Table height in robot-base metres")
    parser.add_argument("--output", required=True, help="Local runtime calibration JSON path")
    args = parser.parse_args(argv)
    try:
        calibration = TableCalibration.from_points(args.image_points, args.robot_points,
                                                   camera_path=args.camera_path, table_z=args.table_z)
        calibration.save(args.output)
    except (ValueError, TypeError, OSError) as exc:
        parser.error(str(exc))
    print(f"Saved calibration {calibration.calibration_id} to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
