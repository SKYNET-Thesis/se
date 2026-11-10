# VISTA Production migration ownership policy

**Status:** Migration Recovery is DONE within the verified scope. The
2026-11-09 baseline passed integrity checks, restored successfully in isolated
PostgreSQL 17.11, and its public catalog comparison completed with 12 matches,
3 documented environment differences, 0 schema drift, and 0 unverified
fields. The first live Production release using the SQL runner remains
unvalidated and requires its own approval.

## Owners and records

- The versioned SQL release process is the sole owner of Supabase Production
  schema changes.
- New immutable SQL sources and their release manifest belong under
  `database/migrations/`. `public.vista_schema_migrations` is the authoritative
  applied-version ledger for this stream.
- `public._prisma_migrations` is preserved as legacy audit history. Do not
  insert, update, delete, truncate, resolve, or otherwise reconcile its rows.
- Prisma Client generation and runtime use continue. Prisma Migrate commands
  (`migrate deploy`, `dev`, `resolve`, `reset`) and `prisma db push` are
  prohibited against Production. The application deployment workflow must not
  execute SQL migrations.
- The seven November 2026 SQL migrations already recorded in the SQL ledger
  remain historical. They must not be selected or replayed by a new release.
- The current SQL release manifest is intentionally empty; there are no new
  SQL migrations pending release. The Production parity report and Supabase
  environment inventory are retained outside the repository with restricted
  permissions. Their classifications and evidence are summarized in the
  [2026-11-09 verification record](production-schema-baseline-20261109-verification.md).

## New migration authoring

1. Capture and approve the current Production schema baseline using
   [`supabase-production-schema-baseline.md`](supabase-production-schema-baseline.md).
   No migration release may proceed while that baseline is pending or stale.
2. Create one new, uniquely versioned SQL file under `database/migrations/`.
   Do not change a file after it has been released. Use a forward fix for
   corrections; any down script is a reviewed recovery aid and is never run
   automatically.
3. Review SQL for transaction safety, locks, table rewrites, data impact,
   grants, RLS, functions, triggers, and compatibility with the currently
   deployed application. Preserve unsupported PostgreSQL/Supabase objects
   explicitly in SQL.
4. Commit migration source bytes first. Then create/update the release manifest
   with the source commit containing those bytes, SHA-256, unique version,
   exact path, and contiguous order. The validator checks the checkout, Git
   source commit, and manifest independently.
5. Require a second database reviewer, successful isolated restore/apply and
   post-catalog verification, passing CI safety checks, and a release record
   that identifies the application compatibility window and recovery plan.

## Release and approval

- API build/deploy and database schema release are separate operations. API
  deployment alone never applies SQL.
- CI validates the release manifest and rejects Prisma Migrate, `db push`, or
  SQL runner execution commands inside GitHub Actions workflows. The API and
  web Production deploy jobs require the `database-safety` job to succeed
  first; this gate validates inventory but never applies migrations.
- CI does not deploy a database migration. A future production release job may
  only be introduced after a separately approved design adds a protected
  GitHub environment with required reviewers, least-privilege credentials,
  immutable artifact selection, preflight/lock/ledger checks, and a documented
  operator approval. Until then, no automatic Production migration path exists.
- Run `python scripts/sql_migration_runner.py` without a mode for local
  manifest validation. `--dry-run --expected-project-ref <ref>` performs only
  read-only identity and ledger checks. `--apply` requires an operator ID and
  approval reference; Production additionally requires
  `--approve-production` and baseline evidence marked verified after isolated
  restore and catalog comparison. No GitHub Actions workflow may invoke
  `--apply`.
- Before a human-approved release, verify the target project reference, fresh
  baseline fingerprint, previous ledger checksum, backup/PITR readiness,
  migration source commit and checksum, and expected post-catalog changes.
- The SQL runner must acquire a transaction-scoped advisory lock where
  supported, reject version/checksum conflicts, apply in a transaction where
  PostgreSQL permits, and write the `vista_schema_migrations` row atomically
  with the DDL. Non-transactional statements require explicit release handling
  and recovery instructions.
- The runner accepts transaction-safe SQL only and owns transaction
  boundaries. Migration files must not contain psql meta-commands, explicit
  transaction control, concurrent index operations, `VACUUM`, database or
  tablespace commands, or `ALTER SYSTEM`. A failed statement aborts the release
  transaction; PostgreSQL does not roll back external side effects or sequence
  values already advanced by a migration.
- Runner preflight verifies URL/project binding, PostgreSQL major version,
  ledger definition and primary key, existing version/checksum rows, and stream
  order. Postflight verifies the expected ledger rows. Each release still
  needs migration-specific object assertions and catalog review.
- Record runner version, source/release commit, checksum, target project,
  operator/approval identity, execution result, and post-check evidence.
- A failed or partially applied release stops the deployment. Never edit a
  ledger row to force success. Diagnose from logs and isolated recovery; use a
  new forward migration or an approved restore plan.

## Prisma schema and non-modeled objects

Prisma schema is the application data model used to generate Prisma Client; it
is not the Production DDL deployment source. Keep it aligned with application
query needs where practical, while managing PostgreSQL-specific objects in the
SQL stream and baseline inventory. This includes RLS policies, grants, triggers,
functions, extensions, partial/expression indexes, and constraints that Prisma
cannot represent. Never generate a production baseline solely from
`schema.prisma` or `prisma db pull`.
