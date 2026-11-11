# VISTA Database

How to build a local development PostgreSQL database, and what each file in this directory is for.

## Layout — historical baseline vs. release migrations

| Path | Role | May be edited? |
| --- | --- | --- |
| `baselines/production-public-schema-20261109T172950Z.sql` | **Historical baseline.** Schema-only `pg_dump` of the verified 2026-11-09 Production `public` schema (88 tables, SHA-256 `5b140ce7…`). It already contains migrations A/B/C and every earlier change. | No. Its SHA-256 is pinned by `migrations/manifest.json` and `baselines/production-baseline-evidence.json`. |
| `baselines/production-baseline-evidence.json` | Verification record for that baseline (integrity, isolated restore, catalog parity). | Only to record new verification. |
| `migrations/*.sql`, `migrations/manifest.json` | **Release migrations** applied by `scripts/sql_migration_runner.py` after the baseline. The manifest currently selects D (`activity_content`), E (`learning_media`), F (`global_question_scope`), G (`activity_progress_scope_guard`). A/B/C are kept as source history only; never replay them. | No applied migration may change; checksums are enforced. |
| `vista_database_schema.sql` | **Legacy Review 2 script.** Not a backend baseline (no `learning_activity_progress`, no enrollment lifecycle constraints). Do not use it to build a development database. | No. |

Development bootstrap = **historical baseline → release migrations → verification**, performed by
`scripts/bootstrap_dev_database.py`. Nothing is added by hand.

## Create a development database (new team member)

Requirements: Docker, a recent `psql` client on your PATH (the dump header uses `\restrict`; `psql` 18.x was
used for verification), Python 3.12, Node.js 22 with npm. Everything runs against a throw-away PostgreSQL 17
container bound to `127.0.0.1`. The bootstrap script refuses any host that is not loopback, any database not
named `vista_test_*`, and any database whose `public` schema is not empty.

```bash
# 1. Start an empty PostgreSQL 17 (loopback only; choose your own password).
docker run -d --name vista-dev-pg \
  -e POSTGRES_USER=vista_test -e POSTGRES_PASSWORD=change-me-local \
  -e POSTGRES_DB=vista_test_course_builder \
  -p 127.0.0.1:55432:5432 postgres:17

# 2. Point the tools at it (local label only; never a Supabase reference).
export VISTA_DEV_DATABASE_URL='postgresql://vista_test:change-me-local@127.0.0.1:55432/vista_test_course_builder'
export VISTA_DATABASE_PROJECT_REF=vista-course-builder-test
unset SUPABASE_URL

# 3. Bootstrap: restore baseline, apply D/E/F/G through the ledger, verify, re-run to prove idempotence.
python3 scripts/bootstrap_dev_database.py --confirm-local-bootstrap

# 4. Re-verify at any time (read-only).
python3 scripts/bootstrap_dev_database.py --verify-only
```

Port `55432`, database `vista_test_course_builder`, user `vista_test` and project label
`vista-course-builder-test` are what the PostgreSQL integration tests expect; keep them unchanged.

What the script does, in order:

1. Verifies the baseline file against the pinned SHA-256/size and that the manifest pins the same hash.
2. Checks the target is loopback, named `vista_test_*`, PostgreSQL 17, and empty.
3. Creates the `NOLOGIN` roles that the baseline grants reference (`anon`, `authenticated`, `service_role`, `postgres`, `supabase_admin`) if missing.
4. Restores the baseline in one transaction and compares catalog object counts with the dump.
5. Applies the manifest migrations through `scripts/sql_migration_runner.py` (advisory lock, one transaction, ledger rows with checksums).
6. Verifies the ledger equals the manifest, that the required objects exist (`learning_activity_progress`, the classroom-member, lesson-progress and enrollment unique constraints, the enrollment `revoked` status, migration D/E/F/G objects), that the schema fingerprint equals the pinned `baselines/dev-schema-expectation.json`, and that a second run has nothing pending.
7. Prints the schema fingerprint. Any database bootstrapped from the same commit prints the same fingerprint, and verification fails with "schema drift" if it differs from the pinned value (the fingerprint assumes a database owned by `vista_test`, as in the commands above).

Expected result: 89 tables, 787 columns, 485 constraints, 239 indexes, 20 triggers, 13 functions; ledger rows
`20261110_d_activity_content`, `20261110_e_learning_media`, `20261111_f_global_question_scope`,
`20261111_g_activity_progress_scope_guard`.

## Run the backend against it

```bash
cd services/education-api
export DATABASE_URL='postgresql://vista_test:change-me-local@127.0.0.1:55432/vista_test_course_builder?schema=public'
export DIRECT_URL="$DATABASE_URL"        # required by prisma/schema.prisma
npm ci
npx prisma validate && npx prisma generate     # client generation only
npm run build
npm run start:dev
```

PostgreSQL integration tests (real database, no mocks):

```bash
export VISTA_DATABASE_PROJECT_REF=vista-course-builder-test RUN_POSTGRES_INTEGRATION=1
npx jest --runInBand --testPathPatterns 'db\.spec'    # 66 tests
npx jest --runInBand                                  # full suite
```

`iot-feedback.repository.int.spec.ts` needs its own `vista_iot_integration` database on port 54322 and
`learning-media.storage.s3.int.spec.ts` needs S3 settings; both skip when their targets are not configured.

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

## Reset

The bootstrap never reuses a populated database. To start over, remove the container and repeat the steps:

```bash
docker rm -f vista-dev-pg
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Target public schema is not empty; bootstrap refused` | The database was already bootstrapped or partly restored. `docker rm -f vista-dev-pg` and start a new container. Do not delete objects by hand. |
| `PostgreSQL database preflight failed (psql exit 2)` | Server not reachable, wrong password, or TLS mismatch. Check `docker ps`, the URL, and the `127.0.0.1:55432` port mapping. |
| `... must be named vista_test_...` / `loopback` | The guard is working. Use a local `vista_test_*` database; never point this at Supabase. |
| `VISTA_DATABASE_PROJECT_REF must be a local label` | Export `VISTA_DATABASE_PROJECT_REF=vista-course-builder-test`. |
| `Manifest validation failed` | `database/migrations` has uncommitted or untracked `.sql` files, or a checksum changed. Release inventory is validated against Git; restore the file instead of editing it. |
| Prisma: `Environment variable not found: DIRECT_URL` | Export `DIRECT_URL` (same value as `DATABASE_URL`). |
| Integration tests: `require the dedicated vista_test_course_builder target` | Use exactly port `55432`, database `vista_test_course_builder`, user `vista_test`, `VISTA_DATABASE_PROJECT_REF=vista-course-builder-test`; unset `SUPABASE_URL`. |
| `psql` rejects `\restrict` | Your `psql` client is too old for the dump header. Upgrade the client. |

## Safety rules

- This procedure is for disposable local databases only. Production DDL is owned by the SQL release runner under the approval policy in `docs/operations/production-migration-ownership.md`.
- Never use Prisma `db push` or Prisma Migrate, edit applied migrations or the baseline, or insert ledger rows by hand.
- A bootstrapped database is not evidence that a Production release is approved or validated.

## Legacy Review 2 script

`vista_database_schema.sql` (77 tables, PostgreSQL 15+/Supabase) is the schema submitted for the Review 2 evaluation. It predates the Course Builder and classroom enrollment lifecycle schema; a fresh load succeeds, but the current migration stream does not apply to it. It is retained as a historical artifact only.
