# Production SQL migration stream

This directory is the source inventory for SQL releases owned by the SQL
release runner. The active manifest selects migrations D, E, and F against the
verified 2026-11-09 Production baseline. Migrations A–C are excluded because
their schema is already represented in that baseline and their historical
Production versions must not be replayed.

Each future immutable release manifest entry must contain:

- `version`: unique `YYYYMMDD_lower_snake_case` identifier;
- `path`: exact SQL source path in this directory;
- `sha256`: lowercase SHA-256 of the exact SQL bytes;
- `order`: contiguous integer starting at 1.

The top-level `baselineSha256` pins the reviewed Production schema baseline.
The current fingerprint records the 2026-11-09 capture. Static integrity,
isolated PostgreSQL 17 restore, and read-only Production catalog comparison are
verified. The comparison recorded 12 matching fields and three documented
environment differences, with no observed public schema drift.

The top-level `sourceCommit` must identify a committed Git tree that contains
the exact bytes of every listed SQL file. The validator compares that commit,
the checked-out file, and the manifest checksum. A release must contain at
least one migration and is rejected if it includes any of the seven November
2026 versions already applied in Production. Untracked and ignored SQL files
are rejected so release inventory cannot silently omit local migration code.

The active inventory is a release candidate; it does not mean these migrations
have been applied to Production or approved for release. Do not place the lost
legacy Prisma SQL here. Do not edit historical migration files. Do not execute
SQL from this directory against Production without a separately approved
release gate and the production baseline prerequisites in
[`../../docs/operations/supabase-production-schema-baseline.md`](../../docs/operations/supabase-production-schema-baseline.md).

See [`../../docs/operations/production-migration-ownership.md`](../../docs/operations/production-migration-ownership.md)
for migration ownership and release approval policy.

Catalog verification does not validate a first live runner execution or
authorize a Production release. Any future application requires separate
review, explicit approval, and the controls in the ownership policy.
