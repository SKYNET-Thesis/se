# Web LMS + Education API — production readiness (prepared 2026-11-20)

Status: **prepared, NOT executed.** Nothing here was run against Production, AWS or a hosted Supabase project. Every "verified" statement
below names the local, isolated evidence it rests on; every step that needs Production access is a gate for a human operator.
Migrations **O–P** remain `PROPOSED, NOT APPROVED` in `database/release-scopes.json`.

## 1. Production environment inventory

Extracted from the source (`process.env` / `ConfigService` in `services/education-api`, `VITE_*` in `web/robot-edu`). The API validates the
`NODE_ENV=production` configuration at boot (`src/config/production-config.ts`) and **refuses to start** when a required value is missing or a
local placeholder is present. **The stricter checks added on 2026-11-20 are new: verify every "Required" value exists in the Production task
definition before deploying this build, or the new task will fail its start-up check (the old task keeps serving).**

### Education API

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | Enables the start-up validation. |
| `PORT` | yes | Positive integer. |
| `DATABASE_URL` | yes | Runtime role `vista_app_runtime[.ref]`, `sslmode=require` or `verify-full`. Never the `postgres` superuser. |
| `DATABASE_RUNTIME_ROLE` | yes | Must equal the role in `DATABASE_URL`. `/health/ready` also checks `current_user`. |
| `SUPABASE_URL` | yes | `https://` only. Issuer and JWKS URL are derived (`<url>/auth/v1`) unless overridden. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret.** Used for invitations and student identities. Secret manager only. |
| `SUPABASE_ANON_KEY` | **yes (new check)** | Public key. Student sign-in, password change and session revocation call GoTrue with it. |
| `WEB_ORIGIN` | yes | Comma-separated `https://` origins, no path. CORS allow-list. |
| `LEARNING_MEDIA_BUCKET` | **yes (new check)** | The ONE learning-media bucket (see §5). |
| `AWS_REGION` | **yes (new check)** | |
| `TRUST_PROXY` | **yes (new check)** | Hop count, `1` behind the ALB. Without it the per-address student-auth limits throttle everyone together. |
| `STUDENT_TEMP_PASSWORD_ENABLED` | optional | `true`/`false` only (new check). Production currently runs the feature on. |
| `COURSE_PREREQUISITES_ENFORCED_FROM` | optional (new check) | Course-prerequisite enforcement. Absent/empty/`disabled` = off (default; nobody is locked). `always` = every enrolment. An ISO-8601 date-time **with a time zone** (e.g. `2026-12-01T00:00:00Z`) = only enrolments created at or after it; earlier enrolments keep today's access. Any other value makes the API refuse to boot in production. Enable only after the read-only impact query (`docs/operations/sql/prerequisite-enforcement-impact.sql`) has been reviewed. |
| `STUDENT_TEMP_PASSWORD_TTL_HOURS`, `STUDENT_AUTH_ACCOUNT_LIMIT_PER_MINUTE` (10), `STUDENT_AUTH_IP_LIMIT_PER_MINUTE` (120) | optional | Defaults are the verified values. |
| `SUPABASE_INVITE_REDIRECT_URL` | recommended | Where invited instructors / School Admins land after accepting. |
| `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, `SUPABASE_JWKS_URL` | optional | Override only for a custom domain. |
| `HTTP_BODY_LIMIT_BYTES` | optional | Positive integer. |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | optional | 1000–600000. Unset keeps Node's 5 s idle-connection timeout (the current Production topology, nginx without upstream keep-alive, is unaffected). Set it above the idle timeout of any keep-alive proxy placed directly in front of the API, otherwise a request that lands as the API closes an idle socket fails with a connection reset. The local integration stack sets 65000. |
| `DIGITAL_TWIN_TELEMETRY_URL` + `DIGITAL_TWIN_SCOPE_SECRET` | only with a Twin sidecar | URL must be loopback; secret ≥ 32 chars (new check). `DIGITAL_TWIN_REVOKE_RETRY_MS` (default `0,500,2000,5000`). |
| `VISTA_ROBOT_RUNTIME_MAP`, `VISTA_RUNTIME_TOKEN`, `ROBOT_RUNTIME_BASE_URL`, `ROBOT_RUNTIME_TIMEOUT_MS`, `VISTA_PHYSICAL_RUNTIME_MODES` | robot features only | Not part of Web LMS acceptance. |
| `MQTT_*`, `VISTA_IOT_*` | robot features only | Not part of Web LMS acceptance. |
| `GIT_SHA` | recommended | Reported by `/version`. |

**Must be absent in Production:** `LEARNING_MEDIA_S3_ENDPOINT` (rejected by the validator), `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (use the task
IAM role), `LEARNING_MEDIA_S3_ACCESS_KEY/SECRET_KEY`, every `RUN_*`, `VISTA_TEST_*`, `VISTA_E2E_*`, `VISTA_INTEGRATION_DATABASE_URL`,
`VISTA_ACCEPT_UNSTATED_RUNTIME_AS_PHYSICAL`, `COURSE1_*`, `VISTA_SEED_*`. Secrets containing `not-a-secret`, `local-int`, `twsecret_local`,
`test-only` or `changeme` are rejected.

### Web build (Vite, public values only)

`VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public). Optional feature flags: `VITE_DIGITAL_TWIN_WS_URL`,
`VITE_ROBOT_EXECUTION_CLIENT`, `VITE_ROBOT_HARDWARE_ADAPTER_URL`, `VITE_HOME_V2_PREVIEW`, `VITE_SO101_3D_DISABLED` (kill switch: `true` makes the homepage take its poster path; the real 3D arm is on by default since its Apache-2.0 meshes were verified; the former opt-in `VITE_SO101_3D_CLEARED` is no longer read) (robot/marketing, outside Web LMS acceptance).
Never place a service-role key, token or secret behind a `VITE_` prefix.

## 2. Supabase readiness checklist (hosted project — operator steps, not performed)

Local GoTrue (pinned `gotrue:v2.197.0`) verified the API contract; it does **not** prove the hosted project's configuration. Before acceptance:

1. **Email confirmation enabled** (Auth → Providers → Email → "Confirm email"). The invited→active transition trusts the `email` claim of a verified token;
   a project that issues tokens to unconfirmed addresses would weaken it.
2. **Invite template + redirect**: the "Invite user" email renders and its link lands on `SUPABASE_INVITE_REDIRECT_URL` (add it to Auth → URL configuration allow-list).
3. **Site URL** and redirect allow-list contain only the Production web origin(s).
4. **JWT signing**: confirm the key type (ES256/RS256 JWKS vs HS256 secret) matches what the API verifies (`/.well-known/jwks.json`); confirm `iss`/`aud` equal the API's derived values.
5. **Sign-ups**: public sign-ups disabled (accounts are created by invitation / admin only).
6. **Student identities** use the internal alias domain; confirm the alias domain is not deliverable mail.
7. **Rate limits** of the project (email, token refresh) are not lower than the expected invitation volume.
8. **Service-role key** stored only in the secret manager; rotated if it was ever pasted into a shell history.
9. **Refresh-token rotation + reuse interval** as verified locally (`GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true`).
10. Real e-mail delivery to a test inbox for: invitation, **re-sent** invitation (new in this build), and password-related mail if used.

Acceptance evidence to collect with a disposable test school: invite an instructor, accept, sign in, create a course; re-send an invite to a second pending instructor;
disable then enable an account; temporary-password student first login + change; recovery-code reset.

## 3. Database migration plan (O–P)

| Item | Result |
|---|---|
| Ordering | `…_n` → `20261119_o_wf01_robot_allocation_permission` → `20261119_p_course_level_tags_prerequisites_assignment_difficulty`; manifest pins sha256 and `sourceCommit`. |
| Nature | Additive: one idempotent role grant (O); 8 columns, 3 reference rows, one CHECK pair, one GIN index (P). No backfill, no new table, no RLS/policy/trigger change. |
| Rehearsal (2026-11-20, disposable `vista_test_*` DB at state N, seeded with a school, course, assignments, rubric, attempts, a graded submission) | `--snapshot` → apply O,P via the reviewed runner → `--verify`: **52 passed, 0 failed** (row counts and content digests of courses/assignments/classrooms/attempts/scores unchanged, catalog pinned, exact column definitions, three level rows, single role grant, nothing backfilled). Re-run: 0 pending. |
| Constraints | `learning_assignments_academic_values` and `learning_courses_tags_limit` reject invalid values (checked). Runtime role `vista_app_runtime` holds the needed privileges on the new columns (checked). |
| Rollback | `docs/operations/sql/o-p-rollback.sql`: **refuses** while any school uses the new data (checked: raised, nothing changed); with unused columns it drops them and removes the two ledger rows; academic data intact (1 course, 2 assignments, 2 attempts, scores sum 9.00 before and after); migrations then re-apply cleanly and the verifier again reports 52/0. |
| Normal rollback | Roll the API image back; leave the additive columns (older code ignores them). |
| Order constraint | **Apply O–P BEFORE deploying this API build.** The build reads the P columns; `GET /health/ready` answers 503 until they exist, so a load balancer using it will not route to a premature task. |
| Approval | Required. The release workflow is manual (`workflow_dispatch`), main-only, with a human-approved `apply` job. Not triggered. |

## 3a. Migration approval matrix (nothing below is approved or applied to Production)

| Scope | Files | Nature | Where applied so far | Status | Gate before Production |
|---|---|---|---|---|---|
| O–P | `20261119_o_…`, `20261119_p_…` (manifest, release scope `O-Q`) | additive: 1 role grant; 8 columns, 3 reference rows, CHECK pair, GIN index | disposable local DBs only (rehearsal 52/52) | **PROPOSED, NOT APPROVED** | human approval of scope; `Production Database Release` workflow; **before** the API build |
| M | `database/staged-migrations/20261116_m_revoke_public_temp_privilege.sql` | database-wide `REVOKE TEMP … FROM PUBLIC` (hardening) | disposable local DBs (idempotent re-apply; `runtime-role-security` **8/8**, K-L/M verifiers 2/2; GoTrue harness compatible) | **BLOCKED until hosted Supabase platform-role validation** | hosted dry-run proving no platform role (supabase_*, authenticator, …) depends on PUBLIC TEMP; then own scope |
| Q | `database/staged-migrations/20261120_q_media_archive.sql` | additive: 3 nullable columns, CHECK, partial index on `learning_media_assets` (soft archive; no delete) | disposable local DBs (API + Playwright `platform-media-archive` 3/3, `/health/ready` checks the columns) | **NEW, UNAPPROVED** | approval + own release scope; apply before deploying the API build that ships archive/restore (readiness reports 503 otherwise) |
| R | `database/staged-migrations/20261120_r_device_provisioning.sql` | additive: 2 tables, RLS + runtime-role grants (SELECT/INSERT/UPDATE), 1 permission + role grant | disposable local DBs (`platform-device-provisioning` 10/10) | **NEW, UNAPPROVED; feature flag off by default** | approval + own scope; only needed when `DEVICE_PROVISIONING_ENABLED=true` |

Rules kept: no staged file is in `manifest.json`; the CI workflow applies M, Q and R only to its throw-away runner database; the runner script refuses anything but loopback `vista_test_*` databases; no ledger row is written; approval of one scope does not approve another. Q is required by the build's `/health/ready`; R is not.

## 4. AWS infrastructure compatibility checklist (not changed)

- **Compute:** the API image needs only the env above; no static AWS keys; task role with `s3:PutObject`/`GetObject`/`HeadObject` (and list for `learning-media/` if used) on the media bucket.
- **Load balancer:** target-group health check → **`GET /health/ready`** (readiness: DB + schema + role). `GET /health` stays a liveness/DB ping. `TRUST_PROXY=1`. Idle timeout ≥ 60 s.
- **Twin sidecar (only if Digital Twin is enabled):** must be reachable on loopback from the API task (revocation client refuses non-loopback); share `DIGITAL_TWIN_SCOPE_SECRET` with its `VISTA_TWIN_AUTH_SECRET`.
- **Database:** runtime role per `DATABASE_RUNTIME_ROLE`; TLS required; connection limit sized for the API task count.
- **Static web:** S3 + CloudFront; SPA fallback to `index.html` for deep links; security headers (CSP allowing the API, Supabase and the media origin).

## 5. Learning Media — one bucket

All approved course documents, images, videos and attachments live in **one** bucket (`LEARNING_MEDIA_BUCKET`); category is only a key prefix
(`learning-media/courses/<courseId>/<documents|images|videos|audio>/<mediaId>.<ext>`). Do **not** create a bucket per file type.

| Requirement | Source of truth |
|---|---|
| Private bucket, Block Public Access on, default encryption | operator |
| Upload: presigned **POST** valid 5 min, exact content-type and size condition | `LearningMediaStorage.createUpload` (tested against a loopback S3: 97/97) |
| Types: mp4 webm mov pdf docx pptx png jpg jpeg webp mp3; max **250 MB**; identity verified by `HEAD` + ranged `GET` after upload | `learning-media.service.ts`, `learning-media.constants.ts` |
| Download: presigned GET **15 min**, `Content-Disposition` inline for PDF/image/video, attachment for Office files; authorised per activity | `LearningMediaStorage.createDownload` |
| Bucket CORS: origins = `WEB_ORIGIN`; methods POST, GET, HEAD; headers `content-type`, `x-amz-*`, `content-md5`; expose `etag`, `content-length` | mirrors the integration test |
| CloudFront | Media is **not** public. If media is later fronted by CloudFront it needs Origin Access Control and signed URLs/cookies; do not make the bucket public. |
| Lifecycle | No object is deleted by the application. Retention/lifecycle rules are an operator decision. |

**Archive / restore (new, staged migration Q).** A file is never hard-deleted. `POST …/media/:id/archive` and `…/restore` (author or School Admin scope, same tenant checks as the rest of the media API; audit `media.archived` / `media.restored`) set nullable archive columns. A file referenced by any activity of the course (`content.videoMediaId`, `content.mediaIds`, `content.blocks[].mediaId`, any status) cannot be archived (409 with the referencing activities). Archived files disappear from the default library list (`?archived=true` lists them), are not served to students, cannot be attached to a draft and fail publish-time readiness. The single unified Learning Media bucket and object keys are unchanged. Needs migration Q (§3a).

## 6. Security review summary (local evidence)

| Area | Evidence |
|---|---|
| Tenant isolation / RBAC | System routes are 404 to every other role; a School Admin, Instructor or Student cannot read or change another school (`platform-system-admin`, `platform-school-admin`, `platform-full-journey`, `platform-from-scratch`, `lms-security-matrix`). |
| Invited→active | One conditional statement: admin-created, subject-linked, email-claim match, non-anonymous, active membership in an **active** organization, instructor/school-admin only. Disabled accounts rejected before it. 11 DB-backed scenarios + 5 unit tests (`platform-invite-security`, `supabase-auth.guard.spec`). |
| Suspension | Suspended/closed organization, suspended membership, disabled account: authorisation removed immediately (guard) **and** Digital Twin viewers revoked (see §8). |
| Input validation | DTO validation everywhere; challenge rules compiled by the grading compiler at authoring time; unreachable challenges refused. |
| Uploads | Authorisation per course/author, type + size allow-list, identity verification after upload, private bucket, short-lived signed URLs. |
| Secrets | Scan of every changed file: no tokens/keys; only labelled local placeholders. Student one-time passwords: 0 plaintext occurrences in a DB dump or API/GoTrue/proxy logs (23 secrets). Production validator rejects placeholders. |
| Rate limits | Student auth per account (10/min) and per address (120/min); reissue 5/admin/hour. |
| Accessibility | axe-core WCAG 2.0/2.1 A+AA: 0 violations over every role's pages and the form dialogs. |

## 7. Health and readiness

| Endpoint | Meaning |
|---|---|
| `GET /health` | Liveness + database ping (terminus). |
| `GET /health/ready` | **New.** 200 `{status:"ready"}` only when the database answers, the migration-P columns and the migration-Q archive columns exist and the connected role is the configured runtime role; otherwise 503 with the failing check names (no secrets). |
| `GET /version` | Build identity (`GIT_SHA`). |

## 8. Digital Twin revocation (backend-owned)

The API now tells the Twin to close live viewers (`POST /internal/revoke-attempt`, signed publisher scope, ≤ 60 s token, fresh `jti` per delivery, retry with backoff on network/5xx, never on 4xx) on: final submission, member suspension, organization suspension/closure, account disable, classroom archive, student removal from a classroom, a different robot allocated. It never blocks the business operation; the 60 s viewer-scope TTL and the in-progress check at scope issuance remain the backstop. Evidence: 8 unit tests incl. retry; 6 E2E scenarios on the real DB with a signature-verifying Twin double; real Twin service: 202 for the correct signature, 403 for wrong secret/robot/organization/missing id/garbage. Not covered: entitlement *expiry* (bounded by the 60 s TTL; no API action exists to revoke an entitlement).

The revocation is proven end-to-end with **real WebSocket viewers** against the real Twin service (`digital-twin-websocket-revocation.spec.ts`, 11/11, run twice): each trigger closes the connected viewer with `4403 attempt revoked`; HTTP success alone is not accepted as evidence. The test also found and fixed a Twin defect (the `/ws/twin` handshake did not echo the `vista.twin.*` subprotocol, which every browser requires).

## 9. Deployment order

1. Review and approve release scopes O–P and Q (and R if devices are enabled) (human). 2. Run the reviewed database release workflow (preflight → approval → apply → verifier). M only after its hosted validation.
3. Verify Production environment against §1 and Supabase against §2. 4. Deploy the API (ECS rolling; health check `/health/ready`). 5. Deploy the web build. 6. Run the smoke tests (§10). 7. Enable features by flag only after the smoke tests pass.

## 10. Smoke tests (read-mostly, with a disposable test school)

`/health`, `/health/ready`, `/version` → 200. Sign in as each role → land on the role home. System Admin: list organizations. School Admin: open School profile and Roles. Instructor: open the course builder, create a draft course, upload a small PDF, open Blockly challenges. Student (temporary-password test student): first login → forced change → My Learning. Cross-school: a test school's admin gets 404 on another school's `/profile`. Then clean up through the application (no data deletion in Production).

## 11. Rollback plan

API: redeploy the previous image (the additive columns stay; older code ignores them). Web: redeploy the previous static build. Database: see §3 (normal rollback = none; `o-p-rollback.sql` only after the API no longer runs and no school used the new data, with its own approval). Feature flags: `STUDENT_TEMP_PASSWORD_ENABLED=false` returns students to the legacy Setup Code path.

## 12. Release blockers

1. **Approval of release scope O–P** (not given) and the database release itself.
2. **Hosted Supabase acceptance** (§2), including real invitation e-mail, re-sent invitation and email-confirmation setting. Not testable locally.
3. **Production environment check** against §1 (new boot-time validation can stop a task that lacks `SUPABASE_ANON_KEY`, `LEARNING_MEDIA_BUCKET`, `AWS_REGION` or `TRUST_PROXY`).
4. **Security sign-off** of the auth-guard change (invited→active and organization-status enforcement affect every request).
5. **Operator decisions:** media retention policy for archived files (archive/restore is implemented; permanent deletion is deliberately not); pagination of the System Admin organization list before the tenant count grows (currently unpaginated; ≈ 44 ms p95 for 7 organizations).
6. **Database hardening M** is staged outside the release manifest and **unapproved for Production**. It is now applied and verified on disposable local databases (`runtime-role-security` 8/8; idempotent; compatible with real GoTrue, Prisma and the API), but hosted Supabase platform-role compatibility is unproven, so it stays BLOCKED and release-separate. Until it is applied in Production the runtime role inherits `TEMP` from `PUBLIC` there.
6a. **Migrations Q and R** (§3a) are new, additive and unapproved; Q must be applied before this API build (readiness), R only if device provisioning is enabled.
7. Robot/Desktop paths (physical WF-03 needs the external CHECKIK adapter) are outside this release's Web LMS scope. Device provisioning is implemented behind a flag (see `docs/acceptance/DEVICE_PROVISIONING_CONTRACT.md`); `DEVICE_TOKEN_SECRET` must be provisioned in Secrets Manager before enabling it.
