#!/usr/bin/env python3
"""Read-only pre/post-flight checks for release scope K-L (authoring capabilities + restricted runtime role); migration M is staged and deferred.

A thin, explicit adapter over verify_production_release_km: the same K/L checks, least-privilege checks and row-digest checks, with `deferred TEMP`
semantics (M must be absent from the ledger; PUBLIC TEMP must equal the pre-release state; the residual risk is reported, never silently passed).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

try:
    from scripts import verify_production_release_km as km
    from scripts import verify_production_release_d_i as base
except ModuleNotFoundError:  # executed as a script from the repository root
    import verify_production_release_km as km  # type: ignore
    import verify_production_release_d_i as base  # type: ignore

SCOPE = "K-L"


def preview(url: str) -> dict:
    return km.preview(url)


def snapshot(url: str) -> dict:
    return km.snapshot(url)


def verify(url: str, pre: dict, root: Path | None = None) -> list[tuple[str, bool, str]]:
    return km.verify(url, pre, root, scope_name=SCOPE)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--preview", action="store_true")
    group.add_argument("--snapshot", type=Path)
    group.add_argument("--verify", type=Path)
    args = parser.parse_args()
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise SystemExit("DATABASE_URL is required")
    base._identity(url, "apply" if args.verify else "read")
    if args.preview:
        print(json.dumps(preview(url), indent=2, sort_keys=True))
        return 0
    if args.snapshot:
        args.snapshot.write_text(json.dumps(snapshot(url), indent=2))
        print("snapshot written")
        return 0
    results = verify(url, json.loads(args.verify.read_text()))
    failed = [r for r in results if not r[1]]
    for name, ok, detail in results:
        print(("PASS  " if ok else "FAIL  ") + name + (f"  [{detail}]" if detail else ""))
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
