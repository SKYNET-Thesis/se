#!/usr/bin/env python3
"""Apply a STAGED migration (database/staged-migrations/*.sql) to a disposable loopback test database, for CI.

Purpose: the D03 database-backed integration tests exercise the final (Stage 2) schema. Stage 2 is deliberately not in
the release manifest (it is a separate production release), so the CI database, which is bootstrapped from the manifest
and verified at the manifest's schema, receives it here, AFTER verification and only on the throw-away runner database.

Safety: loopback host only, database name must be vista_test_*, the file must live under database/staged-migrations/,
the target must already be at Stage 1 (the SQL itself enforces that), single transaction. It never reads the production
manifest, never writes the migration ledger and is not a release mechanism.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
STAGED = ROOT / "database/staged-migrations"


def apply(database_url: str, sql_file: Path) -> None:
    parsed = urlparse(database_url)
    database = parsed.path.lstrip("/")
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit("Staged test migrations may only be applied to a loopback database")
    if not re.fullmatch(r"vista_test_[a-z0-9_]+", database):
        raise SystemExit("Staged test migrations may only be applied to a vista_test_* database")
    if "supabase" in database_url.lower():
        raise SystemExit("Refusing a Supabase-looking target")
    resolved = sql_file.resolve()
    if resolved.parent != STAGED.resolve() or resolved.suffix != ".sql":
        raise SystemExit("Only SQL files directly under database/staged-migrations/ may be applied")
    env = {**os.environ, "PGPASSWORD": parsed.password or ""}
    done = subprocess.run(
        ["psql", "-h", parsed.hostname, "-p", str(parsed.port or 5432), "-U", parsed.username, "-d", database,
         "-X", "-q", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", str(resolved)],
        capture_output=True, text=True, env=env,
    )
    if done.returncode != 0:
        raise SystemExit("staged migration failed:\n" + done.stderr.strip())
    print(f"applied {resolved.name} to disposable database {database}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    parser.add_argument("sql_file", type=Path)
    args = parser.parse_args()
    apply(args.database_url, args.sql_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
