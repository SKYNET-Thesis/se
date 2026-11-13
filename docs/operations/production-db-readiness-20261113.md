# Production database readiness record — 2026-11-13

Branch `ci/production-db-logical-backup` (HEAD `e66e892`, **local only, nothing committed or pushed**; the work below is uncommitted in worktree `se-db-logical-backup`).
This file records evidence only. It authorizes nothing. Verdict: **BLOCKED — DO NOT DEPLOY** (see §6).

## 1. What "D0–D9" means in this repository

No document defines stages D0–D9. The repository's real vocabulary is the **migration letters D–I** (release scope `D-I`, six SQL migrations)
and **Stage J** (staged D03 Stage 2, excluded), see [production-release-d-i-runbook.md](production-release-d-i-runbook.md). This record uses those; no D0–D9 stages were invented.

## 2. Stage matrix

Legend per column: Impl = implemented in source; Tested = automated local tests on disposable PostgreSQL; Staging = validated on a staging DB (none exists); Applied / Prod-verified = state of Production.
Production state was **not queried** in this session (no Production access was used or requested); "No" for Applied means "no evidence it was applied" — the runbook's read-only preflight of 2026-11-12 recorded D–I absent.

| Stage | Purpose | Impl | Tested | Staging | Applied | Prod-verified | Blockers | Next action |
|---|---|---|---|---|---|---|---|---|
| D `20261110_d_activity_content` | `learning_activities.content` | Yes | Yes | n/a | No | No | release not approved | include in D-I release |
| E `20261110_e_learning_media` | `learning_media_assets` | Yes | Yes | n/a | No | No | same | same |
| F `20261111_f_global_question_scope` | nullable `learning_questions.organization_id`, guards | Yes | Yes | n/a | No | No | same | same |
| G `20261111_g_activity_progress_scope_guard` | progress scope trigger | Yes | Yes | n/a | No | No | same | same |
| H `20261112_h_learning_media_audio_mpeg` | MIME CHECK adds audio/mpeg | Yes | Yes | n/a | No | No | same | same |
| I `20261113_i_attempt_submission_foundation` | D03 Stage 1 (needed by `main` API) | Yes | Yes | n/a | No | No | same | same |
| Release orchestration (workflow, `production_db_release.py`, verifier, schema gate) | approval-gated single-transaction apply | Yes | Yes | n/a | not on `main` | No | PR/merge, GitHub environments, secrets, branch protection (runbook §7, §9) | PR review |
| Logical backup (`production_db_backup.py`, `backup` job) | Supabase Free recovery point + restore test | Yes (fixed this session) | Yes | n/a | No | No | AWS bucket/KMS/roles absent; reader role; GitHub variables | see §4 |
| Backup AWS infra (`infra/terraform/db-backup.tf`) | bucket, KMS, 2 OIDC roles | Yes (new) | `fmt`/`validate`/read-only `plan` | n/a | No | No | approved, targeted apply | see §5 |
| J `20261114_j_one_submission_per_attempt` (staged) | D03 Stage 2 | staged, unregistered | Yes (test DB) | n/a | No | No | separate release; maintenance window | out of scope |

Overall: D–I **PARTIAL** (code and local tests done; every Production step open). Backup **PARTIAL**. J **NOT STARTED for Production**.

## 3. Findings

1. **Reader role needs `BYPASSRLS`** (defect in earlier docs, fixed here). Documented role = `SELECT` only. Verified on PostgreSQL 17: such a role gets `pg_dump` aborted on RLS tables, `count(*)` returns 0, and `--enable-row-security` dumps zero rows silently. Production has 46 RLS tables, 0 policies. Added `reader_access_gaps` (schema USAGE, table/sequence SELECT, RLS visibility) to the backup `dump()` and an equivalent guard to the verifier `snapshot()` (otherwise a `managed`-mode snapshot would record zeros and the post-apply comparison would fail after commit). Tests added. Supabase support: see §10.
2. **No AWS backup infrastructure exists** (read-only: no bucket, no KMS alias, no backup roles; GitHub OIDC provider exists). Written as `db-backup.tf`.
3. **Terraform drift:** `terraform plan` (read-only, `-lock=false`, state `vista/demo/terraform.tfstate`) = 14 add / 11 change / 1 destroy: 13 `db_backup` creations plus **`aws_instance.api` replaced (counted as 1 add + 1 destroy)**; correction: an earlier note said "14 additions" (AMI `ami-01127915…`→`ami-04813686…`, user_data changed). A plain apply would replace the production API host. Plan used guessed bucket-name tfvars matching live bucket names; the replacement is independent of them.
4. PostgreSQL compatibility: backup requires `pg_dump` major == server major in Production (CI installs 17; Production 17.6) and a PG ≥ 17 restore target. Local client here is 18, so the production-mode check would refuse locally by design.
5. Retention: evidence `expiresAt` 90 days; lifecycle in `db-backup.tf` expires current objects at 90 days, noncurrent +7 (gone ≤ 97 days).
6. Failure alerting: only GitHub workflow failure notifications; no CloudWatch/SNS alarm exists for backup failure (not added: no reliable AWS-side signal for a GitHub job). Accepted gap; set GitHub notification routing.
7. Local skips: the 3 "skipped" tests of the earlier report are the CI Database Bootstrap tests; they need disposable `vista_test_*` databases plus `VISTA_DATABASE_PROJECT_REF`. Reproduced them as in CI: 0 skipped.
8. Not independently verifiable here: Production ledger/catalog state, the Supabase Management API contract (managed mode), restore of production-sized data, the real S3/KMS path (tests use a local directory double), GitHub environment/branch-protection settings.
9. The logical-backup branch is based on `develop`-line `e66e892`; this checkout (`se`, branch `feat/course1-learning-experience`) has a different manifest lineage (migrations A–E, drafts). Do not mix release tooling between them.

## 4. Backup and restore readiness

Design is as in [production-db-logical-backup.md](production-db-logical-backup.md): `pg_dump --format=custom --schema=public`, before/after consistency check, SHA-256, restore test on disposable PG17 (6 required checks), SSE-KMS + S3 SHA256 checksum, evidence bound to project/scope/plan/manifest/commits, apply re-verifies (≤ 12 h old). Remaining limits (not PITR; `public` schema only; roles/auth not captured) are documented there. Verified locally by tests only; **no real dump, upload or restore has been performed**.

## 5. Exact approval-gated actions (none performed)

| # | Action | Changes | Needs before | Verify after | Rollback |
|---|---|---|---|---|---|
| G1 | Review + merge PR(s) to `develop`, then `main` | repo only; the push to `main` makes the Education CI schema gate fail closed (deploy skipped) | committed work, review | gate run red-by-design, no SSM command | revert merge |
| G2 | `terraform apply -target` for the `db_backup` resources (14 adds), after re-running `plan` | new bucket, KMS key, 2 roles, policies | owner approval; plan reviewed | `aws s3api get-bucket-*`, role trust | `terraform destroy -target` (bucket must be empty; KMS key has a 30-day deletion window) |
| G3 | Create DB reader role (USAGE, SELECT, BYPASSRLS) on Production | one role | G2 not required; confirm Supabase allows BYPASSRLS first on a scratch project | `reader_access_gaps` = [] | `DROP ROLE` |
| G4 | GitHub: 2 environments, secrets, 6 variables, branch protection | settings | G2 outputs, G3 URL | dry preflight run | remove settings |
| G5 | Dispatch release `scope=D-I`, `backup_mode=logical` | preflight reads Production; backup job dumps (read-only) and uploads | G1–G4 | evidence.json, restore-test result | none needed (read-only) |
| G6 | Approve `apply` (≥ 2 reviewers) | applies D–I in one transaction | G5 green, human dashboard checks | postflight verifier 45/45 | single transaction ⇒ automatic; later: fix forward / restore |
| G7 | `resume-deployment` + `aws-demo` approval | API/Web deployment | G6 verified | health 200 both hosts | existing image rollback |

Downtime: D–I additive; brief ACCESS EXCLUSIVE locks; old API keeps running (runbook §3). Stage J is a separate maintenance-window release.

## 6. Verdict and blockers

**BLOCKED — DO NOT DEPLOY.** Blockers: backup AWS infrastructure not created (G2) and Terraform drift (finding 3); reader role (BYPASSRLS) not created or verified on Supabase; GitHub environments/secrets/branch protection not configured; the work is uncommitted and not reviewed/merged; no real S3/KMS or production-size restore test; Production state not re-verified today.

## 7. Test evidence (2026-11-13, this worktree, disposable `postgres:17` container on `127.0.0.1:55432`, no Production/AWS-write access)

| Command | Result |
|---|---|
| `python3 scripts/run_database_safety_tests.py` (no DB env) | ran 177, 1 error (missing `VISTA_DATABASE_PROJECT_REF`), 41 skipped — environment only |
| same, `VISTA_D03_MIGRATION_TEST_URL` only | ran 189, 0 failed, **3 skipped** (reproduces the historical 189/0/3) |
| same, with CI-equivalent bootstrapped DBs (`bootstrap_dev_database.py --confirm-local-bootstrap` + `--verify-only` on two databases) and `VISTA_DATABASE_PROJECT_REF`, `VISTA_RUNNER_TEST_DATABASE_URL`, `VISTA_BOOTSTRAP_VERIFY_DATABASE_URL`, `VISTA_D03_MIGRATION_TEST_URL` | **ran 191, 0 failed, 0 errors, 0 skipped** (189 + 2 new) |
| `validate_database_migration_manifest.py --release`, `check_database_workflow_safety.py .github/workflows` | passed |
| `terraform fmt -check -recursive`, `terraform validate` (scratch copy, `-backend=false`) | passed |
| `terraform plan -lock=false` (scratch copy, remote state read-only), full | 14 add / 11 change / 1 destroy (finding 3) |
| `infra/terraform/scripts/plan-db-backup.sh` (targeted, JSON-asserted) | **13 add, 0 change, 0 destroy**, no `aws_instance` |
| `python3 scripts/run_database_safety_tests.py` after the second round of changes (same env as the 191 run) | **ran 196, 0 failed, 0 errors, 0 skipped** (5 more tests: completeness) |

`actionlint` is not installed; workflow YAML was only parsed and checked by the repository's own safety checker.

## 8. Changed files (uncommitted)

Earlier session (found, not authored here): `.github/workflows/production-database-release.yml`, `scripts/production_db_backup.py`, `scripts/production_db_release.py`, `scripts/check_database_workflow_safety.py`, `tests/database/test_production_db_backup.py`, `tests/database/test_production_db_release.py`, `docs/operations/production-db-logical-backup.md`, `docs/operations/production-release-d-i-runbook.md`.
Round 2 additions: completeness guards in `scripts/production_db_backup.py` (`archive_content_problems`, `emptiness_problems`, required check `dump_not_empty`), 5 tests, `infra/terraform/scripts/plan-db-backup.sh` (new), reader-role/completeness sections in the backup doc, this §10–§13.
Round 1: `scripts/production_db_backup.py` (+`reader_access_gaps`, wired into `dump`), `scripts/verify_production_release_d_i.py` (snapshot RLS guard), `tests/database/test_production_db_backup.py` (+2 tests), `infra/terraform/db-backup.tf` (new), the two docs above (corrections), this file.

## 9. Last verified state / next safe step

Last verified: 2026-11-13, local only. Next safe step: review the uncommitted diff, then decide on commit/PR (needs the user). Then G2 with a `-target` plan for approval.

## 10. Reader role for RLS tables (round 2)

Exact SQL, evidence and fallbacks: [production-db-logical-backup.md#reader-role](production-db-logical-backup.md#reader-role). Summary: a dedicated `BYPASSRLS` login with `USAGE`/`SELECT` on `public` (plus default privileges for future tables) is the supported pattern (Supabase docs) and was reproduced on Supabase's own PG 17.11 image. Not supported/insufficient: `pg_read_all_data` alone (still RLS-blocked), `GRANT postgres TO role` (refused), SELECT-only (fails). RLS is never disabled and no application role is widened. **Uncertainty left:** the hosted Free project itself was not inspected; role not created (gate G3).

## 11. Worktree reconciliation (read-only; nothing merged, committed, reset or stashed)

| Checkout | Branch / HEAD | Dirty | Relevance |
|---|---|---|---|
| `se` (main checkout) | `feat/course1-learning-experience` `29fa71a` | 88 paths (41 tracked diffs +2638/−1137) | Course Builder/IoT work of other agents. DB-related: `database/*` (baseline, drafts, manifest A–E lineage), `docs/operations/*`, `infra/terraform/{compute,storage,variables}.tf`, `deploy-api.sh`, `backend-ci.yml`. **No path overlaps with the backup worktree.** |
| `se-db-logical-backup` | `ci/production-db-logical-backup` `e66e892` | 6 modified + 6 new | owner of this work: workflow, release/backup/verifier scripts, safety checker, 2 test files, 3 docs, `db-backup.tf`, `plan-db-backup.sh` |
| `se-d03-student-submission` | `feat/d03-student-submission` `4db53cd` (ancestor of the backup branch) | 2 untracked | `scripts/verify_production_release_d_i.py` is byte-identical to the committed copy at `e66e892` (stale duplicate); `docs/operations/production-release-d-i-runbook.md` is an older draft (181 diff lines; the committed/edited version supersedes it). Duplicate, not conflicting: do not copy either back. |
| `se-vista-aws-automation` | `codex/vista-aws-automation` | 28 | other agent's `infrastructure/` + many workflows incl. `backend-ci.yml`; different tree (`infrastructure/`, not `infra/terraform`); no overlap with the backup paths |
| `se-claude-b`, `se-so101-digital-twin` | other | 11 / 16 | no DB/infra paths |

Conflict risks to handle at integration time (not now): (a) the main checkout's `backend-ci.yml` change (deploy-api.sh shipped over SSM) and the backup branch's `schema-gate` job touch the same file; (b) `main` checkout's `compute.tf` (IoT IAM statements), `storage.tf` (media CORS incl. `http://localhost:5173`, POST) and `variables.tf` are **un-applied source changes** in the same Terraform root as `db-backup.tf`: any future full plan from that checkout adds them (and the CORS localhost origin deserves review); `db-backup.tf` itself only adds new files/variables with distinct names, so it merges textually; (c) manifest lineages differ (A–E vs D–I), so the migration tooling must come from the `develop` line only. Nothing is missing: all backup work is in the one worktree; all of it is uncommitted.

## 12. Terraform safety (read-only)

Full-root plan hazards (independent of backup): `data.aws_ami.al2023` is `most_recent = true` and `aws_instance.api` has `user_data_replace_on_change = true`, so a new AL2023 AMI (and any template change) forces **replacement of the API host**; plus 11 in-place changes (IAM policies, CloudFront, alarms, CORS, EIP). Recommendation (not applied): pin the AMI or add `lifecycle { ignore_changes = [ami] }` in a separate reviewed change (`compute.tf` is dirty in the main checkout; not touched here).

Targeted plan (`-target` on the 13 `db_backup` resources, `-lock=false`, throw-away copy, state object unchanged: last modified 2026-11-04, 125405 bytes): **13 to add, 0 to change, 0 to destroy**; the saved plan JSON contains no `aws_instance`; the only other nodes are 3 data-source reads and 1 no-op (the existing OIDC provider, a dependency of the trust policies). Side effects of `-target`: Terraform warns it is not a complete plan; dependencies are included automatically; resources outside the target set are not refreshed, so drift stays invisible, which is exactly why this path must be used instead of a full apply until the drift is resolved. The proposed names are unused (`vista-prod-db-backups-157098813811`, `alias/vista-prod-db-backups`, roles `vista-prod-db-backup-{writer,reader}`). Reproduce: `AWS_PROFILE=vista infra/terraform/scripts/plan-db-backup.sh vista-tfstate-157098813811-sg <tfvars>`; the script fails on anything but creations.

Apply-time note: `terraform apply` of a saved targeted plan fails if state changed since the plan (good); re-plan immediately before approval.

## 13. D–I release readiness (local audit)

* Sequence (manifest orders 1–6, pinned SHA-256 = files, validated with `--release`): D → E → F → G → H → I, one transaction; `requiresApplied` empty, `excludedVersions` = J. Dependencies E→H, B-objects→F, `learning_activity_progress`→G as in the runbook §1.
* Safety: no `DROP TABLE/COLUMN`, `TRUNCATE` or `DELETE FROM`; no `CONCURRENTLY`/`VACUUM`; `BEGIN` hits are plpgsql bodies and the runner rejects real transaction control; only data change is I's bounded backfill `UPDATE` (audited, ≤ 8 rows per runbook). Backward compatible with the deployed API per the runbook rehearsal (reported, 66 integration tests; not rerun here).
* Rollback: single transaction ⇒ failure leaves nothing; after commit fix forward; data damage ⇒ restore from the logical backup (recovery point = dump time, not PITR).
* Backup prerequisites: logical mode (code + 62 backup tests green locally) needs G2 (AWS), G3 (reader role), G4 (GitHub); nothing exists in AWS/GitHub today.
* Schema drift detection: preflight classifies ledger/catalog against the pinned baseline and the `planHash` is recomputed at apply; only exercised on disposable databases.
* **Local-only validated:** manifest, checksums, workflow safety, 196 tests, restore into disposable PG17, Terraform plan shape. **Needs Production approval:** reading the live ledger/catalog (preflight), role creation, real dump/upload/restore, apply, deploy.

Verdict unchanged: **BLOCKED — DO NOT DEPLOY** (G1–G4 not done; hosted-Supabase `BYPASSRLS` unconfirmed; no real S3/KMS or production-size restore).

## 14. Handoff (work paused 2026-11-13)

Location: worktree `/home/quangduc/Code/vista/se-db-logical-backup`, branch `ci/production-db-logical-backup`, HEAD `e66e892` (= `origin/develop`, 0 ahead / 0 behind). The work is committed on this branch and pushed to `origin/ci/production-db-logical-backup` (no PR, nothing merged; 6 modified, 6 new files, listed in §8). Earlier sections written before the commit that say "uncommitted" describe the state at that time.

| Item | State |
|---|---|
| Migrations D–I | locally verified (manifest, checksums, disposable-DB rehearsal); **not applied to Production**; Stage J excluded |
| Database safety tests | 196 passed, 0 failed, 0 skipped (CI-equivalent disposable PG17 environment, §7) |
| Backup infrastructure (`infra/terraform/db-backup.tf`) | 13 resources planned (targeted, read-only: 13 add / 0 change / 0 destroy); **not provisioned** |
| Supabase `BYPASSRLS` reader role | verified locally on Supabase's PG 17.11 image; **hosted project unverified**; role not created |
| Production | **BLOCKED — no deployment authorized** |

**Defect found at pause, since FIXED (skip guard added; no-database mode 196 run / 0 errors / 56 skipped, database mode 196 passed / 0 skipped):** `tests/database/test_production_db_backup.py::BackupFlowTests` has no `skipUnless(URL)`. Without `VISTA_D03_MIGRATION_TEST_URL`, `python -m unittest discover -s tests/database` (the no-database command in `.github/workflows/database-migration-safety.yml`) ran 181 tests with 1 error (`setUpClass` RuntimeError) and 41 skipped, so that CI job would go red. Fix before any PR: add the same `skipUnless` decorator the release tests use. The §7 figure of 196 passed applies only with the database environment set.

Other pre-commit notes: `CLAUDE.md` in `se` is git-excluded (never committed; this file is the tracked record); several statements in this file say "uncommitted" and must be refreshed on commit; the main checkout's dirty `backend-ci.yml` (deploy-api.sh over SSM) will conflict with develop's `schema-gate` when course1 merges develop.

Next approval gates (none performed): 1) commit/PR/merge to `develop`; 2) targeted `terraform apply` of the 13 resources after a fresh `plan-db-backup.sh`; 3) read-only role-attribute check on hosted Supabase, then create the reader role; 4) GitHub environments, secrets, variables, branch protection; 5) dispatch release `scope=D-I`, `backup_mode=logical`; 6) reviewer approval of `apply`; 7) API/Web deployment. Next safe action: the user reviews the diff and decides on committing.

## 15. Pooler identity and role separation (code-only change, uncommitted)

Found by the hosted-Supabase inspection: every identity check accepted a pooler user only if it was literally `postgres.<ref>`, so a dedicated reader (`<role>.<ref>`) was rejected, and direct hosts are IPv6-only. Fix: `scripts/supabase_identity.py` (single source of truth) used by `sql_migration_runner.py`, `production_db_release.py`, `production_db_backup.py` and `verify_production_release_d_i.py`; operation `read` accepts only `vista_backup_reader`, `apply` only `postgres`, exact project reference, two host shapes, no input echoed in errors. Tests: `tests/database/test_supabase_identity.py` (28) plus the adjusted backup identity test. Not applied anywhere; the reader role and the secret switch are still open approval gates.

Round 2 of the same change: the shared `READER_ACCESS_SQL` / `reader_access_gaps(info, strict=True)` (in `supabase_identity.py`) is now run server-side by `plan`, `snapshot`, `compat` and the backup (`dump`), and `apply` confirms `current_user = postgres`; tests: server-side evaluator (pure), mocked-server release entry points, and real PostgreSQL with a role named `vista_backup_reader` (write grant, CREATE, NOBYPASSRLS, SUPERUSER each detected). Schema gate compatibility: it runs `compat` with the read-only secret, needs only `psql` and SELECT on the ledger, which the strict check verifies; until `PRODUCTION_DATABASE_READONLY_URL` is switched to the reader the gate stays red (fail closed), as it already is while D-I is pending.
