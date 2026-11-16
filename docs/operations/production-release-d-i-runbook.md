# Production database release D–I: runbook (PREPARED, NOT EXECUTED)

Status: **prepared for review and implemented as source (workflow, scripts, tests). The release itself (D-I) has not been run against Production.** Since this text was first written (2026-11-12) the logical-backup AWS destination, the GitHub variables, the Supabase reader role and the read-only preflight secret were provisioned (see [production-db-logical-backup.md](production-db-logical-backup.md#one-time-configuration-status-2026-11-13)); branch protection, CODEOWNERS and a second apply reviewer are still open. It grants no authorization; every
step marked **[APPROVAL]** needs explicit owner approval at that moment. Stage J (`database/staged-migrations/`) is **not** part of
this release.

Why: the Production database is at the 2026-11-09 baseline (88 tables) and lacks migrations D, E, F, G, H and I. The API built from
`main` (`07ea5a7`) refuses to start without I (D03 Stage 1), so the automatic API deployment failed and rolled back to `a6d61ab`
(see the incident record). The same `main` also needs D–H for Course Builder / Learning Media.

## 1. Release scope (manifest on `main` `07ea5a7`, validated with `--release`)

| Order | Version | SHA-256 | Effect | Lock / data impact (Production sizes) |
|---|---|---|---|---|
| 1 | `20261110_d_activity_content` | `108c321adf155233791aae453b9e6bf77f57ef82c0da4444fbcae8b728ed5627` | `learning_activities` + `content jsonb NOT NULL DEFAULT '{}'` | constant default: metadata only; brief ACCESS EXCLUSIVE; table has 0 rows |
| 2 | `20261110_e_learning_media` | `a19f11708c4029afca9cce4474c2c3e95cbea0a5d1a850de5c0c1c08d73812a9` | new table `learning_media_assets` (+2 indexes, CHECKs, RLS on, no policy) | new object; no existing data |
| 3 | `20261111_f_global_question_scope` | `63b291c479c94ed8a9563bd64956ce3d09098a88cff98960b0c80c5e6e7306fe` | `learning_questions.organization_id` DROP NOT NULL; partial unique index; `CREATE OR REPLACE` two guard functions | metadata only; 0 rows; existing rules kept |
| 4 | `20261111_g_activity_progress_scope_guard` | `f83b78621bef0941c54c4e31b4611e77216ce3cf1d7ad4ff9865972de96b0bad` | trigger + function on `learning_activity_progress` | validates future writes only; 0 rows |
| 5 | `20261112_h_learning_media_audio_mpeg` | `468f8cefd37127efa3a54291ab51e862903acc7c83af0fba442f694f429ff5c2` | re-creates the MIME CHECK on `learning_media_assets` (adds `audio/mpeg`) | table created by E in the same run, empty |
| 6 | `20261113_i_attempt_submission_foundation` | `d13e7ddc22fb98ac5735777b86d1410e419f1422fcc748195d03b306ae8cf093` | D03 Stage 1: `learning_submissions.attempt_id/origin`; attempt draft/release columns + CHECK; `learning_submission_files` (RLS); backfill audit table (RLS); trigger; safe backfill of unambiguous `attempt_id`; quiz auto-release | tiny tables (1 submission, 8 attempts); short SHARE ROW EXCLUSIVE locks; UPDATE of ≤ 8 rows |

`sourceCommit` `78f676a95bee43db1b9f1cf0cbadea50e487aab0` is an ancestor of `main`; the runner applies D–I in **one transaction** (all or
nothing) in this order, recording each in `public.vista_schema_migrations`. Dependencies verified on Production: E→H (H needs E); F needs
migration B objects (`learning_questions`, both guard functions) which exist; G needs `learning_activity_progress` which exists; D, E, I
have no unmet dependency; I creates `learning_submission_files`/audit/functions that do not exist yet (no name collision).

## 2. Production preflight (read-only, done 2026-11-12)

| Check | Result |
|---|---|
| Identity | (2026-11-12, with the then-used owner URL) pooler host, user `postgres.ovijutkvaaxohauvuxbj`, `SUPABASE_URL` project ref matches; since the role-separation change the read-only path requires `vista_backup_reader.ovijutkvaaxohauvuxbj` and only apply uses `postgres.…`; server PostgreSQL 17.6, not in recovery |
| Baseline | 88 tables, 46 RLS-enabled, 0 policies, 19 triggers, 12 functions = baseline (after D–I: 91 tables, 49 RLS-enabled, 21 triggers, 14 functions, as pinned in `dev-schema-expectation.json` for a database that has D–I) |
| Ledger | `vista_schema_migrations` columns and primary key as the runner expects; 7 earlier `executed` versions; `_prisma_migrations` 14 rows (legacy, untouched) |
| Prerequisites | present; no object that D–I create exists yet |
| Roles | session user `postgres` owns every table and function D–I alter; `statement_timeout` 2 min; `lock_timeout` 0 |
| Activity | 9 sessions, 0 idle-in-transaction, 0 ungranted locks, oldest transaction 0 s |
| Data | database 17 MB; `learning_submissions` 1 row (maps uniquely, **graded and with other submitted attempts ⇒ will be flagged `grading_attribution_uncertain`**), 8 attempts (2 learners with several), 0 evaluated quiz attempts |
| WAL archive | `archive_mode=on`, `archive_command` set, 1034 segments archived, no failures; last archive 2.75 h before the check (idle database) |
| Dry-run | `scripts/sql_migration_runner.py --dry-run --expected-project-ref ovijutkvaaxohauvuxbj` from a clean `main` checkout: **pending = D, E, F, G, H, I (in order), already_applied = []**, `release_commit` = `07ea5a7` |

Not verifiable from the database (must be confirmed by a human in the Supabase dashboard): Backups → the latest daily backup timestamp,
and whether the **PITR add-on** is enabled with its retention window. `archive_mode=on` is expected on every Supabase project and does not
prove PITR.

## 3. Compatibility with the deployed API (`a6d61ab`) while D–I are applied

All six migrations are additive; the old API keeps running throughout.
* It never references the new objects; its raw SQL uses explicit column lists for `learning_activities`, attempts and submissions
  (`SELECT *` only on untouched tables); Prisma selects explicit columns.
* D/I add columns with defaults or NULLs; the old INSERTs omit them. I keeps the legacy `UNIQUE(assignment_id, learner_user_id)`, so the old
  `ON CONFLICT` upsert stays valid (tested). F only relaxes NOT NULL; G only guards writes the old code already satisfies (it derives
  `lesson_id` from the activity's own section). New tables have RLS enabled and no policy (same as the other 46 tables); the API role has
  BYPASSRLS.
* Rehearsal: baseline-only database + production-like legacy data → `--apply` of D–I through the real runner (0.3 s) → postflight verifier
  45/45 → the previous API's own PostgreSQL integration suites (`a6d61ab`: 9 suites, 66 tests) run against the migrated schema: **all passed**.
* After D–I the **new** API starts (Stage 1 present) but answers **503** on final submit and on experiment creation until Stage J; this is the
  designed fail-closed behavior. Deploy order: **D–I, verify, then let the API deploy**.

## 4. Backup and recovery plan

| Situation | Action |
|---|---|
| Failure while applying | single transaction ⇒ automatic ROLLBACK, nothing partial, ledger unchanged. Fix forward, re-run dry-run. |
| Applied but wrong | additive schema, old API unaffected: **no rollback needed**. Fix forward with a new migration. Reviewed recovery aids (never automatic, need approval): drop the objects created by I (`learning_submission_files`, `learning_submission_backfill_audit`, the trigger/function, new columns/indexes) in reverse order, then E/G objects; the backfilled `attempt_id`s are the only changed data and are listed in the audit table. |
| Data loss / corruption | **[APPROVAL]** Supabase restore: PITR to a timestamp just before the apply (or the latest daily backup) into a new project/branch; compare; cut over only with approval. |
| Pre-release safety copy (Free plan: mandatory, automated by `backup_mode=logical`) | **[APPROVAL]** record counts with the verifier `--snapshot` (read-only), and optionally `pg_dump --schema=public` (17 MB) to an encrypted location. |

## 5. Automated release: design

Everything is implemented in source; it stays inert until the settings in section 7 exist.

| Piece | File | Role |
|---|---|---|
| Release workflow | `.github/workflows/production-database-release.yml` | manual (`workflow_dispatch`), `main` only, serialized, three jobs: `preflight` → `apply` → `resume-deployment` |
| Orchestrator | `scripts/production_db_release.py` | `plan`, `snapshot`, `check-backup`, `apply`, `compat`; fail-closed layer over `sql_migration_runner.py` |
| Verifier | `scripts/verify_production_release_d_i.py` | read-only `--snapshot` / `--verify` (also called by `apply`) |
| Deployment gate | `schema-gate` job in `.github/workflows/backend-ci.yml` | read-only; blocks API/Web deployment before any SSM command |
| Safety checker | `scripts/check_database_workflow_safety.py` | CI fails if any other workflow can apply migrations, or if the release workflow loses a safeguard |
| Release scopes | `database/release-scopes.json` | reviewed, explicit, checksum-pinned release definitions (currently only `D-I`) |
| Tests | `tests/database/test_production_db_release.py` | 40 tests: static safeguards, GitHub `if:` semantics, backup contract, scope extensibility, and the release scenarios on disposable PostgreSQL |

**preflight** (environment `production-database-preflight`, read-only credential, no reviewers): the reviewed SHA must equal the current head of
`main` and come from a merged pull request; the manifest, Git provenance and SHA-256 of every SQL file are validated; the Supabase project identity
(pooler user and `SUPABASE_URL` must name `ovijutkvaaxohauvuxbj`) is checked; the ledger is classified (checksum mismatch, missing/extra versions,
non-executed provenance all fail); the catalog must equal the verified baseline (tables, RLS, policies, triggers, functions) while nothing of the release
is applied; the manifest must equal the approved scope exactly (`D-I`) and Stage J is rejected anywhere (manifest, `database/migrations`, ledger); a
**plan** with a deterministic `planHash` is written (versions, checksums, commits, ledger digest, catalog counts; no secrets or data); a pre-release
snapshot (row counts) is taken; backup/PITR is verified through the Supabase Management API. Plan, snapshot and backup evidence are uploaded (90 days).

**apply** (environment `production-database-apply`, required reviewers): starts only after approval and is the only job that can read
`PRODUCTION_DATABASE_APPLY_URL`. It re-checks that `main` has not moved, re-verifies backup/PITR (evidence must be < 30 minutes old), **recomputes the
whole plan against the live database and refuses on any difference** (`planHash`), applies exactly the planned versions through the runner (one
transaction: all of D–I or nothing), then runs the postflight verifier; if anything cannot be proven the job fails and says whether the apply had already
committed. Evidence (plan hash, versions, approval reference `gh-run-<id>-<attempt>`, operator, timestamps, postflight result) is stored for 365 days.

**resume-deployment**: after a verified release it dispatches `Education CI` (deploy) on `main`. That run still passes its own schema gate and its own
`aws-demo` reviewer approval; nothing is deployed from the release workflow.

Approval cannot be replaced by inputs: the only inputs are `scope` (fixed choice) and `expected_main_sha`; there is no approve/confirm/skip input, the
privileged credential is unavailable until the environment's reviewers approve, and a CI test asserts these properties.

## 6. API / Web deployment coordination

`Education CI` keeps its automatic deployment (`AWS_DEPLOY_ENABLED` is unchanged) and the existing image rollback, health checks and `aws-demo` approval.
New: the `schema-gate` job runs first (environment `production-database-preflight`) and executes `production_db_release.py compat`: every migration in the
manifest of the commit being deployed must be present in the Production ledger with the same checksum. `deploy-api` and `deploy-web` need it to succeed.
If a migration is missing the gate fails, `deploy-api` is skipped, no SSM command runs and **the healthy container is never stopped** (the failure of
2026-11-12 stopped it for about a minute). Rollback (`workflow_dispatch` with `rollback`) is not gated. Web follows the API (and the gate). The gate fails
closed when its read-only secrets are not configured. Stage J is a separate release: the API keeps answering 503 for final submit and experiment
creation until it is done; the gate does not require J because J is never in the manifest.

## 7. One-time GitHub setup (manual; nothing here was changed by this work)

1. Environment **`production-database-preflight`**: branch policy `main` only; no reviewers; secrets `PRODUCTION_DATABASE_READONLY_URL`,
   `PRODUCTION_SUPABASE_URL`, `SUPABASE_ACCESS_TOKEN` (Supabase personal access token able to read backups of this project only). Create a dedicated
   PostgreSQL role with `USAGE` on schema `public`, `SELECT` on every `public` table **and sequence**, **and `BYPASSRLS`** (or table ownership) and name it **`vista_backup_reader`** (the tooling accepts no other read-only role; pooler user `vista_backup_reader.ovijutkvaaxohauvuxbj`, see [connection strings](production-db-logical-backup.md#connection-strings-and-role-separation-enforced-in-code)); use its URL (session pooler,
   `sslmode=require`); the tooling also wraps every read in `BEGIN READ ONLY`. `SELECT` alone is **not enough**: all 46 RLS tables have RLS enabled, so such a role reads 0 rows
   (`count(*)` silently returns 0, `pg_dump` aborts). `snapshot` and the logical backup now refuse a role that RLS would blind (tested). **Done 2026-11-13:** the role was created on the hosted project with [production-db-reader-role-sql.md](production-db-reader-role-sql.md) and verified (details and rollback: [production-db-logical-backup.md](production-db-logical-backup.md#reader-role)); `PRODUCTION_DATABASE_READONLY_URL` in `production-database-preflight` now holds its session-pooler URL.
2. Environment **`production-database-apply`**: **required reviewer** (configured 2026-11-13: `leduc121` only, with self-review allowed because the project has a single maintainer; the original plan of two reviewers with *prevent self-review* was replaced on purpose, see the readiness record section 16), branch
   policy `main` only, no wait-timer bypass; secret `PRODUCTION_DATABASE_APPLY_URL` (the privileged `postgres` URL used today by the API, session pooler) and the
   same `SUPABASE_ACCESS_TOKEN` and `PRODUCTION_SUPABASE_URL`. Do **not** add the privileged secret at repository level.
3. Branch protection on `main` (applied 2026-11-13, solo maintainer): required check runs `api`, `web`, `docker`, `database-safety`, `validate-inventory`; no force-push, no deletion; pull-request reviews and code-owner reviews are **not** required (nobody else can approve); `Database Bootstrap` is not required because its workflow is path-filtered. CODEOWNERS lists `@leduc121` for the database paths (documentation of ownership, not enforced).
   CODEOWNERS for `database/`, `scripts/production_db_release.py`, `.github/workflows/production-database-release.yml`.
4. Repository Actions permissions: workflows' default token read-only (the workflows request what they need); allow `workflow_dispatch`.
5. Keep `AWS_DEPLOY_ENABLED=true` and the `aws-demo` environment reviewers unchanged.

If required reviewers cannot be enforced (for example the plan does not support them for private repositories) the apply path **must not be enabled**:
leave `PRODUCTION_DATABASE_APPLY_URL` unset; the apply job then fails closed.

## 8. Backup / PITR verification

> **Supabase Free (no managed backups/PITR):** dispatch with `backup_mode=logical`. The `backup` job takes a consistent dump, restore-tests it on PostgreSQL 17, stores it encrypted in a private bucket and the apply job re-verifies evidence bound to the plan after human approval. Full design, AWS/GitHub configuration and recovery limitations: [production-db-logical-backup.md](production-db-logical-backup.md). The managed path below is unchanged and remains the default.

**API contract (verified against the public OpenAPI spec, captured in `tests/database/fixtures/supabase_v1_backups_response.schema.json`).**
`GET https://api.supabase.com/v1/projects/{ref}/database/backups` (bearer personal access token; `ref` is 20 lowercase letters) returns
`V1BackupsResponse`: required `region`, `walg_enabled`, `pitr_enabled`, `backups[]` (`id`, `is_physical_backup`, `status` in
`COMPLETED|FAILED|PENDING|REMOVED|ARCHIVED|CANCELLED`, `inserted_at`) and `physical_backup_data` (`earliest_physical_backup_date_unix`,
`latest_physical_backup_date_unix`). `check-backup` validates every one of those fields and **fails closed** on a missing token, HTTP/network error, missing or
mistyped field, unknown status or unparseable timestamp. It accepts only (A) `pitr_enabled` **and** `walg_enabled` **and** a consistent physical-backup
window, or (B) a `COMPLETED` backup newer than 26 hours. A bare `pitr_enabled: true` is not enough. It runs in `preflight` (early failure) and again in
`apply` (evidence must be under 30 minutes old). Creating a restore point (`POST .../backups/restore-point`) is a change and is **not** performed.

**Remaining limitation:** the contract was verified against the published spec and a test double, not against a live call with your token (not available
here). Before relying on it, run once, read-only, with the preflight token: `python scripts/production_db_release.py check-backup --expected-project-ref
ovijutkvaaxohauvuxbj` and confirm it prints evidence (or a clear refusal).

**Dashboard checks you must perform (the approver confirms these in the approval comment):**
1. Project `ovijutkvaaxohauvuxbj` is on a plan that includes backups (Free projects have none). Settings → Billing / Add-ons.
2. Database → Backups: the **Scheduled backups** list shows a completed daily backup within the last 24 hours (note its timestamp).
3. Database → Backups → **Point in Time** (only present with the PITR add-on): PITR is enabled, and the restore window shows an earliest and latest recoverable
   time that covers "now" (note the retention days). Without PITR the daily backup is the only recovery point and the release loses up to a day of data on a restore.
4. Confirm who can restore (Database → Backups → restore to a new project) and that the project can afford the restore compute.
5. Record: backup timestamp, PITR window, and the `check-backup` output in the approval comment.

## 9. Safe first-release sequence (bootstrap)

The workflow only exists on the branch. `workflow_dispatch` workflows can be run only from the default branch (`main`), so it must be merged first; this is
safe because the schema gate protects the running API (section 6; `tests/database/test_production_db_release.py::DeploymentSemanticsTests` evaluates the real
`if:` conditions of `deploy-api`/`deploy-web` for every gate result × event and proves that without a passing gate nothing reaches SSM).

1. Review and merge the CI/CD pull request into `develop` (merge commit). Pull-request runs never deploy.
2. Merge `develop` into `main` (merge commit). The push run of *Education CI* then does: `changes` → `schema-gate` **fails closed** (secrets not yet configured, or
   migrations D–I pending) → `deploy-api` and `deploy-web` are **skipped** (their conditions require a successful gate). No SSM command runs; the healthy `a6d61ab`
   container is never stopped. The run is red; that is expected and means "blocked, nothing touched". GitHub may auto-create the `production-database-preflight`
   environment from the reference (without protection); that is harmless because it holds no secret yet.
3. Configure the two environments, secrets and branch protection (section 7). Do not push anything else to `main` meanwhile.
4. Dispatch *Production Database Release* (`scope=D-I`, `expected_main_sha=<head of main>`). `preflight` must be green; read the plan
   (6 pending versions in order, `status: ready`, `stageJ: excluded`).
5. The reviewers perform the dashboard checks of section 8 and approve `apply`. It applies D–I (one transaction) and runs the postflight verification.
6. `resume-deployment` dispatches *Education CI* (deploy); now the gate passes; approve `aws-demo`; expect "Deployment healthy" and `/api/v1/health` 200 on both hosts.
7. Smoke test as student and teacher. Final submit still answers 503 until Stage J.

## 9a. Future migrations (extensibility)

D–I is the **only** approved scope today. A later release is added by a reviewed change containing: the immutable migration SQL (merged first), the manifest entry
(contiguous order, SHA-256, `sourceCommit`), a new scope in `database/release-scopes.json` (`versions`, pinned `sha256`, `requiresApplied` = everything already in
production, `excludedVersions`, a **registered** `verifier`), that verifier module in `VERIFIERS`, the new name in the workflow's `scope` choice, and tests. `plan` then
requires: manifest == `requiresApplied + versions` exactly; each version's checksum equals the scope pin; pending == `versions` exactly (no partial or surprise
state); applied == `requiresApplied`; no `excludedVersions` anywhere (manifest, `database/migrations`, ledger). Consequences: Stage J (or any unlisted
migration) cannot ride along with D–I; D–I itself stops matching as soon as the manifest grows, so it cannot be replayed under a different meaning; an edited
migration or a re-pinned manifest alone cannot change what an approved scope applies. Review `database/release-scopes.json`, `scripts/production_db_release.py` and the
release workflow under CODEOWNERS. The deployment gate (section 6) requires **every** manifest migration to be applied, so a merged-but-unreleased migration blocks
the API deployment until its release is run.

## 9b. Safety-checker carve-out (what exactly is allowed)

`scripts/check_database_workflow_safety.py` keeps every earlier prohibition. The only exception is `.github/workflows/production-database-release.yml` calling
`production_db_release.py apply`, and only if all of these hold (each is tested with a failing variant): manual trigger only; apply job on `environment:
production-database-apply` (job-level key, comments do not count), `needs: [preflight]`, `if: needs.preflight.outputs.status == 'ready'` without `always()`; the
privileged secret appears only in that job; the invocation passes `--plan`, `--backup-evidence`, `--approval-reference` and the Production project ref; runs are
serialized; no `continue-on-error`, `contents: write`, `id-token`, `pull_request_target`, `workflow_run`; inputs only through `env`; the only workflow it may dispatch
is `backend-ci.yml`. Every **other** workflow may call only the read-only `compat` subcommand (script or module form, with or without line continuations), may not
read the privileged secret and may not reference or dispatch the release workflow.

## 10. Failure and recovery

| Failure | Result / action |
|---|---|
| preflight fails (drift, checksum, identity, scope, backup) | nothing was written; fix the cause; no approval is requested |
| apply rejects the plan (state changed) | nothing written; start a new release |
| migration SQL fails | single transaction: **nothing applied**, ledger unchanged; the job reports the rolled-back error |
| applied but postflight fails | the job fails and names the failing checks and the evidence; do **not** deploy; investigate read-only; fix forward (new migration) |
| API deploy blocked by the gate | the running API is untouched; run the database release first |
| API deploy fails after the gate | existing script rolls back to the previous image (health check retained) |
| data damage | approved Supabase PITR/backup restore into a new project; compare; cut over only with approval |

## 11. Stage J prerequisites (separate release, not automated here)

Maintenance window; D–I verified in Production; D03 audit table reviewed (uncertain grade decision recorded); backup/PITR re-verified; API scaled to zero
(old and new submit code must never overlap); then the staged SQL is moved into `database/migrations/`, registered (order 7) and released through the same
workflow with a new scope. Until then D–I **does not enable every D03 feature**: final submit and experiment creation answer 503 by design.

## 12. Post-release assertions

`scripts/verify_production_release_d_i.py --verify` (also run by `apply`): ledger rows D–I with manifest checksums, provenance `executed` and the pinned
`sourceCommit`; earlier rows preserved; Stage J absent; every D–I object (D column; E table, RLS, scope check; H `audio/mpeg`; F nullable column, index,
NULL-safe function; G trigger; I columns, defaults, unique index, release-origin check, files table with RLS and trigger, audit table with RLS); legacy
UNIQUE kept; zero policies; 17 row counts unchanged; every submission with a program has exactly one stage-1 audit row; only unambiguous submissions got an
`attempt_id`; no reconstructed rows; only previously evaluated quizzes released; capability probe (Stage 1 true, Stage 2 false).
