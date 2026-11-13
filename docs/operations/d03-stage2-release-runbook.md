# D03 Stage 2 (migration J) Production release runbook

Status: **prepared for review; nothing here has been run against Production.** It grants no authorization: every step marked **[APPROVAL]**
needs the owner's explicit approval at that moment. Approved decision: legacy-grade **policy A** (unambiguous grades stay visible, uncertain
grades are held until a teacher releases them). Evidence behind the starting state: [d03-stage2-release-readiness.md](d03-stage2-release-readiness.md).

## 1. What this release is

`database/migrations/20261114_j_one_submission_per_attempt.sql` (SHA-256 `52d3c214…ba68`, manifest order 7) through the existing approval-gated
`Production Database Release` workflow with **scope `J`**. It: requires Stage 1; re-runs the conservative `attempt_id` backfill; drops the legacy
`UNIQUE (assignment_id, learner_user_id)` and adds a plain lookup index; applies policy A to the attempts' release state; reconstructs submissions of
earlier finalized attempts **only** when their snapshots match exactly one stored program version; installs the guard trigger (new submissions bound
to their own attempt, finalized submissions immutable). It never deletes or rewrites a submission, assessment, score, feedback, reflection, experiment or evaluation.

Properties verified by `tests/database/test_production_db_release.py` on PostgreSQL 17 (Stage 1 -> Stage 2 through the real tooling):
single transaction (a failure at the very end leaves Stage 1 and the ledger untouched); not re-runnable (the ledger refuses a second apply and the
spent plan cannot be replayed); history, grading and evidence tables are byte-identical afterwards (content digests); only reconstructed rows are added.

## 2. What the tooling enforces for scope `J` (no bypass)

| Gate | Where | Fails closed when |
| --- | --- | --- |
| Reviewed scope only | `database/release-scopes.json` + workflow `scope` choice (`D-I`, `J`) | scope not defined, verifier unregistered, SHA-256 pin differs from the manifest or the bytes |
| Manifest activation | `production_db_release.py plan` | manifest is not exactly D-I + J (so J is unusable before the activation change is on `main`, and D-I is unusable after it) |
| Ledger | runner `_classify` + scope `requiresApplied` | D-I not applied with the manifest checksums and provenance `executed`; pending set is not exactly `[J]` |
| Strict schema fingerprint (before) | scope `expectedCatalogBefore` | live catalog counts differ from `tables 91, rls_enabled 49, policies 0, triggers 21, functions 14` |
| Data preview, hash-bound | `verify_production_release_j.preview` in the plan | graded legacy submissions without an attempt exist (`maxGradedWithoutAttempt: 0`); any data change between plan and apply changes the plan hash |
| Backup before apply | preflight/backup/apply jobs | no fresh recovery point bound to this plan hash (logical dump + passed restore test, or managed backup/PITR; evidence < 30 min old at apply) |
| Approval | environment `production-database-apply` required reviewers | not approved: the job cannot read the privileged credential |
| Postflight | `verify_production_release_j.verify` (runs inside `apply`) | any of: J ledger row/checksum/provenance/sourceCommit, D-I rows intact, catalog counts after (`triggers 22, functions 15`), UNIQUE gone + lookup index + enabled guard, row counts, content digests of grading/evidence/original submissions, reconstructed rows audited and ungraded, policy A invariants, capability probe `true/true` |
| Bootstrap fingerprint | `database/baselines/dev-schema-expectation.json` (`ef3d41b7…5170`, reproduced on two independent fresh PostgreSQL 17 bootstraps) | CI `Database Bootstrap` schema drift |

## 3. Impact on the Education CI `schema-gate` (answer to "will deployments be blocked?")

* `schema-gate` runs `production_db_release.py compat`: **every manifest migration must be in the Production ledger with the same checksum**. With J registered
  and not yet applied, the gate **fails**; `deploy-api` and `deploy-web` need it, so they are **skipped before any SSM command**. The running container is never stopped.
  Verified by `test_schema_gate_blocks_deployments_until_j_is_applied_and_then_passes` (blocked naming J, passes after J).
* When does the gate run? `changes` marks API/Web only when the push diff touches `services/education-api/`, `packages/contracts/` or `web/robot-edu/` (and every
  `workflow_dispatch` deploy is always API+Web). A `develop` -> `main` merge push diffs the whole merge, so **any other API/Web change travelling with it makes the gate
  run and fail** until J is applied. The activation change itself touches only `database/`, `scripts/`, `.github/`, `tests/`, `docs/`: alone it deploys nothing and blocks nothing.
* Not gated: `rollback`. Do **not** roll the API back to a pre-D03 image after J is applied (its submit path fails by design).
* Consequence for ordering: merge the activation to `main` only when you intend to run the release the same day, and hold other API/Web releases until J is applied.
  After J is applied, the release workflow's `resume-deployment` dispatches `Education CI` (still behind `aws-demo` approval) and the gate passes.

## 4. Safe release order

0. **Review and merge (no Production effect):** Phase A (tooling, tests; J still unregistered) into `develop`; then Phase B (manifest activation, CI fixtures, docs) into `develop`.
   CI must be green: `Database Migration Safety`, `Database Bootstrap`, `Education CI`.
1. **Read-only audit [APPROVAL for the read]:** with the reader credential run `python scripts/verify_production_release_j.py --preview` (prints counts only), or read `dataPreview` in the
   preflight plan artifact. Required: `graded_without_attempt = 0`. Record `graded_with_attempt`, `audit_by_stage_class` (`stage1:*`), `uncertain_audit_rows`,
   `attempts_finalized_without_submission` (the rows Stage 2 may reconstruct) and `legacy_unique_present = true`, `guard_trigger_present = false`.
   If `graded_without_attempt > 0` stop: those grades would stay hidden and a teacher cannot release them; decide their handling first (reviewed scope change).
2. **Confirm the running API is the D03 build** (the latest successful `deploy-api` is at or after `99a1b1b` and no rollback to an older image was run since). Stage 2 must never meet the pre-D03 API.
3. **Promote `develop` -> `main` [APPROVAL]** (hold unrelated API/Web changes; see section 3). Expect `Education CI` on that push: gate skipped or failing closed, nothing deployed.
4. **Dispatch `Production Database Release`** on `main` [APPROVAL]: scope `J`, `backup_mode=logical` (Free plan), `expected_main_sha` = the head of `main`.
   `preflight` must report plan `status: ready` with `dataPreview` and `catalog` as recorded in step 1; `backup` must finish with `restoreTestPassed: true`.
5. **Reviewers approve `production-database-apply`** [APPROVAL] (not the dispatcher). The job re-verifies backup evidence, recomputes the plan against the live database (any difference refuses),
   applies J in one transaction, and runs the J postflight. Expected: `postflight.failed = []`. Final submit and runs start working within 30 s (the API re-probes the schema), no restart needed.
6. **Deployment resumes** through `Education CI` (gate now passes; `aws-demo` approval as usual) if other API/Web changes were held.
7. **Smoke / E2E:** run section 6 of [d03-stage2-release-readiness.md](d03-stage2-release-readiness.md) with test accounts (start attempt, save, run, submit once, second attempt, teacher grade and release, student view).
8. **Audit review with the teacher:** `stage2` audit rows `reconstructed`, `reconstruction_skipped`, `legacy_grading_released`, `legacy_grading_withheld_uncertain` (the held grades need an instructor decision, then Release).

## 5. Stop conditions and recovery

* Any preflight/backup/approval/plan-hash refusal: nothing was applied; fix the cause and start a new run.
* The migration fails: the single transaction rolls back; the database stays at Stage 1 and the API keeps answering 503 for submit/run. Fix forward; do not edit the file after it was registered (add a new reviewed change).
* Applied but postflight failed (`APPLIED, BUT POSTFLIGHT VERIFICATION FAILED`): treat as incident. Do not roll back the schema; keep the evidence JSON; fix forward on the API or with an approved, reviewed one-off statement.
* There is **no automatic rollback** (once two submissions exist for one assignment the legacy UNIQUE cannot be recreated without deleting rows). Restore from the logical backup only with explicit approval, accepting the loss of work since.
* A wrongly reconstructed submission is identifiable (`origin = 'reconstructed'` + audit row); removal needs an approved one-off statement.

## 6. Open items before approval

1. Production audit status is unread (needs the reader credential: `PRODUCTION_DATABASE_READONLY_URL`, role `vista_backup_reader`, `SELECT` + `BYPASSRLS`, session pooler). Step 1 above produces it without exposing identifiers.
2. Confirm in step 2 that the deployed API is still the D03 build.
3. Owner approvals for steps 3-5, and the browser E2E (section 6 of the readiness document) after the release.
