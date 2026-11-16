# Production SQL migration stream

This directory contains immutable SQL sources for releases owned by the SQL
release runner. The baseline-specific manifest selects only the two Course
Builder changes still missing from the verified 2026-11-09 baseline. The
registered sources have not been applied by this repository workflow.

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

The five immutable SQL sources below were committed in
`cefd4825dcb21a80385cfca801ea7018b0d8df5e`. The historical A–C sources remain
available for audit, but are excluded from the current manifest because the
verified baseline documents their equivalent changes as already applied under
the earlier production versions `20261104_curriculum_foundation`,
`20261105_question_bank_foundation`, and
`20261106_question_bank_quiz_attempt`. Their source checksums remain intact.
The active manifest selects D and E in contiguous order and validates their
checksums against the original source commit:

1. `20261110_a_curriculum_foundation.sql`: existing lessons/objectives and
   activity progress; creates sections, activities, objective links, and
   extends the legacy activity progress slot check. The added UUID link is
   nullable so existing legacy rows need no fabricated mapping.
2. `20261110_b_question_bank_foundation.sql`: existing organizations, courses,
   lessons, users, objectives, assignments, classroom assignments, and attempts;
   creates question bank versions and their immutability/scope guards.
3. `20261110_c_question_bank_quiz_attempt.sql`: existing assignment attempts;
   creates the private grading snapshot and guards issued public/private data.
4. `20261110_d_activity_content.sql`: curriculum foundation's
   `learning_activities`; adds the validated JSONB content column exactly once.
5. `20261110_e_learning_media.sql`: existing courses and users; creates
   course-scoped media metadata. Activity JSON references remain application
   validated; there is intentionally no direct media-to-activity FK.

The verified 2026-11-09 schema-only baseline already contains `learning_sections`,
`learning_activities`, activity-objective links, the activity-progress
definition link/trigger, Question Bank tables and guards, and private quiz
grading. These overlap migrations `20261110_a` through `20261110_c`. The
baseline does not contain the new `learning_activities.content` column or
Learning Media table. The first isolated apply attempt using the five-entry
manifest rolled back at A when `learning_sections` already existed. The
baseline verification report also records the exact prior production SQL
ledger versions listed above. This is why the active inventory now selects
only D and E; it does not add fabricated ledger rows or change historical
migration files. The comparison is:

| Object group | 2026-11-09 baseline | A–C source comparison | Action |
|---|---|---|---|
| Sections, activities, objective links | Present; columns, keys, FKs, checks, indexes, and RLS recorded in the isolated inventory | Present. The new A source changes the section/activity ordinal unique constraints from `DEFERRABLE INITIALLY IMMEDIATE` to immediate constraints; its progress-scope function/trigger is present in the baseline | Do not replay A; preserve the already-applied historical version and its actual deferrability |
| Question Bank tables and guards | All four tables, related constraints/indexes, seven functions/triggers, and RLS are present | B's schema objects are present; its historical and current SQL differ only in runner transaction wrapper/comments | Do not replay B; historical version is already in the Production SQL ledger |
| Private quiz grading | Table, JSONB check, FK/PK, RLS, restricted ACL, and snapshot immutability triggers are present | C's schema objects are present; its historical and current SQL differ only in runner transaction wrapper/comments | Do not replay C; historical version is already in the Production SQL ledger |
| `learning_activities.content` | Missing | D adds JSONB `NOT NULL DEFAULT '{}'` with an object-type check | Active migration D |
| Learning Media | Table and named indexes missing | E adds metadata, course/user FKs, unique object key, validation checks, indexes, and RLS; there is no media-table policy in the baseline | Active migration E; verify resulting role grants and RLS in isolated post-check |

The 2026-11-07 checked-in baseline is a distinct earlier snapshot: its
SHA-256 is `8504fe7dc5a3bb112c2b5dfa62803d6fe1f3e2ec56c444eaff12ba7e277655a0`
and its README inventory reports 77 tables. It predates the three historical
curriculum/question-bank releases, while the separately captured 2026-11-09
baseline has SHA-256
`5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962` and 88
tables. The latter's evidence record identifies it as the 2026-11-09
Production capture and documents a read-only catalog comparison with no
observed public schema drift at that time. The older dump is not the current
release baseline. A fresh isolated execution is still required to verify D
and E; neither capture proves an unobserved later Production state.

All five SQL sources omit explicit transaction statements because the SQL
release runner owns the transaction. The activity content ALTER appears only
in its dedicated SQL migration. The two media indexes match the full indexes in
Prisma rather than using partial predicates that Prisma cannot represent.
The migration filenames sort in the same order required by the manifest
validator. The two curriculum ordinal uniqueness constraints are immediate,
matching the immutable A source's intended reorder strategy, but the deployed
historical constraints are deferrable. A is excluded from the active manifest,
so the existing database behavior is preserved. The Question Bank assignment
ordinal constraint remains deferrable because the service
explicitly defers it while reordering; Prisma cannot express that PostgreSQL
detail, so the SQL release remains authoritative for that behavior.

Do not apply any file directly or to Production. The active D/E inventory is
reconciled to the verified 2026-11-09 baseline but has not yet been applied in
a fresh isolated run. Do not place the lost legacy Prisma SQL here. Do not edit
historical migration files. Do not execute SQL from this directory against
Production without a separately approved release gate and the production
baseline prerequisites in
[`../../docs/operations/supabase-production-schema-baseline.md`](../../docs/operations/supabase-production-schema-baseline.md).

See [`../../docs/operations/production-migration-ownership.md`](../../docs/operations/production-migration-ownership.md)
for migration ownership and release approval policy.

Catalog verification does not validate a first live runner execution or
authorize a Production release. Any future application requires separate
review, explicit approval, and the controls in the ownership policy.
