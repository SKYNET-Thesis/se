# VISTA — Database Migration Status

> Last updated: 2026-11-11. This file records status only; it grants no
> authorization to run anything against production. The 2026-11-07 text below
> is superseded by the section "Status against the verified 2026-11-09 baseline".

## Production gate: NO-GO

Supabase PostgreSQL is the **primary production database**. Existing data must
remain untouched. Until a schema-only authoritative baseline is reconciled and
explicitly approved:

- Do **not** run `prisma migrate`, `prisma db push`, `prisma migrate reset`, or any
  schema change against production.
- Do **not** modify `_prisma_migrations`.
- Do **not** use production credentials for tests.

## Known state

- The Git migration chain does not match the historical Supabase
  `_prisma_migrations` records. The original baseline was never captured in the repo.
- Provisioning the **current** Prisma schema into a disposable PostgreSQL 16
  proves the schema is valid; it does **not** prove historical migration reproducibility.
- Migration directory currently present under `services/education-api/prisma/migrations/`:

  ```
  20261025_add_blockly_control_mode
  20261103_activity_progress
  20261104120000_remove_student_auth_identifier
  20261104_curriculum_foundation
  20261105_question_bank_foundation
  20261106_classroom_enrollment_lifecycle        (uncommitted, feature branch)
  20261106_question_bank_quiz_attempt
  ```

## Status against the verified 2026-11-09 baseline

The schema contract is the verified Production baseline of 2026-11-09 (SHA-256
`5b140ce7…`, 88 public tables; see
`production-schema-baseline-20261109-verification.md`), not the Prisma schema file and
not the older checked-in 2026-11-07 dump. Relevant facts, checked on a disposable restore:

| Object | Baseline contract |
| --- | --- |
| `learning_enrollments` | one row per `(course_id, learner_user_id, classroom_id)`; `status IN ('active','completed','revoked')` |
| `learning_classroom_members.status` | `invited, active, inactive, completed, removed` (there is **no** `left`) |
| `learning_classrooms.status` | `draft, active, completed, archived` |
| `learning_questions.organization_id` | `NOT NULL` (global course questions need migration F) |

SQL migration sources under `database/migrations/` (migrations D to H are registered in the manifest;
none of them has been released or applied to Production):

| Source | Effect | State |
| --- | --- | --- |
| `20261110_a_curriculum_foundation.sql` … `_c_question_bank_quiz_attempt.sql` | Sections, Activities, Question Bank, quiz attempts | already in the baseline under historical versions; replaying them fails (`relation already exists`) |
| `20261110_d_activity_content.sql` | `learning_activities.content` | additive; not applied to Production |
| `20261110_e_learning_media.sql` | `learning_media_assets` | additive; not applied to Production |
| `20261112_h_learning_media_audio_mpeg.sql` | `learning_media_assets` MIME CHECK | additive (allows `audio/mpeg`); Registered in the migration manifest (order 5), not applied to production. |
| `20261111_f_global_question_scope.sql` | `learning_questions.organization_id` nullable, `(course_id, code)` unique for global questions, NULL-safe scope guards | additive and replay-safe (verified by running it twice on a disposable database); depends only on the migration-B objects that the baseline already contains; **not registered, not applied to Production, needs release approval** |

Migration F is the minimal Question Bank part of the earlier draft
`migration-drafts/20261111_global_quiz_runtime_role.sql`; the runtime-role/privilege part of that draft is a
separate gate and is not part of F. The Prisma schema already declares `organization_id` nullable, so the
global-course quiz authoring API requires F before it can be used against a real database.

Disposable-database evidence (isolated PostgreSQL 17, baseline + D + E + F applied with `psql`, not through the
SQL runner): global and school-scoped Question Bank integration, enrollment concurrency and publish/sync
failure-retry suites pass. This is not a release validation.

## Development bootstrap (2026-11-11)

A new development database is built from the repository alone: the verified baseline
(`database/baselines/production-public-schema-20261109T172950Z.sql`, SHA-256 `5b140ce7…`) is restored into an
empty loopback `vista_test_*` PostgreSQL 17 database, then the manifest migrations (D/E/F/G/H) are applied through
`scripts/sql_migration_runner.py`, then the result is verified (ledger, required objects, idempotent re-run).
Command: `python3 scripts/bootstrap_dev_database.py --confirm-local-bootstrap`; guide in `database/README.md`.

Root cause of the earlier blocker: the only checked-in schema, `database/vista_database_schema.sql` (Review 2,
77 tables), predates the Course Builder and enrollment lifecycle work, and the manifest deliberately starts at D
because A/B/C are inside the Production baseline. No checked-in artifact therefore described the schema that D/E/F
and the backend assume (`learning_activity_progress`, classroom-member / lesson-progress / enrollment unique
constraints, enrollment `revoked` status, ...). The baseline was kept outside Git, so it could not be used.

Finding and decision: migration A's source declares `check_learning_activity_progress_scope()` and a trigger on
`learning_activity_progress`; neither exists in the verified Production baseline (all other objects declared by
A/B/C are present). Impact assessment: the only backend writer (`activity-progress.service.ts`) derives `lesson_id` from
the activity's own section in the same statement, so no current code path can store a mismatched row, and no backend
test depended on the guard; the missing guard is a loss of defence-in-depth for direct SQL and future code, not an
active integrity defect. Forward fix: new migration `20261111_g_activity_progress_scope_guard` recreates the
function and trigger exactly as A defined them (migration A is not edited). It validates only future writes, never
scans or rewrites existing rows, and is covered by `activity-progress-scope.db.spec.ts`. G is registered in the manifest
as the fourth release candidate; it is **not applied to Production and needs release approval**. Until it is released,
development databases are intentionally one migration ahead of Production, like D/E/F.

Not a release validation: the first live Production runner execution is still unapproved and unvalidated.

CI: `.github/workflows/database-bootstrap.yml` runs the fresh bootstrap, schema/ledger verification, Prisma, backend build
and PostgreSQL integration suites on every relevant push/PR against a disposable PostgreSQL 17 service container.

### Outstanding before any Production release (none of this blocks development)

1. Explicit release approval naming the target and scope; second database reviewer; recovery plan (policy:
   `production-migration-ownership.md`).
2. Re-check that Production still matches the 2026-11-09 baseline (read-only catalog parity) immediately before release.
3. First live execution of the SQL runner against Production has never been validated; do a reviewed dry-run first.
4. D/E/F/G are unreleased; G specifically changes Production behaviour (adds a guard trigger) and needs its own review.
5. The runtime-role/privilege part of the earlier draft (`migration-drafts/20261111_global_quiz_runtime_role.sql`) is a
   separate gate and is not part of D–G.
6. Backend deployment must be sequenced after D/E/F are applied (the API uses `learning_activities.content`,
   `learning_media_assets`, and global-scope questions).

## Safe test procedure

Use an isolated disposable PostgreSQL 16 instance with independent credentials.
Stop and remove the container afterwards. Never point test configuration at Supabase.

## Outstanding work before GO

1. Capture a schema-only authoritative baseline from a known-good environment.
2. Reconcile the baseline against the Git migration chain and document the delta.
3. Review backup/restore procedure for production.
4. Obtain explicit user approval before any production schema operation.
