"""Operator-only tooling; it never starts calibration or opens a serial port."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from .auth import OperatorSessionIssuer


def _secret(path: Path) -> bytes:
    if not path.is_file() or path.stat().st_mode & 0o077:
        raise SystemExit("session secret file must exist and have mode 0600")
    value = path.read_bytes().strip()
    if len(value) < 32: raise SystemExit("session secret must contain at least 32 bytes")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Issue a short-lived local VISTA hardware operator session.")
    parser.add_argument("--secret-file", default=os.environ.get("VISTA_HARDWARE_ADAPTER_SESSION_SECRET_FILE"))
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--device-role", choices=("LEADER", "FOLLOWER"), required=True)
    parser.add_argument("--ttl-seconds", type=int, default=600)
    args = parser.parse_args()
    if not args.secret_file: raise SystemExit("--secret-file or VISTA_HARDWARE_ADAPTER_SESSION_SECRET_FILE is required")
    token = OperatorSessionIssuer(_secret(Path(args.secret_file))).issue(
        robot_id=args.robot_id, device_id=args.device_id, device_role=args.device_role, ttl_seconds=args.ttl_seconds
    )
    # This short-lived credential is intentionally emitted only to the local
    # operator's terminal. It is never written to a file or application log.
    print(token)


if __name__ == "__main__": main()
