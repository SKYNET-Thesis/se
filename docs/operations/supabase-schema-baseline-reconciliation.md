# Supabase schema baseline and migration reconciliation

> **SUPERSEDED — DO NOT USE AS AN EXECUTION RUNBOOK.** This document records
> the prior migration proposal and the historical 2026-11-07 baseline. The
> approved November 9, 2026 baseline was integrity-checked, restored in
> isolation, and compared with Production. Migration Recovery is DONE within
> that verified scope; the first live SQL-runner release remains unvalidated. The
> approved current ownership policy is
> [`production-migration-ownership.md`](production-migration-ownership.md),
> and the current baseline verification is recorded in
> [`production-schema-baseline-20261109-verification.md`](production-schema-baseline-20261109-verification.md).
> In particular, do not execute the old “IoT-only rollout” steps.

## Decision

Do not attempt to repair `public._prisma_migrations`.  Production has 13
effective migration names, but only one source checksum matches; twelve
canonical source files cannot be recovered.  A schema snapshot is evidence of
the current catalog, not a Prisma-ledger reconciliation mechanism.

The reviewed production schema-only export is now held at
`database/baselines/production-public-schema.sql` with SHA-256
`8504fe7dc5a3bb112c2b5dfa62803d6fe1f3e2ec56c444eaff12ba7e277655a0`.
It restores unchanged on local PostgreSQL 17 and is the source-controlled
catalog baseline. It does not reconcile Prisma's ledger.

## Reconciliation strategy

Adopt a separate, versioned SQL migration stream after an approved baseline
capture.  Keep `_prisma_migrations` immutable and stop using Prisma migrate
against this production project until all historical source bytes are recovered
(which is currently not possible).

The proposed stream has three reviewed artifacts per release:

1. A schema-only public catalog snapshot and SHA-256/object manifest.
2. An immutable SQL migration file with its SHA-256 and release commit.
3. A new application-owned migration ledger, for example
   `public.vista_schema_migrations`, created only in an approved production
   change.  It records version, checksum, applied timestamp, release commit,
   tool version, and operator identity.  It is distinct from and never rewrites
   Prisma's ledger.

Creating that application ledger and recording the initial schema-baseline
fingerprint is a separate reconciliation change requiring its own approval. It
is not part of the IoT-only rollout and must be completed before any migration
runner can record IoT changes.

An approved migration runner must obtain a database advisory lock, validate
the expected baseline fingerprint and prior ledger state, execute one ordered
SQL migration in a transaction where PostgreSQL permits it, write its own
ledger row in that transaction, then run catalog post-checks.  It must reject
an already-recorded version with a different checksum.

This is preferable to `prisma migrate resolve`, manually inserting Prisma
ledger rows, or treating a schema dump as Prisma history.  Prisma Client may
continue to be used as the application query client; Prisma Migrate is not the
authoritative production schema deployment tool until a separately approved
full historical reconstruction exists.

## IoT-only rollout

The initial approved SQL stream must contain exactly two application changes:

1. `20261106_iot_command_lifecycle` — checksum
   `a351f372d645ce630997841f1e8ccad66f9881c3c8b8aa514a8f3a1d9464c45d`.
2. `20261106_iot_publish_intent` — checksum
   `fad0cfbbca5680e9825841a529c9a09b4e0d6457af043b95a5d07f60d7009833`.

WF01, curriculum, and question-bank migration directories are explicitly out
of scope.  They must not be present in the runner's release manifest.

This IoT-only stream assumes the separately approved application ledger already
exists and contains the reviewed production-baseline fingerprint.  If it does
not, the rollout is NO-GO rather than bundling ledger adoption into the two
IoT migrations.

Preflight, after PITR/backup confirmation:

1. Compare the reviewed production schema export with local restore catalog.
2. Confirm `learning_experiments`, `control_sessions`, and `robots` have UUID
   primary keys; confirm both IoT tables are absent.
3. Confirm the new migration ledger has no IoT version rows and acquire the
   deployment advisory lock.
4. Keep API publish/recovery and SQS-worker flags off.

Apply both immutable IoT SQL files in one reviewed transaction and record the
two application-ledger rows in the same change.  Do not create or alter any
row in `_prisma_migrations`.

Post-check: verify both tables; the lifecycle FKs, state check, primary keys,
`iot_command_lifecycles_experiment_idx`, and
`iot_inbound_events_command_idx`; then verify API health before progressively
enabling IoT API, recovery, and worker flags.

If any preflight, DDL, ledger, or post-check fails, abort before feature flags
change.  Preserve logs and ledger state.  Use Supabase PITR into an isolated
recovery project to investigate; do not roll back by editing ledger rows or
historical migration SQL.

## Baseline restore and parity evidence (2026-11-07)

The production dump contains DDL only: no data statements, credentials, role
or ACL statements, connection string, or private key. It restored unchanged
into a PostgreSQL 17 disposable database after removing the template-created
`public` schema. The pre-IoT catalog has 77 public tables (including
`_prisma_migrations`), 687 columns, 77 primary keys, 156 foreign keys, 51
unique constraints, 203 indexes, three functions, ten triggers, one enum, and
RLS enabled on 36 learning tables. It declares no `public` RLS policies.

Prisma `db pull --print` returned 76 application models from the pre-IoT
baseline; the current checked-in Prisma schema declares 84. The eight
Prisma-only tables are `learning_sections`, `learning_activities`,
`learning_activity_objectives`, `learning_questions`,
`learning_question_versions`, `learning_question_version_objectives`,
`learning_assignment_question_versions`, and
`learning_quiz_attempt_grading`. They are expected pending
curriculum/question-bank work and are expressly not part of the IoT release.
There are no production-only tables that Prisma can introspect as models; the
77th catalog table is Prisma's migration ledger, which Prisma intentionally
does not model.

The Prisma schema-diff also identifies a production-only
`learning_activity_progress.activity_definition_id` column, its FK/index, and
two index-name differences (`education_school_user_profiles` organization/type
index and the learning activity-progress learner/activity unique index).
Prisma reports check constraints, the `users` expression index, database
comments, and RLS as unsupported/partially supported metadata. These are
catalog facts to preserve in the SQL baseline, not safe candidates for an
automatic Prisma reconciliation.

Applying `20261106_iot_command_lifecycle` followed by
`20261106_iot_publish_intent` to that exact disposable restore passed. The
result has 78 introspected application models, the two IoT tables, their three
lifecycle foreign keys, the expanded state check, and four indexes including
both primary keys. A generated Prisma Client raw-query smoke test resolved
both tables, 19 lifecycle columns, and the state check. This proves local DDL
compatibility only; it is not production-change approval.
