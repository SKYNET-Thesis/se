# Supabase IoT migration readiness

This runbook prepares, but does not execute, the production migration for the
IoT command lifecycle.  Run the evidence queries with a production database
role that has read-only access only.  Do not put a production connection URL in
shell history, CI logs, the repository, or a Prisma environment file.

## Repository gate

The two migrations are ordered as follows:

1. `20261106_iot_command_lifecycle` creates `iot_command_lifecycles`,
   `iot_inbound_events`, their foreign keys/check constraint, and two indexes.
2. `20261106_iot_publish_intent` widens the lifecycle state constraint and adds
   the persisted payload, attempt, owner, lease, start-time, and error columns.

`20261106_iot_command_lifecycle/migration.sql` must be committed unchanged
before deployment.  It was previously ignored by the repository-wide `*.sql`
rule while `20261106_iot_publish_intent` was tracked.  Running the tracked
publish-intent migration alone would fail because its target table does not
exist on a database that has not already received the lifecycle migration.

The current checkout also contains older ignored migration directories
(`20261014_*`, `20261015_symbolic_evaluation_history`,
`20261021_wf01_classroom_robot_allocation`, and
`20261022_wf01_user_provisioning`).  They are not part of `HEAD` and therefore
would not be present in an image built from the current Git commit.  Do not
run any Prisma production command from that commit until a reviewed migration
manifest has recovered or explicitly baselined those files.  This is a source
control/history issue, not a reason to alter production migration records.

Do not run `prisma migrate deploy` or `prisma migrate resolve` if the history
query below has a missing, extra, failed, rolled-back, or checksum-mismatched
row.  Resolve that discrepancy in a reviewed change/incident first; do not
edit historical migration SQL.

### Migration manifest inventory (2026-11-07)

`migration_lock.toml` declares `provider = "postgresql"`.  The filesystem has
18 `migration.sql` files.  Eight are tracked in `HEAD`; nine are ignored
local-only files; and lifecycle is now visible to Git but remains untracked
until a reviewer adds it.  The nine ignored files and lifecycle have no
reachable Git-history path or recoverable unreachable commit path.  They must
be treated as local artifacts until an authoritative source is identified.

| Migration | Source state | SHA-256 |
| --- | --- | --- |
| `20261014_add_auth_user_mapping` | ignored, local only | `ef3e25e3fdb1c4ecdbe0d3208afa655b5808aa13a95001b18a8f72dc8b8307cb` |
| `20261014_add_auth_user_provisioning_trigger` | ignored, local only | `20e5b5b2f420c0bfeba2a0cb1459027a2b7c498810e67cc7c7f9dcb68980aee2` |
| `20261014_phase2b_assignment_permissions` | ignored, local only | `219620f4dc590760a5919e84faa53541a94531ccc562dfe4df76da4eebf22f76` |
| `20261014_phase2c_submission_program_version` | ignored, local only | `9ac086e3459cc820e84881ebda2c912173e1c64232b198f20adea98a1dadf294` |
| `20261014_phase2d_assessment_permissions` | ignored, local only | `7b574ede6093fe82d35916f1d4fa798fb06c64156fcfadc2b8bdaf761aacf176` |
| `20261014_phase3_experiment_permissions` | ignored, local only | `e0aac968ac2796f5f6a48474ab03ff37d4bf5b1d9cb1d17deeb377170967c74d` |
| `20261015_symbolic_evaluation_history` | ignored, local only | `7d162e6603e384984046988dc93ebe0c061464f0023c4bea199b2be6b9e3a094` |
| `20261021_school_administration` | tracked; introduced by `0db29da` | `966a63f1dc5f488fbf49b986f8c004bb29693c29a8909861b7431ce47da62c51` |
| `20261021_wf01_classroom_robot_allocation` | ignored, local only | `32b722006467f310a44d2006ff8ad9d333b4e17e28b8f36a25e91ff41943448b` |
| `20261022_wf01_user_provisioning` | ignored, local only | `b4c734821925d7753219f3d01d89f13b9e0246d98dd0c88e96d3ce2dbab1d41c` |
| `20261025_add_blockly_control_mode` | tracked; introduced by `8aac863` | `72d649be85ee4668bde821c61713e385069839eadab3173009b78d6b28defbcc` |
| `20261103_activity_progress` | tracked; introduced by `88241e2` | `0bba63bc4e38e5dbcb5b73b74ccdcc0db9d769d89cb03565f19d8e46c999a9b3` |
| `20261104120000_remove_student_auth_identifier` | tracked; introduced by `20948b9` | `66804f342fe8b69f0febea18683eed21b856b68ce081b391b8fd8c0716c56eb8` |
| `20261104_curriculum_foundation` | tracked; introduced by `82b376b` | `57cb9b29751f3392214c54ac0291a696fbdb03f5ab252ab9f9e836822f305359` |
| `20261105_question_bank_foundation` | tracked; introduced by `82b376b` | `cfad4d384a5ff551d68c5ac57d7c9b1981c2d2e52a37a2060ee1f936a3516056` |
| `20261106_iot_command_lifecycle` | untracked but no longer ignored; local only | `a351f372d645ce630997841f1e8ccad66f9881c3c8b8aa514a8f3a1d9464c45d` |
| `20261106_iot_publish_intent` | tracked; introduced by `b48b699` | `fad0cfbbca5680e9825841a529c9a09b4e0d6457af043b95a5d07f60d7009833` |
| `20261106_question_bank_quiz_attempt` | tracked; introduced by `82b376b` | `e9c2c214dc836d32c7031a4e185c77063a1b4e84ca3c6ff86109f0663b13f825` |

The migration SQL was not rewritten.  The only manifest change is the
`.gitignore` exception that makes lifecycle visible for review.  Do not use
the local-only checksums to mark rows applied; compare them to an export from
production and recover provenance through the owning branch/release archive.

### Local sequential compatibility check

On PostgreSQL 16 in an ephemeral local container, with minimal UUID primary-key
tables for `learning_experiments`, `control_sessions`, and `robots`, the
following completed in order without Prisma CLI: lifecycle `CREATE TABLE` and
indexes, then publish-intent `ALTER TABLE`.  Catalog inspection confirmed the
expanded state check, `iot_command_lifecycles_experiment_idx`,
`iot_inbound_events_command_idx`, and all six publish-intent columns.  This
establishes DDL ordering compatibility only; it is not evidence about
production migration history or schema state.

### Production ledger comparison (read-only CSV evidence, 2026-11-07)

The production export has 14 ledger rows for 13 distinct migration names.
`20261015_symbolic_evaluation_history` has one rolled-back row followed by one
finished row with the same checksum; its effective state is applied.  Neither
IoT migration appears.  The production catalog export confirms that
`learning_experiments`, `control_sessions`, and `robots` exist; the evidence
owner separately confirmed their `id` columns are UUID; neither IoT table
exists.

| Production migration state | Names | Source comparison |
| --- | --- | --- |
| applied and byte-identical | `20261103_activity_progress` | checksum matches `0bba63bc4e38e5dbcb5b73b74ccdcc0db9d769d89cb03565f19d8e46c999a9b3` |
| applied but current filesystem checksum differs | six `20261014_*` rows, `20261015_symbolic_evaluation_history`, `20261021_school_administration`, `20261025_add_blockly_control_mode`, `20261104120000_remove_student_auth_identifier` | no reachable Git blob matches the production checksum |
| applied but source is absent from filesystem | `20261021_remove_local_user_credentials`, `20261104000000_student_code_auth` | no reachable Git source path/blob for recovery |
| absent from production history | `20261021_wf01_classroom_robot_allocation`, `20261022_wf01_user_provisioning`, `20261104_curriculum_foundation`, `20261105_question_bank_foundation`, `20261106_question_bank_quiz_attempt`, and both IoT migrations | these must not be incidentally selected by an IoT-only release |

The two WF01 migrations are especially out of scope for IoT: one creates
classroom-to-follower allocation data and grants allocation permission; the
other relaxes `users.email`, creates school user profiles/indexes, and grants
provisioning permission.  They must be excluded from the IoT release manifest
unless separately approved with their own production preflight.  The three
curriculum/question migrations are also out of scope and create or alter
learning tables, RLS, functions, triggers, and grading tables.

### IoT-only deployment manifest (required approach)

The reviewed production baseline proves catalog compatibility, but it cannot
make Prisma's divergent historical ledger safe. Do **not** run `prisma migrate
deploy`, `migrate resolve`, or `db push` from any source tree for this project.
The earlier idea of reconstructing a Prisma-compatible manifest is retained
only as a future recovery option and is not a rollout path because 12 canonical
historical source files are unavailable.

The approved design candidate is the separate application-owned SQL migration
stream described in `supabase-schema-baseline-reconciliation.md`. Its release
manifest contains exactly the two immutable IoT SQL files and explicitly
excludes WF01, curriculum, and question-bank work. It can be executed only
after a separately reviewed creation of the application-owned ledger and
recording of the reviewed baseline fingerprint. `_prisma_migrations` remains
read-only throughout.

Do not substitute manual SQL plus ledger writes, `migrate resolve`, a renamed
replacement migration, or `db push`: each would leave a divergent Prisma ledger
or make the historical divergence harder to audit.

## Read-only production evidence

Run this as one read-only transaction and retain the result in the change
record with any sensitive values redacted.  All statements below are `SELECT`,
catalog inspection, or transaction control only.

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';

SELECT migration_name,
       checksum,
       started_at,
       finished_at,
       rolled_back_at,
       applied_steps_count,
       logs
FROM public._prisma_migrations
ORDER BY started_at NULLS LAST, migration_name;

SELECT migration_name, checksum, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations
WHERE migration_name IN (
  '20261106_iot_command_lifecycle',
  '20261106_iot_publish_intent'
)
ORDER BY migration_name;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'learning_experiments', 'control_sessions', 'robots',
    'iot_command_lifecycles', 'iot_inbound_events'
  )
ORDER BY table_name;

SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('iot_command_lifecycles', 'iot_inbound_events')
ORDER BY table_name, ordinal_position;

SELECT c.relname AS table_name,
       con.conname,
       con.contype,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('iot_command_lifecycles', 'iot_inbound_events')
ORDER BY c.relname, con.contype, con.conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('iot_command_lifecycles', 'iot_inbound_events')
ORDER BY tablename, indexname;

SELECT c.relname AS table_name, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('learning_experiments', 'control_sessions', 'robots')
  AND a.attname = 'id'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname;

ROLLBACK;
```

Expected after both IoT migrations: lifecycle primary key `command_id`; FKs to
`learning_experiments(id)` with cascade, `control_sessions(id)`, and
`robots(id)`; lifecycle index on `experiment_id`; inbound-event primary key
`event_id`; inbound-event index on `(command_id, sequence)`; and the state
check includes `pending_publish`, `publishing`, `publish_failed`, and
`reconciliation_required` in addition to the original lifecycle states.

## Compatibility decision

GO only when all of these are true:

1. The separately approved application-owned ledger exists, has recorded the
   reviewed production-baseline fingerprint, and has no IoT release rows with
   a conflicting checksum. `_prisma_migrations` is evidence only and is never
   reconciled or modified by this rollout.
2. The lifecycle migration is present and committed in the release candidate,
   before the publish-intent migration.
3. The three referenced parent tables exist and their `id` columns are `uuid`.
4. Neither IoT table exists before the rollout.  If either exists, stop and
   compare its catalog evidence with both migrations; do not use `resolve` to
   make the history appear healthy.
5. A Supabase PITR/backup restore point and a tested restore owner are recorded
   immediately before the approved change window.

NO-GO if the application ledger is absent/unapproved, either IoT table or a
conflicting IoT ledger row already exists, or the pre-window baseline
fingerprint/catalog differs. Historical Prisma divergence remains a permanent
NO-GO for `prisma migrate deploy` until canonical source reconstruction is
separately achieved.

## Approved execution sequence (after the gates pass)

1. Freeze application deployments that could run schema-changing tools and
   record the release commit plus SHA-256 of both migration SQL files.
2. Confirm Supabase PITR/backup status and the restore project/owner.  This is
   the rollback path; these additive DDL changes are not rolled back in place
   during an incident.
3. Re-run the read-only evidence transaction immediately before the window and
   record that both IoT tables and application-ledger IoT rows are absent.
4. Use the approved SQL migration runner with a production direct URL and
   dedicated migration role. It must take its advisory lock, validate the
   baseline fingerprint and prior application-ledger state, apply exactly the
   two reviewed files in order, and record its own rows transactionally. Do
   not run any Prisma migration command, `db push`, or `migrate resolve`.
5. Re-run the post-migration verification below before enabling IoT publish,
   recovery, or the SQS worker.  Keep those runtime feature flags off until
   verification succeeds.

## Post-migration verification

Use the same read-only transaction above, then additionally run:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT version, checksum, applied_at, release_commit
FROM public.vista_schema_migrations
WHERE version IN (
  '20261106_iot_command_lifecycle',
  '20261106_iot_publish_intent'
)
ORDER BY version;

SELECT table_name, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename = 'iot_command_lifecycles'
       OR tablename = 'iot_inbound_events')
ORDER BY table_name, indexname;

SELECT conrelid::regclass AS table_name, conname,
       pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'public.iot_command_lifecycles'::regclass,
  'public.iot_inbound_events'::regclass
)
ORDER BY table_name::text, conname;
ROLLBACK;
```

Both application-ledger rows must carry the reviewed checksums. Verify the
production API health check with IoT feature flags still off before
progressively enabling the API, recovery runner, then worker.

## Failure and recovery

If the approved SQL runner fails, stop rollout, preserve its logs and
application-ledger state, and keep all IoT flags off. Do not edit Prisma's
ledger or manually mark a version applied. Restore the pre-window Supabase
PITR backup to an isolated recovery project, investigate the exact failure
there, and prepare a forward-only reviewed migration if required. Use a
production restore only through the approved Supabase incident process. No
historical migration file is edited or rewritten.
