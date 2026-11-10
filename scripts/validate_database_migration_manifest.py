#!/usr/bin/env python3
"""Validate immutable SQL migration release inventory and Git provenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

APPLIED_VERSIONS = {
    "20261104_curriculum_foundation",
    "20261105_question_bank_foundation",
    "20261106_question_bank_quiz_attempt",
    "20261106_classroom_enrollment_lifecycle",
    "20261106_iot_lifecycle_foundation",
    "20261106_iot_publish_intent",
    "20261108_iot_lifecycle_access_restrictions",
}
VERSION_RE = re.compile(r"^\d{8}_[a-z0-9]+(?:_[a-z0-9]+)*$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def _git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args], cwd=root, text=True, capture_output=True, check=False
    )


def _tracked(root: Path, path: str) -> bool:
    result = _git(root, "ls-files", "--error-unmatch", "--", path)
    return result.returncode == 0 and bool(result.stdout.strip())


def _git_path_exists(root: Path, commit: str, path: str) -> bool:
    result = _git(root, "cat-file", "-e", f"{commit}:{path}")
    return result.returncode == 0


def _git_bytes(root: Path, commit: str, path: str) -> bytes | None:
    result = subprocess.run(
        ["git", "show", f"{commit}:{path}"], cwd=root,
        capture_output=True, check=False,
    )
    return result.stdout if result.returncode == 0 else None


def validate_manifest(
    repo_root: Path, manifest_path: Path, *, release: bool = False
) -> list[str]:
    """Return all validation errors; empty list means valid inventory."""
    root = repo_root.resolve()
    path = manifest_path if manifest_path.is_absolute() else root / manifest_path
    errors: list[str] = []
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"Cannot read manifest {path}: {exc}"]

    if not isinstance(manifest, dict) or manifest.get("formatVersion") != 1:
        return ["Manifest must be an object with formatVersion: 1"]
    migrations = manifest.get("migrations")
    if not isinstance(migrations, list):
        return ["Manifest migrations must be an array"]
    if release and not migrations:
        errors.append("Release inventory must contain at least one migration")
    baseline_sha = manifest.get("baselineSha256")
    if baseline_sha is not None and (not isinstance(baseline_sha, str) or not SHA256_RE.fullmatch(baseline_sha)):
        errors.append("baselineSha256 must be a lowercase 64-character SHA-256")
    if release and baseline_sha is None:
        errors.append("Production release requires a baselineSha256 fingerprint")

    source_commit = manifest.get("sourceCommit")
    if migrations and (not isinstance(source_commit, str) or not source_commit.strip()):
        errors.append("Non-empty inventory requires sourceCommit")
    elif source_commit:
        check = _git(root, "cat-file", "-e", f"{source_commit}^{{commit}}")
        if check.returncode:
            errors.append(f"sourceCommit is not a Git commit: {source_commit}")
        else:
            ancestor = _git(root, "merge-base", "--is-ancestor", source_commit, "HEAD")
            if ancestor.returncode:
                errors.append(f"sourceCommit is not an ancestor of the current release commit: {source_commit}")

    seen_versions: set[str] = set()
    seen_paths: set[str] = set()
    seen_orders: set[int] = set()
    normalized: list[tuple[int, str]] = []

    for index, entry in enumerate(migrations):
        label = f"migrations[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{label} must be an object")
            continue
        version, relpath, checksum, order = (
            entry.get("version"), entry.get("path"), entry.get("sha256"), entry.get("order")
        )
        if not isinstance(version, str) or not VERSION_RE.fullmatch(version):
            errors.append(f"{label} has invalid migration version: {version!r}")
            continue
        if version in seen_versions:
            errors.append(f"Duplicate version: {version}")
        seen_versions.add(version)
        normalized.append((order if isinstance(order, int) else -1, version))
        if version in APPLIED_VERSIONS:
            errors.append(f"Migration is already applied in Production and cannot be selected: {version}")
        if not isinstance(relpath, str):
            errors.append(f"{label} path must be a string")
            continue
        candidate = PurePosixPath(relpath)
        if candidate.is_absolute() or ".." in candidate.parts or not relpath.startswith("database/migrations/") or candidate.suffix.lower() != ".sql":
            errors.append(f"{label} path must be a relative SQL file under database/migrations/: {relpath}")
            continue
        if relpath in seen_paths:
            errors.append(f"Duplicate migration path: {relpath}")
        seen_paths.add(relpath)
        if candidate.stem != version:
            errors.append(f"{label} filename must exactly match its version: {relpath}")
        file_path = root / relpath
        if not file_path.is_file():
            errors.append(f"Migration source is missing from checkout: {relpath}")
            continue
        if not _tracked(root, relpath):
            errors.append(f"Migration source is not tracked by Git: {relpath}")
        actual = hashlib.sha256(file_path.read_bytes()).hexdigest()
        if not isinstance(checksum, str) or not SHA256_RE.fullmatch(checksum):
            errors.append(f"{label} sha256 must be a lowercase 64-character SHA-256")
        elif actual != checksum:
            errors.append(f"Checksum mismatch for {relpath}: manifest={checksum} checkout={actual}")
        if isinstance(source_commit, str) and source_commit:
            source = _git_bytes(root, source_commit, relpath)
            if source is None:
                errors.append(f"Git source commit does not contain migration source: {relpath}")
            elif hashlib.sha256(source).hexdigest() != checksum:
                errors.append(f"Git source commit bytes/checksum mismatch for {relpath}")
            elif source != file_path.read_bytes():
                errors.append(f"Git source commit bytes differ from checkout for {relpath}")
            release_source = _git_bytes(root, "HEAD", relpath)
            if release_source is None:
                errors.append(f"Current release commit does not contain migration source: {relpath}")
            elif release_source != file_path.read_bytes():
                errors.append(f"Current release commit bytes differ from checkout for {relpath}")
        if not isinstance(order, int) or isinstance(order, bool) or order < 1:
            errors.append(f"{label} order must be a positive integer")
        elif order in seen_orders:
            errors.append(f"Duplicate migration order: {order}")
        else:
            seen_orders.add(order)

    expected_orders = set(range(1, len(migrations) + 1))
    if seen_orders and seen_orders != expected_orders:
        errors.append(f"Migration order must be contiguous from 1 through {len(migrations)}")
    expected_versions = sorted(seen_versions)
    listed_versions = [version for _, version in sorted(normalized)]
    if listed_versions != expected_versions:
        errors.append("Manifest migration order does not match ascending version order")

    migration_dir = root / "database/migrations"
    if migration_dir.exists():
        status = _git(root, "status", "--porcelain", "--untracked-files=all", "--ignored", "--", "database/migrations")
        for line in status.stdout.splitlines():
            code, item = line[:2], line[3:]
            if code == "!!":
                if item.lower().endswith(".sql"):
                    errors.append(f"Ignored SQL file is outside release inventory: {item}")
            elif "?" in code and item.lower().endswith(".sql"):
                errors.append(f"Untracked SQL file is outside release inventory: {item}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--manifest", type=Path, default=Path("database/migrations/manifest.json"))
    parser.add_argument("--release", action="store_true", help="require a non-empty deployable inventory")
    args = parser.parse_args()
    errors = validate_manifest(args.repo_root, args.manifest, release=args.release)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Migration manifest validation passed")
    if args.release:
        print("Release inventory is non-empty and pinned to Git source bytes")
    else:
        print("Inventory mode: empty manifest is allowed; no migration is selected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
