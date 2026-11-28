# Security and data-integrity acceptance (2026-11-28)

Revision `develop` `eceb8d1` (local isolated) plus **read-only** inspection of Production (`430ad59`, AWS account `157098813811`, `ap-southeast-1`). Nothing in AWS was modified; Terraform was only planned (`-lock=false`), never applied; no Production data was read or written. As this cycle used an administrator-level AWS identity for read-only calls, **no write call was made**.

## A. Authentication, authorization, isolation
| Control | Evidence | Status |
|---|---|---|
| Login/logout, session restoration, expiry | `platform-resilience` 6/6 (logout ends the session; protected pages require sign-in); real GoTrue `student-auth-session-ui` and `-api` (inside 18/18 and 13/13) | **PASS** (local) |
| Password and invitation flows | real GoTrue UI 18/18: student activation, temporary password, first-login change, recovery code, reissue, staff recovery (neutral answers, single-use link, forged URL marker refused, sessions revoked); `platform-invite-security`: **10 passed, 1 skipped** — only an admin-created account with a matching e-mail claim and an ACTIVE instructor/school-admin membership in an ACTIVE organization is activated; self-registered, suspended, no-membership, suspended-org, wrong-e-mail and student cases stay `invited` | **PASS** (local). Skipped: "token without an e-mail claim" — this GoTrue image disables phone/anonymous sign-in; covered by `SupabaseAuthGuard` unit tests |
| Unauthorized access | 28 of 31 controllers carry `SupabaseAuthGuard`; the 3 exceptions are `health`, `version`, `status` (no tenant data; `status` returns only `{mqtt:{connected}}`). Production probe: `GET /me/attempts/<uuid>` without a token → **401** | **PASS** |
| Role enforcement and cross-role | `lms-security-matrix` 1/1: other-school admin, wrong role, non-owner classmate and unauthenticated callers refused (401/403/404/409); `platform-route-sweep` 22/22 (every role's direct URL) | **PASS** |
| Tenant / school isolation, cross-user resources | `lms-robot-lab-access`, `platform-school-admin` ("cross-school classroom and roster access denied by the real API"), `digital-twin-attempt-scope`, `wf03-runtime-evidence` (peer and foreign teacher refused); jest `learning-scope.service`, `question-bank-global-scope.db`, `activity-progress-scope.db` | **PASS** |
| Runtime database role (non-superuser, no RLS bypass) | jest `runtime-role-security.db` (8 tests) is gated on a CI fixture; **not run locally**. The CI job `fresh-bootstrap` runs it with "none skipped" and was **green on #266 at `eceb8d1`** | **PASS (CI evidence)**, NOT RUN locally |
| Token handling | Twin viewer scope ≤ 60 s sent via the `vista.twin.<token>` WebSocket subprotocol (pytest); student-auth rate limits and HTTPS-only guard (jest `student-auth-*.guard.spec`, 10/min per account asserted in the API suite); in-memory reissue limiter noted | **PASS** |
| File access | signed URLs and allow-lists (`learning-media.*`, `submission-file*.spec`, real S3 integration); `lms-lesson-media` | **PASS** |

## B. Data integrity
| Check | Evidence | Status |
|---|---|---|
| Fresh database bootstrap (twice, identical fingerprint) | `scripts/bootstrap_dev_database.py` ran on multiple clean PostgreSQL 17 databases this cycle; CI `fresh-bootstrap` compares two bootstraps | **PASS** (CI green on #266) |
| Migration manifest and workflow safety | `validate_database_migration_manifest.py --release` passes; `check_database_workflow_safety.py .github/workflows`: "no database migration execution commands found" | **PASS** |
| Database safety tests | local without a database: 385 ran, 0 failed, 98 skipped (databases required); with my loopback harness 41 tests of the release/rollback flow could not be reproduced (they need the `vista_baseline_test_*` template workflow). CI `database-safety` and `fresh-bootstrap` ("none skipped") **green on #266 head `eceb8d1`** | **PASS (CI)**; local reproduction **BLOCKED** for those 41 |
| Constraints, existing-data preservation | Migration T applied twice (idempotent), two nullable columns + CHECKs, no row rewritten (SQL read, local application) — **not** applied anywhere else; #266 contains no `database/` or `schema.prisma` change | **PASS** |
| Backup and rollback readiness | rollback dispatch exists and is gated (rollback-guard refuses pre-migration-S images); Production backup evidence for any future migration is produced by the Production Database Release workflow — **not executed** | NOT RUN |
| Immutable snapshots, no score overwrite | jest `question-bank-quiz.snapshot.spec`; `attempt.score` untouched by rubric grading | **PASS** |

## C. AWS and infrastructure (read-only)
| Item | Observation | Status |
|---|---|---|
| IAM least privilege — API instance role | 11 statements: ECR pull scoped to one repository; one Secrets Manager secret; S3 `PutObject/GetObject` only on `learning-media/courses/*` and `learning-media/submissions/*` (media bucket) and `episodes/*` (recordings bucket); `iot:Publish` only to **one robot's** `commands` topic; SQS consume only on the two queues of that Thing; `iot:GetThingShadow` on that Thing; CloudWatch Logs on one log group. No wildcard resources except `ecr:GetAuthorizationToken` (service requirement). **Missing**: `learning-media/experiments/*` (D-03/D-08) | **PASS** (least privilege) / **FAIL for D-03** until the additive statement is applied |
| Terraform IAM plan, live variables | `Plan: 0 to add, 1 to change, 0 to destroy`; only `aws_iam_role_policy.ec2`; 11 → 12 statements; 0 removed; added `ExperimentEvidenceObjectAccess` | **Revalidated, NOT applied** |
| S3 public access | media, web and recordings buckets: `BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets` all **true** | **PASS** |
| AWS IoT policy / device identity | one Thing, one ACTIVE certificate; policy allows `iot:Connect` only for client id `vista-demo-<robot uuid>`, publish/receive only on that robot's `commands/telemetry/status/ack` topics and its own classic Shadow topics | **PASS** (isolated per device) |
| SQS and DLQs | feedback, feedback-dlq, recordings-events, recordings-dlq: 0 visible, 0 in flight | **PASS** |
| CloudFront / headers (Production web origin) | `Strict-Transport-Security` (1 year), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` present; **`Content-Security-Policy-Report-Only`** only (policy otherwise restrictive: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`) | **PARTIAL — owner decision C11 (enforce CSP)** |
| Deployed revisions | API and Web both `430ad59` (`/api/v1/version`, `/version.json`); health 200 | observed |
| Secrets handling | no secret was written to the repository by this cycle; harness keys were generated per run under `/tmp/vista-sa-harness` (mode 0700, removed by `harness down`); the workstation holds acceptance credentials in `~/.vista-acceptance/` outside Git | **PASS** |
| Production environment config, monitoring | container health / SSM not inspected (no SSM use) | NOT RUN |

## C2. Account provisioning and first-login policy (2026-11-28 requirement; local `7beb691`, details in `AUTH_PROVISIONING_ACCEPTANCE.md`)
| Control | Evidence | Status |
|---|---|---|
| Temporary password uniqueness/strength, one-time disclosure | 24 random bytes (32 chars), unique per call (unit); response `no-store`; never in listings | **PASS** (local) |
| No plaintext persistence / logging | searched `audit_logs`, `users`, member listings and the API log for every issued password: none | **PASS** (local) |
| Server-enforced first-login restriction; no API/URL/refresh/new-session bypass | 403 `PASSWORD_CHANGE_REQUIRED` on every protected route incl. provisioning; UI redirects on direct URL, reload, fresh context | **PASS** (local) |
| Temporary credential expiry; session invalidation | 403 `TEMPORARY_PASSWORD_EXPIRED`; reset/recovery rotate sessions (`SESSION_ROTATED`) | **PASS** (local) |
| Cross-school isolation, no escalation, duplicates | 404 for cross-school/escalation, 409 duplicates, 400 unknown role, 401 unauthenticated | **PASS** (local) |
| Never overwrite an active account | recovery refuses non-invited, previously signed-in, or permanent-password accounts | **PASS** (local) |
| Audit events | `account.created`, `account.invited`, `account.recovered`, `account.credentials_reset`, `account.first_login_password_changed` | **PASS** (local) |
| Invitation / recovery token security, e-mail delivery, SMTP | not exercisable without a mail transport | **NOT RUN** |
| Service-role key exposure | key stays server-side (`SupabaseAdminService`); never returned to the browser | **PASS** (code review) |
| Residual risk | a user can still change their own password directly at Supabase with the temporary session; the server flag then stays set and the API change endpoint can no longer verify the temporary password, so the account stays **restricted** until an administrator resets it (fail-closed, not a bypass) | documented |

## D. Findings
* **N-01 (Medium, fixed in a branch, not pushed):** a committed `node_modules` symlink to a developer's absolute path; `npm ci` followed it and emptied another worktree's dependencies during this audit (restored). Fix `38b770a` untracks it and ignores `node_modules` without a trailing slash.
* **N-04 (Medium):** CSP is report-only in Production.
* `wf03-safety-long-run` uses a machine-wide `pkill -f 'robot-runtime/src/server.py'` (acceptable on a disposable workstation; scope it).
* Authentication, tenancy and signed-URL logic were not changed in this cycle; no authorization defect was found.

**Gate C verdict:** CONDITIONAL — local evidence is complete and clean; Production retests (D-03/D-08/D-09), CSP enforcement and IAM application are outstanding.
