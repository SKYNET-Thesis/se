# Course Builder isolated PostgreSQL testing

## Ownership and migration contract

Production schema DDL is owned only by the repository SQL migration runner.
Prisma schema is the application model and Client generator; Prisma Migrate and
`prisma db push` are not Production deployment paths. Migration source inventory,
ordering, historical baseline limits, and manifest lifecycle are documented in
[`database/migrations/README.md`](../../database/migrations/README.md) and
[`production-migration-ownership.md`](production-migration-ownership.md).

The immutable source commit contains five historical SQL files. The active
baseline-specific manifest selects only D and E: the 2026-11-09 verified
baseline already contains the schema from A–C, applied historically as
`20261104_curriculum_foundation`, `20261105_question_bank_foundation`, and
`20261106_question_bank_quiz_attempt`. Those sources remain available for
audit and are not replayed under new version names.

Active local SQL dependency order:

1. `20261110_d_activity_content.sql` — the baseline's existing Activities table; adds
   authored JSONB content.
2. `20261110_e_learning_media.sql` — existing courses/users; adds media metadata.

The checked-in 2026-11-07 baseline has 77 public tables and predates A–C; its
SHA-256 is `8504fe7dc5a3bb112c2b5dfa62803d6fe1f3e2ec56c444eaff12ba7e277655a0`.
The separately verified 2026-11-09 baseline has 88 tables and includes the
historical A–C objects, but lacks authored activity content and media metadata.
The latter matched the recorded Production catalog at capture time. Neither
snapshot proves an unobserved later Production state. No Production connection
is needed for local test preparation.

## Isolated environment

`docker-compose.education-test.yml` defines a separate PostgreSQL 17 service,
database/user, loopback-only port `55432`, and a tmpfs data directory. It has no
named or bind-mounted database volume. The approved run started the dedicated
service and confirmed PostgreSQL 17.11, loopback binding, and tmpfs storage.
Copy `.env.test.example` to `.env.test` only when ready to run locally; keep
that file out of source control. These credentials are test-only and must not
be reused for Supabase or any shared database.

Before any DB-writing test, positively verify all of these conditions:

- The URL host is loopback and port is `55432`.
- The database name is exactly `vista_test_course_builder`.
- The connection user is `vista_test` and the label is
  `VISTA_DATABASE_PROJECT_REF=vista-course-builder-test`.
- No `SUPABASE_URL`, Supabase host, Production URL, or credentials from `.env`
  are loaded in the test process.
- The PostgreSQL server reports major version 17 and the expected database
  identity. Do not rely on the database name alone.

The SQL release runner accepts a loopback test URL only when the DB name starts
with `vista_test_`, the expected project label matches, and no Supabase URL is
paired with it. Its `--dry-run` mode is read-only. Do not use `--apply` or run
test suites until the container identity and isolated target have been verified
and the user explicitly authorizes those DB writes.

## Existing database-backed tests

The repository currently has Jest suites at:

- `src/modules/learning/curriculum-reorder.db.spec.ts`
- `src/modules/learning/enrollment-lifecycle.db.spec.ts`
- `src/modules/learning/iot-feedback.repository.int.spec.ts`
- `src/modules/learning/course-builder-persistence.db.spec.ts`

The first two suites are gated by `RUN_POSTGRES_INTEGRATION=1` and write fixture
rows; they currently use the default Prisma datasource. The IoT suite accepts
`VISTA_INTEGRATION_DATABASE_URL`, creates fixtures, and writes IoT rows. Do not
enable them until the environment identity is verified. The Course Builder
suite has six database-backed tests for Scenarios A–F. It uses PostgreSQL for
all persistence assertions; Learning Media S3 upload/head operations use an
in-memory storage double and do not verify real S3.

## Prerequisite schema bootstrap

The five SQL migration sources require the existing production public schema. The
approved 2026-11-09 schema-only baseline is documented in
[`production-schema-baseline-20261109-verification.md`](production-schema-baseline-20261109-verification.md)
and remains outside the repository. Its verified file is
`/home/quangduc/vista-production-baseline/production-public-schema-20261109T172950Z.sql`
(SHA-256 `5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962`,
225119 bytes). Do not use the checked-in 2026-11-07 historical dump for this
bootstrap.

The verified 2026-11-09 baseline already contains the curriculum,
Question Bank, and quiz-grading structures represented by migrations
`20261110_a` through `20261110_c`. The SQL runner reported them pending because
the new version identifiers differ from the historical ledger versions. The
previous approved apply attempt rolled back at `CREATE TABLE learning_sections`
with `relation already exists`; the target had zero new-stream ledger rows.
Activity `content` and Learning Media were absent. The active manifest has
since been reconciled to D and E only. The previous approval covered the old
five-migration plan and does not authorize applying this corrected plan.
Obtain new explicit approval before starting/recreating the service, applying
D/E, or running DB tests that write records.

After explicit authorization for all local DB writes, create an empty
`vista_baseline_test_course_builder` database in the dedicated container, then
run `scripts/restore_schema_baseline_isolated.py` with
`VISTA_BASELINE_TEST_DATABASE_URL` pointed at that loopback database, the
verified fingerprint/size, an inventory output under `/tmp`, and
`--confirm-isolated-restore`. The helper requires PostgreSQL 17, verifies the
dump, refuses a non-empty public schema, restores transactionally, and checks
catalog counts. Create `vista_test_course_builder` as a template clone of that
restored database, then apply the registered migrations only to the clone.
This preserves the exact identity expected by the Jest and migration-runner
guards while keeping baseline restore and application migration ledgers
separate. The prior Gate 2 approval covered a different five-migration plan;
obtain fresh approval for the corrected D/E plan before any database writes.

## Verification status

Safe/read-only checks after local review:

```sh
docker compose -f docker-compose.education-test.yml config
cd services/education-api
npx prisma validate --schema prisma/schema.prisma
```

Manifest release validation passed after reconciliation. No new runner dry-run
was possible because the prior disposable container is no longer present. The
previous baseline restore/template clone passed identity/catalog checks, and
the failed apply rolled back as expected. No post-reconciliation database
application or A–F test has run. Reverify the container identity, tmpfs, and
baseline, then obtain fresh approval before writes. No Production or shared
Supabase URL was used. Do not bypass the registered SQL release runner.

Cleanup is a destructive operation and is intentionally separate from the
read-only commands above. After confirming the correct Compose project/service,
the operator may stop/remove only that dedicated service. Its tmpfs data is
discarded when the container stops; never add `-v` or target the main
`docker-compose.yml` project for cleanup.

## Release readiness after approval

1. Review the two selected immutable SQL files and compatibility window.
2. Commit the reviewed SQL source bytes; do not include unrelated working-tree
   files in that commit.
3. Preserve the baseline-specific D/E selection, exact SHA-256 checksums,
   contiguous order, and original source commit in `manifest.json`.
4. Validate manifest and SQL runner contract; require a second DB reviewer.
5. Apply in an authorized isolated PostgreSQL 17 database and compare catalog
   assertions for tables, constraints, indexes, functions, triggers, RLS, and
   grants.
6. Review integration results and recovery plan before any separate Production
   release approval. This task performs none of these release operations.
