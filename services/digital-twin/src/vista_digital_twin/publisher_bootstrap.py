"""Operator-only local publisher scope bootstrap.

This module never starts a service or prints a credential.  It writes a
short-lived scope into an owner-only local file for the existing LeLab worker.
"""

import argparse
import os
import stat
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Sequence, TextIO

from .authorization import TwinAuthorizer


DEFAULT_TTL_SECONDS = 10 * 60
MAX_TTL_SECONDS = 15 * 60


def _required(value: str | None, label: str) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise ValueError(f"{label} is required")
    return value


def _validate_output_parent(output: Path) -> None:
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    parent_mode = stat.S_IMODE(output.parent.stat().st_mode)
    if parent_mode & 0o077:
        raise ValueError("output directory must not grant group or other access")


def issue_publisher_scope_file(
    *,
    secret: str | None,
    owner_id: str,
    organization_id: str,
    robot_id: str,
    ttl_seconds: int,
    output: Path,
    now: datetime | None = None,
) -> datetime:
    """Issue the existing publisher scope format and atomically write mode 0600."""
    signing_secret = _required(secret, "signing secret")
    owner = _required(owner_id, "owner id")
    organization = _required(organization_id, "organization id")
    robot = _required(robot_id, "robot id")
    if not isinstance(ttl_seconds, int) or isinstance(ttl_seconds, bool) or not 1 <= ttl_seconds <= MAX_TTL_SECONDS:
        raise ValueError(f"TTL must be between 1 and {MAX_TTL_SECONDS} seconds")
    if not isinstance(output, Path) or not output.name:
        raise ValueError("output path is required")

    _validate_output_parent(output)
    issued_at = now or datetime.now(timezone.utc)
    if issued_at.tzinfo is None or issued_at.utcoffset() is None:
        raise ValueError("clock must provide a timezone-aware timestamp")
    expires_at = issued_at + timedelta(seconds=ttl_seconds)
    token = TwinAuthorizer(signing_secret, clock=lambda: issued_at).issue_publisher(
        owner_id=owner, organization_id=organization, robot_id=robot, expires_at=expires_at
    )
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{output.name}.", dir=output.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(token)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output)
        output.chmod(0o600)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return expires_at


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Issue a local, short-lived VISTA Digital Twin publisher scope.")
    parser.add_argument("--owner-id", required=True)
    parser.add_argument("--organization-id", required=True)
    parser.add_argument("--robot-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--ttl-seconds", type=int, default=DEFAULT_TTL_SECONDS)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None, *, stdout: TextIO | None = None, stderr: TextIO | None = None) -> int:
    output, errors = stdout or sys.stdout, stderr or sys.stderr
    args = parse_args(argv)
    try:
        expires_at = issue_publisher_scope_file(
            secret=os.getenv("VISTA_TWIN_AUTH_SECRET"), owner_id=args.owner_id,
            organization_id=args.organization_id, robot_id=args.robot_id,
            ttl_seconds=args.ttl_seconds, output=args.output,
        )
    except (OSError, ValueError) as error:
        print(f"Publisher scope was not issued: {error}", file=errors)
        return 2
    print(f"Publisher scope written to {args.output} (expires {expires_at.isoformat()}).", file=output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
