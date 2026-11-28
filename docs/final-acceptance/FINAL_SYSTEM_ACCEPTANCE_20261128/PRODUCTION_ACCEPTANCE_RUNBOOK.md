# Production acceptance runbook (to run only after owner approval; nothing here was executed)

Applies to **Option A** (PR #266) and, afterwards and separately, **Option B** (Migration T + #272). Reuses, does not replace: `../PRODUCTION_TEST_PLAN.md` (principles, execution order, accounts), `../PRODUCTION_TEST_CASE_MATRIX.md` (44 cases), `../PRODUCTION_TEST_DATA_MANIFEST.md` (synthetic data; **requires the phrase "approved: Production test content"**). Every status is recorded with the deployed revision and "Production" as environment. Local PASS is not Production PASS; mock PASS is not physical PASS.

## 0. Owner-gated steps (stop and ask at each)
| Step | Actor | Gate |
|---|---|---|
| 0.1 Review and merge #266 (0 reviews so far) | owner | B2 |
| 0.2 Dispatch Auto Deploy; confirm `schema-gate` read-only PASS | owner/CI | — |
| 0.3 Approve `deploy-api` (also builds/deploys the Twin image `twin-<sha>`) | owner | B2 |
| 0.4 Approve `deploy-web` | owner | B2 |
| 0.5 `terraform plan` with the five live variables, compare with the revalidated plan (0/1/0, only `aws_iam_role_policy.ec2`), then approve `terraform apply` of that exact plan | owner | B4 |
| 0.6 Approve Production test content | owner | B7 |

## 1. Entry criteria (verify before any test)
1. `GET /api/v1/version` and `/version.json` return the merged `main` SHA (today both: `430ad59…`).
2. Twin container image tag = `twin-<same SHA>` (needs SSM read; not verified this cycle).
3. `education-api`, `iot-feedback-worker`, `recordings-worker`, `digital-twin` healthy; feedback/recordings queues and DLQs = 0 (all 0 on 2026-11-28).
4. Live role policy contains `ExperimentEvidenceObjectAccess` (absent today — **this is what makes D-03/D-08 fail**).
5. For WF-03: Edge in the declared mode only (`MOCK_RUNTIME`, `hardwareEnabled=false`, `fake_follower`); Shadow `connected`, age < 15 s. **No physical hardware in this runbook.**

## 2. Execution order
AUTH → SA → SCHOOL → INST → STU → LMS/QUIZ/ASSIGN → ROBOT/LAB → WF01 → WF02 → WF03 → WF04 → SEC → (IOT/SAFE only under Codex supervision, Gates H/I).

## 3. Cases that close the open Production failures
| ID | Case | Pass criterion (evidence required) | Closes |
|---|---|---|---|
| W3.1 | Student starts a WF-03 simulation run, polls `GET /me/physical-executions/:id` until terminal | **HTTP 200** every poll, never 500; terminal `succeeded` with `physical:false` | D-08 |
| W3.2 | Evidence after success | experiment artifact row **and** the object `learning-media/experiments/<…>` readable in S3 (`aws s3api head-object`, size > 0, matching sha256 from the row) — a row alone is not evidence | D-03 |
| W3.3 | Evidence retrieval | owner student and instructor download succeeds; peer student and foreign-school instructor get 403/404 | D-03 |
| W3.4 | Retry safety | repeat the status call: still one artifact, same key | D-03 |
| W3.5 | Twin viewer during the run | browser frames carry the robot UUID, controller and a monotonically increasing sequence; **no `so101-mock` / `offline-fixture`** (compare the browser stream with the R1-relayed frame) | D-09 |
| W3.6 | ACK ordering (only if D-04 fix `54b876d` is released) | `iot_ack_acknowledged` appears **exactly once** in the run's events over several runs | D-04 |
| W4.1 | Release gate | partial rubric → release refused (`409 RUBRIC_INCOMPLETE`); complete rubric → release; explicit zero counts | D-06 |
| W4.2 | Result consistency | student result, instructor view, assignment list and Gradebook show the same awarded/max/%/rating; `attempt.score` untouched | D-15 |
| W1.1 | Allocation and Lab Session | allocate, start, end; the Lab Session lifecycle row sequence is complete; D-11 behaviour recorded as observed | WF-01 |
| SEC.* | negative matrix | unauthenticated 401, wrong role 403, other school 403/404, per `PRODUCTION_TEST_CASE_MATRIX.md` SEC section | Gate C |

Option B only (after Migration T is released): create one assignment from each of the four templates, verify descriptors, level selector, weights and the 31/36 = 86.11 % = 8.61/10 example end to end, release lock, and that pre-T grades render unchanged.

## 3a. Account provisioning cases (WF-01 refinement; Production only after owner authorization of migration U, the flag, SMTP/redirect configuration and test mailboxes)
Entry criteria: migration U applied and verified; `STAFF_TEMP_PASSWORD_ENABLED=true`; Supabase SMTP provider confirmed; Site URL and redirect allow-list = Production origin only; `SUPABASE_INVITE_REDIRECT_URL` set. Use disposable synthetic accounts in the E2E organization with mailboxes the owner controls. **Do not touch real invited users without explicit approval.**
| ID | Case | Pass criterion |
|---|---|---|
| ACCT-01…13 | direct creation and first-login change (System Admin → School Admin → Instructor/Student) | as in `AUTH_PROVISIONING_ACCEPTANCE.md`, on the Production URL; temporary credentials never visible in logs |
| ACCT-14…17 | invitation by real e-mail for School Admin, Instructor, Student | e-mail delivered; link opens the **Production** URL (never localhost); user sets Password + Confirm; account becomes Active; correct dashboard |
| ACCT-18 | recover one verified pending account | `recover-pending` keeps the Auth user id; or a re-sent invitation after the redirect fix — owner chooses per account |
| ACCT-21 | expired and reused invitation | clear message, no activation, no duplicate account |
| ACCT-22/23 | forgot-password e-mail and reset | delivered; reset on the Production URL; link single-use |
| ACCT-24 | direct creation with SMTP disabled or rate-limited | still succeeds |

## 4. Stop conditions
Any 5xx on a path that returned 200 locally; any cross-tenant data; any `PHYSICAL_ROBOT` label without hardware; any write outside the E2E organization (`E2ES01`/owner-reserved accounts untouched); a queue or DLQ above 0. Stop, record FAIL with evidence, do not retry destructively.

## 5. Cleanup
End every Lab Session, release reservations, leave synthetic data in the E2E organization, record revisions, update `FINAL_DEFECT_REGISTER.md`.

## 6. Rollback
Option A: redeploy the previous API image via the rollback dispatch (no migration in this release; rollback-guard refuses only pre-migration-S images); previous web bundle; remove the IAM statement (additive). Option B: roll the API back first, then drop the two nullable columns only if required (SQL header in the migration).
