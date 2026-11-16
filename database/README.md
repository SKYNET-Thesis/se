# VISTA Database

How to build a local development PostgreSQL database, and what each file in this directory is for.

## Layout — historical baseline vs. release migrations

| Path | Role | May be edited? |
| --- | --- | --- |
| `baselines/production-public-schema-20261109T172950Z.sql` | **Historical baseline.** Schema-only `pg_dump` of the verified 2026-11-09 Production `public` schema (88 tables, SHA-256 `5b140ce7…`). It already contains migrations A/B/C and every earlier change. | No. Its SHA-256 is pinned by `migrations/manifest.json` and `baselines/production-baseline-evidence.json`. |
| `baselines/production-baseline-evidence.json` | Verification record for that baseline (integrity, isolated restore, catalog parity). | Only to record new verification. |
| `migrations/*.sql`, `migrations/manifest.json` | **Release migrations** applied by `scripts/sql_migration_runner.py` after the baseline. The current manifest selects D–M in order; A/B/C are already represented by the historical baseline and are never replayed. | No applied migration may change; checksums are enforced. |
| `vista_database_schema.sql` | **Legacy Review 2 script.** Not a backend baseline (no `learning_activity_progress`, no enrollment lifecycle constraints). Do not use it to build a development database. | No. |

Development bootstrap = **historical baseline → release migrations → verification**, performed by
`scripts/bootstrap_dev_database.py`. Nothing is added by hand.

## Create a development database (new team member)

Requirements: Docker Compose, `psql` 18 or newer (the schema baseline uses `\restrict`), Python 3, Node.js 22 with npm. The Education
local Compose file runs a throw-away PostgreSQL 17 container bound to `127.0.0.1` with tmpfs storage and no
persistent volume. Choose an available port and unique `vista_test_*` database name. The bootstrap script
refuses non-loopback hosts, other database names, Supabase URLs, and non-empty public schemas.

```bash
# 1. Generate unique local values and choose an unused loopback port.
export VISTA_LOCAL_SUFFIX="$(date -u +%Y%m%d%H%M%S)"
export VISTA_LOCAL_DB_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
export VISTA_LOCAL_DB_NAME="vista_test_local_${VISTA_LOCAL_SUFFIX}"
export VISTA_LOCAL_DB_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
export VISTA_LOCAL_RUNTIME_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
export VISTA_DATABASE_PROJECT_REF="local-${VISTA_LOCAL_SUFFIX}"
export VISTA_LOCAL_COMPOSE_PROJECT="vista-education-${VISTA_LOCAL_SUFFIX}"
docker compose -p "$VISTA_LOCAL_COMPOSE_PROJECT" -f docker-compose.education-local.yml up -d --wait

# 2. Point the tools at it (local label only; never a Supabase reference).
export VISTA_DEV_DATABASE_URL="postgresql://vista_test:${VISTA_LOCAL_DB_PASSWORD}@127.0.0.1:${VISTA_LOCAL_DB_PORT}/${VISTA_LOCAL_DB_NAME}?sslmode=disable"
unset SUPABASE_URL

# 3. Bootstrap: restore the baseline, apply the complete D–M manifest, and verify it.
python3 scripts/bootstrap_dev_database.py --confirm-local-bootstrap

# 4. Re-verify at any time (read-only).
python3 scripts/bootstrap_dev_database.py --verify-only
```

The Education PostgreSQL integration suites accept the selected port/name when `VISTA_TEST_DATABASE_PORT`,
`VISTA_TEST_DATABASE_NAME`, and `VISTA_DATABASE_PROJECT_REF` match the same disposable target. See
[`course-builder-database-testing.md`](../docs/operations/course-builder-database-testing.md) for fixture
requirements. Do not reuse legacy fixed ports when they are occupied.

What the script does, in order:

1. Verifies the baseline file against the pinned SHA-256/size and that the manifest pins the same hash.
2. Checks the target is loopback, named `vista_test_*`, PostgreSQL 17, and empty.
3. Creates the `NOLOGIN` roles that the baseline grants reference (`anon`, `authenticated`, `service_role`, `postgres`, `supabase_admin`) if missing.
4. Restores the baseline in one transaction and compares catalog object counts with the dump.
5. Applies the manifest migrations through `scripts/sql_migration_runner.py` (advisory lock, one transaction, ledger rows with checksums).
6. Verifies the ledger equals the manifest, required objects and constraints, the K–M authorization/runtime-role/TEMP contracts, and the pinned `baselines/dev-schema-expectation.json`; a second run has nothing pending.
7. Prints the schema fingerprint. Any database bootstrapped from the same commit prints the same fingerprint, and verification fails with "schema drift" if it differs from the pinned value (the fingerprint assumes a database owned by `vista_test`, as in the commands above).

Expected PostgreSQL 17 result: 91 tables, 814 columns, 502 constraints, 246 indexes, 48 RLS policies,
22 triggers, 15 functions, and the ten D–M ledger rows. The expected fingerprint is pinned in
`baselines/dev-schema-expectation.json` and assumes the database owner is `vista_test`.

## Run the backend against it

Use the restricted `vista_app_runtime` role for API `DATABASE_URL`; set its password only in the disposable
local database after bootstrap. Use the `vista_test` writer URL for `DIRECT_URL`, Prisma generation, and
local seed scripts. Full commands are in [`local-education-development.md`](../docs/setup/local-education-development.md).

PostgreSQL integration tests (real database, no mocks):

```bash
cd services/education-api
export VISTA_DATABASE_PROJECT_REF=vista-course-builder-test
export VISTA_TEST_DATABASE_NAME="$VISTA_LOCAL_DB_NAME"
export VISTA_TEST_DATABASE_PORT="$VISTA_LOCAL_DB_PORT"
export VISTA_INTEGRATION_DATABASE_URL="$VISTA_DEV_DATABASE_URL"
export RUN_POSTGRES_INTEGRATION=1
npx jest --runInBand --testPathPatterns 'db\.spec'
npx jest --runInBand
```

Optional IoT feedback integration additionally requires `RUN_IOT_FEEDBACK_INTEGRATION=1` and its dedicated
local fixture configuration. Learning Media S3 integration needs a local S3-compatible endpoint and explicit
test settings. Neither requires Production services.

## Continuous integration

`.github/workflows/database-bootstrap.yml` repeats this procedure on every relevant push/PR in a disposable
PostgreSQL 17 service container (no secrets, loopback only): manifest validation, two fresh bootstraps with a
fingerprint comparison, `--verify-only`, all database safety tests (none may be skipped), Prisma validate/generate,
backend build, the PostgreSQL integration suites (none may be skipped) and the full backend suite. It never
touches Supabase or Production and is not a release gate. To reproduce its result locally, follow the steps above.

## Maintainers: registering a new release migration

1. Add the SQL file under `migrations/` (never edit released files) and commit it.
2. Add the manifest entry (`version`, `path`, `sha256`, `order`) with `sourceCommit` = the commit from step 1, and
   add a `REQUIRED_OBJECTS` entry for it in `scripts/bootstrap_dev_database.py`.
3. Bootstrap a fresh database, then run `python3 scripts/bootstrap_dev_database.py --verify-only --write-expectation`
   to re-pin `baselines/dev-schema-expectation.json`, review the diff, and commit it with the manifest.

## Stop and discard the disposable database

The bootstrap never reuses a populated database. To discard this ephemeral database, stop only the Compose
project created for it:

```bash
docker compose -p "$VISTA_LOCAL_COMPOSE_PROJECT" -f docker-compose.education-local.yml down
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Target public schema is not empty; bootstrap refused` | The database was already bootstrapped or partly restored. `docker rm -f vista-dev-pg` and start a new container. Do not delete objects by hand. |
| `PostgreSQL database preflight failed (psql exit 2)` | Server not reachable, wrong password, or TLS mismatch. Check the selected Compose project, URL, and loopback port. |
| `... must be named vista_test_...` / `loopback` | The guard is working. Use a local `vista_test_*` database; never point this at Supabase. |
| `VISTA_DATABASE_PROJECT_REF must be a local label` | Export a unique local label such as `local-<timestamp>`; never use the Production project ref. |
| `Manifest validation failed` | `database/migrations` has uncommitted or untracked `.sql` files, or a checksum changed. Release inventory is validated against Git; restore the file instead of editing it. |
| Prisma: `Environment variable not found: DIRECT_URL` | Export `DIRECT_URL` (same value as `DATABASE_URL`). |
| Integration tests: `require the exact disposable target` | Set the target URL, `VISTA_TEST_DATABASE_PORT`, `VISTA_TEST_DATABASE_NAME`, and a non-Production `VISTA_DATABASE_PROJECT_REF` consistently; unset `SUPABASE_URL`. |
| `psql` rejects `\restrict` | Your `psql` client is too old for the dump header. Upgrade the client. |

## Safety rules

- This procedure is for disposable local databases only. Production DDL is owned by the SQL release runner under the approval policy in `docs/operations/production-migration-ownership.md`.
- Never use Prisma `db push` or Prisma Migrate, edit applied migrations or the baseline, or insert ledger rows by hand.
- A bootstrapped database is not evidence that a Production release is approved or validated.

## Legacy Review 2 script

`vista_database_schema.sql` (77 tables, PostgreSQL 15+/Supabase) is the schema submitted for the Review 2 evaluation. It predates the Course Builder and classroom enrollment lifecycle schema; a fresh load succeeds, but the current migration stream does not apply to it. It is retained as a historical artifact only.
