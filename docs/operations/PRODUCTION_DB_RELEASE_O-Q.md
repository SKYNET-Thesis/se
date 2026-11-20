# Production Database Release — scope `O-Q` (prepared 2026-11-20; NOT executed)

Purpose: unblock the Production Schema Gate (`migrations not applied to the database: 20261119_o…, 20261119_p…`) for the Full LMS deployment **without** shipping an API that breaks on a missing column.

## 1. Findings (read-only; no Production credential was used from the workstation)

| Question | Finding |
|---|---|
| Production DB target | Supabase project ref `ovijutkvaaxohauvuxbj` (hard-coded in `.github/workflows/production-database-release.yml`; the credentials live only in the GitHub Environments `production-database-preflight` (read-only) and `production-database-apply` (reviewer-gated)). |
| Last Production release | Run `44449890940` (2026-11-19, scope `N`): ledger applied `20261118_n_student_password_change_required`, postflight **39 passed / 0 failed**, backup mode `logical` (logical `pg_dump` + restore test passed; `pitrEnabled=false`, Supabase Free). |
| Main at diagnosis | `0f27a35a86f7b5a4ef4f87d8592cb3df0c39137b`; manifest orders 1–12 = D…N, O, P. Blocked deploy run `44750648816`: schema gate failed on **O and P only** (the running API was not touched). |
| Are only O/P missing? | **No.** The API on main also reads `learning_media_assets.archived_at` (media library list, student media URLs, archive/restore, draft-attachment guard, publish readiness, `/health/ready`). That migration (**Q**) was staged, not in the manifest and not in any scope, so the schema gate could not see it. Releasing O–P alone would have passed the gate and then broken media endpoints. |
| M (revoke PUBLIC TEMP) | **Not required.** No code depends on it. Stays BLOCKED (hosted platform-role validation). |
| R (device provisioning) | **Not required.** Feature-flagged off (`DEVICE_PROVISIONING_ENABLED` unset ⇒ every device route is 404 and no table is touched). Stays staged. |
| Live Production schema / ledger / privileges / RLS | **Not read by me** (no Production credentials on the workstation, and the preflight job only runs from `main`). They are verified by the workflow's read-only `plan` + `snapshot` + backup jobs, which fail closed on any drift (pinned catalog counts 91/49/48/22/15, ledger digest, data preview). |

## 2. Repository fix in this branch (`release/db-scope-o-q`)

* Migration Q promoted from `database/staged-migrations/` to `database/migrations/20261120_q_media_archive.sql` (runner-transactional: no `BEGIN/COMMIT`), manifest order 13, `sourceCommit` pinned to the commit that contains it.
* Release scope `O-P` replaced by **`O-Q`** (versions O, P, Q; same prerequisites D–L + N; catalog counts unchanged because Q adds columns/CHECK/index only). Verifier extended with Q checks (3 columns, CHECK, partial index, nothing archived, media row count and content digest); registry key `oq`; workflow option `O-Q`. Single release ⇒ no window in which the gate passes before Q exists.
* Bootstrap now requires Q objects; pinned dev schema expectation regenerated; CI no longer applies Q as a staged file; M/R remain staged.
* Test fix: the migration-H replay test hard-coded "5 CHECK constraints on learning_media_assets"; it now asserts that the replay does not change the count (Q adds one).
* `docs/operations/sql/q-rollback.sql` (refuses while any file is archived).

## 3. Rehearsal (disposable PostgreSQL 17, same orchestrator and sequence as Production)

1. Bootstrap at ledger state **N** (3 courses, 3 media rows, a user seeded).
2. `production_db_release.py plan --scope O-Q` → `ready`, pending exactly O, P, Q.
3. `snapshot` → `apply` (managed-backup evidence stub, local only) → **postflight 60 passed / 0 failed**.
4. `compat` (the schema gate) → `compatible`; re-`plan` → `nothing_to_do`; data intact (3/3 rows, nothing archived); ledger 13 rows; runtime role can UPDATE the new column.
5. Q re-applied (idempotent); CHECK fires on bad input; documented rollback SQL executes.
6. CI-equivalent database safety suite with all DB env set: **374 run, 0 failures, 0 skipped**; staged M/R tests 4/4; workflow safety check passes.
Not rehearsed: a restore of the real Production backup (the workflow's `backup` job does a logical dump + restore test automatically before approval).

## 4. Required vs optional migrations

| Migration | Needed by this deployment | Where |
|---|---|---|
| O, P, Q | **Required** | scope `O-Q` |
| M | No | staged, BLOCKED |
| R | No (flag off) | staged, apply only before enabling devices |

## 5. Exact invocation (after the PR below is approved and merged to `main`)

1. Merge `release/db-scope-o-q` to `main` through a PR (the workflow requires a merged PR head).
2. GitHub → Actions → **Production Database Release** → Run workflow on branch `main` with: `scope = O-Q`, `backup_mode = logical` (same as the 2026-11-19 run), `expected_main_sha = <full 40-char SHA of main after the merge>`.
3. `preflight` (read-only) must end `status=ready`; `backup` (logical dump → disposable restore test → encrypted bucket evidence) must succeed.
4. The `production-database-apply` reviewer approves only if the plan lists exactly the three pending versions O, P, Q.
5. `apply` runs the pinned scope, the postflight verifier (expected ≥ 60 checks, 0 failed) and uploads evidence; `resume-deployment` then dispatches Education CI (deploy): it re-runs the schema gate and still requires the `aws-demo` reviewers. Nothing is deployed directly by the DB workflow.

## 6. Risks and rollback

* Operations are additive: 8 columns (constant defaults: metadata-only), 3 reference rows, 1 role grant, 3 nullable columns, 2 CHECKs, 1 partial index. Brief ACCESS EXCLUSIVE locks on `learning_courses`, `learning_assignments`, `learning_classrooms`, `learning_media_assets`. No backfill, no RLS/grant/policy change.
* The single transaction per migration rolls back on failure (ledger row included); the runner never applies a scope whose preflight drifted.
* Rollback: previous API image keeps working (it ignores the columns). SQL rollbacks: `docs/operations/sql/o-p-rollback.sql` (refuses while the new data is in use) and `docs/operations/sql/q-rollback.sql` (refuses while files are archived), only with separate approval; ledger rows are never edited manually.
* Residual: the live Production catalog has not been inspected by me; the workflow's preflight is the authority and stops on any mismatch.

## 7. GO / NO-GO

**GO to merge the PR and to run the workflow (preflight → backup are read-only for the schema).** **NO-GO** for applying anything until a human reviewer approves the apply step with the plan above. Do not run the existing `O-P` option on main today: it would release O and P without Q.
