# Final owner package — everything that still needs you, in execution order

Release candidate (`develop`): **`b79067f5215320561c559ed301e8a3075e8bcd10`**. Release PR: **#266 `develop → main`** — https://github.com/SKYNET-Thesis/se/pull/266 . Production today: `main` `430ad594d8fc1087d16870104d5eb037b4fca864` (API, Web), database ledger D…S applied, pending scope `T-U`.
Everything independently actionable is finished and merged; the final regression on the RC is in `04_FINAL_REGRESSION_RC.md`. **Nothing was changed in Production, AWS, Supabase or Terraform state.** The other documents in this folder hold the exact values: `01` Supabase/SMTP, `02` database + deployment sequence, `03` Production acceptance plan, `05` PR/defect ledger.

## Part 1 — what only you can do (GitHub / Supabase UI), in this order
| # | Where | Exact action | Inputs |
|---|---|---|---|
| **1** | Supabase dashboard (project `ovijutkvaaxohauvuxbj`) → Authentication | Configure URL list, custom SMTP, templates, rate limit, sign-up OFF, min password length 12. May be done at any time **before step 9** | exact values: `01_SUPABASE_AND_SMTP_CONFIGURATION.md` §A–D (Site URL `https://skynex.best`; redirect allow-list `https://skynex.best/accept-invitation`, `…/reset-password`, `…/login`; SMTP provider you own — Gmail needs 2-Step Verification + a 16-character App Password) |
| **2** | https://github.com/SKYNET-Thesis/se/pull/266 | **Merge pull request** (merge commit). `main` requires 5 green checks and no review; they are green | — |
| 3 | https://github.com/SKYNET-Thesis/se/actions/workflows/auto-deploy.yml | *Nothing to click.* Education CI runs on `main`, Auto Deploy dispatches a deploy; its `schema-gate` **fails by design** (migrations T and U not applied yet). This red run is expected and changes nothing | — |
| **4** | https://github.com/SKYNET-Thesis/se/actions/workflows/production-database-release.yml → **Run workflow** | Workflow **Production Database Release**, branch **`main`** | `scope` = **`T-U`** · `backup_mode` = **`logical`** · `expected_main_sha` = the full 40-character SHA of the new `main` head (shown on the PR after merge) |
| **5** | the running *Production Database Release* → job `apply` → **Review deployments** | tick environment **`production-database-apply`** → **Approve and deploy** (reviewer account `leduc121`). Only after `preflight` printed `status: ready` and `backup` is green | — |
| 6 | automatic | the verified release dispatches *Education CI* `action=deploy`; `schema-gate` now passes and the run waits at `deploy-api` | — |
| **7** | *(Part 2, item B-1 first)* the *Education CI* deploy run → job **`deploy-api`** → **Review deployments** | tick **`aws-demo`** → **Approve and deploy** (also builds and deploys the Twin image `twin-<sha>`) | **do this only after I report the two secret keys are set** |
| **8** | same run → job **`deploy-web`** | tick **`aws-demo`** → **Approve and deploy** | — |
| 9 | (verification, mine) | after 8: version endpoints, health, ledger, queues; then IAM apply and acceptance | — |

If any step shows a failure: stop, do not retry destructively; send me the run link.

## Part 2 — approvals to give me in one reply (I then proceed without further questions)
Reply with the single line **`approved: B-1 B-2 B-3 B-4 B-5`** (or strike any item you do not approve):

| Id | I will do | Exact scope |
|---|---|---|
| **B-1** | **Production secret edit** (AWS Secrets Manager `vista/demo/education-api/env`), performed **after step 5 and before step 7** | add `SUPABASE_INVITE_REDIRECT_URL=https://skynex.best/accept-invitation` and `STAFF_TEMP_PASSWORD_ENABLED=true`; no other key; values never printed (command in `01_…` §E) |
| **B-2** | **Terraform apply, IAM only**, after step 8 | re-plan with the five live variables; apply **only** a plan that is exactly `0 to add, 1 to change, 0 to destroy` changing `aws_iam_role_policy.ec2` (adds `ExperimentEvidenceObjectAccess` on `learning-media/experiments/*`); revalidated on the RC today. Anything else in the plan = I stop |
| **B-3** | **Production test content** (`approved: Production test content`) | the synthetic E2E data of `PRODUCTION_TEST_DATA_MANIFEST.md` in the E2E organization only; owner-reserved accounts untouched |
| **B-4** | **Production acceptance run** (`03_PRODUCTION_ACCEPTANCE_PLAN.md`) incl. real invitation/recovery e-mails to mailboxes **you name in the reply** (give me 2 test addresses you control, e.g. one for a School Admin, one for an Instructor) | all four roles, WF-01…WF-04, ACCT-01…30, D-03/D-04/D-08/D-09 closure cases |
| **B-5** | **Recovery of the real, previously invited accounts** | list the e-mails and, per account, choose: **(a)** `recover-pending` (temporary credentials shown once to you; same Auth user, profile and membership kept), or **(b)** I send a fresh invitation after step 1 (they set their own password on the new page). I never overwrite an account that has signed in |

## Part 3 — decisions (recommendation applied if you do not answer; none blocks the release)
| Id | Decision | Recommendation |
|---|---|---|
| D-11 | legacy `PUT …/robot-allocation` adds a second robot (409 on the same robot) | keep "add", deprecate `PUT` — no code change |
| C11 | Production CSP is report-only | enforce after one review of reports — separate change, not part of this release |
| Stale PRs | #224, #183, #172, #162, #153 are 157–443 commits behind and not qualified | close them (they are yours to close) |
| Physical | Gates H and I (SO-101 commissioning, physical WF-03) | remain with Codex; **not** part of the Web release |

## What "freeze the Web release" means here
After step 9 and Part 2 B-4 I record the deployed SHA, the ledger, the IAM state and every case result in `FINAL_DEFECT_REGISTER.md` and `FINAL_FREEZE_GATE.md`. The Web Production release is frozen when every case is PASS (or an owner-accepted NOT RUN with reason) and no Critical/High defect is open. Gates H and I stay open and are reported separately.
