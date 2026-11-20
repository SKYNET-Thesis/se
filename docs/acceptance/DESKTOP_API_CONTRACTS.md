# Desktop (Codex) API and WebSocket contracts — source-verified

Verified against `sprint/vista-90`, which contains the Production commit `eff03d6dcb336626c3ed645dadf25475dc9278e9` (checked with
`git merge-base --is-ancestor`). Education API paths are under `/api/v1`. Nothing here contacts Production.

## 1. Why Codex found "only the migration"

**It was a checkout/revision mismatch, not a missing backend contract.** Codex's handoff states its source was
`/home/quangduc/Code/vista/se`. That checkout is on `rc/checkpoint-2026-11-16` (`ccf7234`, before the feature) and contains an
**untracked draft migration** `database/migrations/20261118_student_temporary_password.sql`; it has none of the API files
(`student-temp-password.feature.ts`, `student-password-change.dto.ts`, guard changes). The merged feature is part of
`origin/main` and Production commit `eff03d6`; its migration is `20261118_n_student_password_change_required`
(different name from the draft). Nothing to implement: **no duplicate endpoint was added.**

## 2. Student temporary-password contract (exists; `services/education-api/src/modules/education-admin/`)

Capability probe (public, `Cache-Control: no-store`): `GET /auth/students/capabilities` → `{ "temporaryPasswordEnabled": boolean }`.
When `false` the server behaves as before (no `password_change_required` field is returned).

**Login** `POST /auth/students/login` `{ schoolCode, studentCode, password }` (each 1–80 / 1–80 / 1–128 chars) →
`201 { access_token, refresh_token, expires_in, expires_at, token_type, password_change_required: boolean }`.
It is an **ordinary Supabase session** for the student, flagged by `password_change_required`; there is no separate challenge
envelope, so the Desktop's `normalizeSession()` (access+refresh tokens) accepts it and must read the extra boolean. Wrong
school/student/password and an expired temporary password all return the same `401` text (no field disclosure).

**Restriction (server-side, `identity/auth/supabase-auth.guard.ts` ≈ lines 78-90):** with `password_change_required = true` every
route returns `403 { code: "PASSWORD_CHANGE_REQUIRED" }` except handlers marked `@AllowPasswordChangeOnly()` — only
`PATCH /auth/students/password`. An expired temporary password returns `403 { code: "TEMPORARY_PASSWORD_EXPIRED" }` (default
TTL 72 h; the school admin reissues). The Desktop must route on `password_change_required` and on these codes; it must never treat
the session as usable for learning APIs before the change.

**Mandatory change** `PATCH /auth/students/password`, `Authorization: Bearer <restricted access_token>`,
body `{ currentPassword (1–128), newPassword (12–128) }`; `newPassword` must differ from `currentPassword`.
Success `200` → a **new public session** `{ access_token, refresh_token, expires_in, expires_at, token_type }`
(the flag is cleared atomically in the same transaction; other sessions of the student are revoked via Supabase
`logout?scope=others`; access tokens with `iat <= password_changed_at` are refused `401 { code: "SESSION_ROTATED" }`).
Errors: `401` wrong current password / same password / too short; `409` no change pending or flag disabled; `403 PASSWORD_CHANGE_REQUIRED`
cannot occur here; `429` rate limit. The server compensates (restores the temporary password) if persistence fails;
a 45 s / 15 s Prisma transaction window was added in PR #174 after a Production concurrency defect.

**Limits:** per account (school+student code) 10/min shared by login, recover, change; per address 120/min
(`STUDENT_AUTH_ACCOUNT_LIMIT_PER_MINUTE`, `STUDENT_AUTH_IP_LIMIT_PER_MINUTE`); HTTPS required when `NODE_ENV=production`.
**Refresh/logout:** Supabase project routes with the public anon key (`/auth/v1/token?grant_type=refresh_token`, `/auth/v1/logout`); a
restricted session may refresh but stays restricted until the change succeeds. Legacy `POST /auth/students/setup` (Setup Code) and
`POST /auth/students/recover` (`{status:"password_updated"}`, no session) are unchanged.
Evidence: Production 24/24 (limitations in `docs/operations/student-temp-password.md`); local unit + DB suites.

## 3. Attempt-bound Digital Twin authorization (new in this sprint; backward compatible)

### 3.1 Scope broker — `POST /api/v1/me/attempts/:attemptId/digital-twin/viewer-scope`
Auth: student Supabase JWT. Body `{ "robotId": "<uuid>", "labSessionId"?: "<≤128 chars>" }`.
`201 { token, expiresAt, organizationId, classroomId, assignmentId, attemptId, robotId, labSessionId? }`. `token` is `v1.<b64url payload>.<HMAC>`.
One SQL path requires **all** of: attempt owned by the JWT subject and `in_progress`; delivery `published` and not past `close_at`;
classroom and school `active`; the student's classroom membership and school membership `active`; the role grants
`learning.experiment.execute`; the robot is allocated to **that** classroom (WF-01); a robot entitlement valid now.
Every failure (other student, other school, closed/submitted attempt, unallocated or unentitled robot, unknown attempt,
disabled user) returns **`404`** without a token; `401` no JWT; `400` malformed ids. The robot-wide route
`POST /robots/:robotId/digital-twin/viewer-scope` still exists for staff tooling; **students/Desktop must use the attempt route**.
Claims: `aud: "vista-digital-twin-viewer"`, `kind: "viewer"`, `sub`, `org`, `robots:[robotId]`, `attempt_id`, `assignment_id`,
`classroom_id`, optional `lab_session_id`, `exp` (≤ now+60 s), `jti` (unique).
Verified: `digital-twin-scope.service.spec.ts` (3 new tests) and Playwright `digital-twin-attempt-scope.spec.ts` against real PostgreSQL
and the restricted runtime role (grant, cross-school 404, other-school robot 404, unknown attempt 404, 401, 400).

### 3.2 WebSocket `WS /ws/twin` (Twin service; `VISTA_TWIN_WS_URL`)
* Authenticate with sub-protocol **`vista.twin.<token>`** (never a query token). Optional `?heartbeat=<seconds 0.25–10>`.
* **Filtering:** frames are buffered per `(robot_id, attempt_id)`. An attempt token receives only frames published for that attempt;
  a token without `attempt_id` can never see attempt-tagged frames (fail closed); a different attempt, school or robot → close `4403`.
  With no simulation frames buffered at all a token-less client still receives the labelled mock stream (unchanged legacy behaviour).
* **Frames:** `JointState` schema v1 (`robot_id`, `source_mode` `SIMULATION|LIVE_PHYSICAL|REPLAY`, `controller_id`, `measured_at`,
  `sequence`, `connection`, six joints). Mock = `SIMULATION` with `controller_id "offline-fixture"`.
* **Heartbeat (opt-in):** `{type:"heartbeat", schema_version:1, server_time, origin:"mock|simulation|physical", source_mode, robot_id,
  sequence, connection, age_ms}`; treat 3 silent intervals as a dead link and reconnect with a **fresh** scope.
* **Handshake:** the server **echoes the offered `vista.twin.<token>` subprotocol** on accept (required by RFC 6455; browsers abort otherwise — fixed 2026-11-20). A refusal decided *before* accept (no/invalid scope while streams exist) is an aborted handshake (HTTP 403 / no `open` event), not a close frame; codes below are delivered on sockets that were accepted.
* **Close codes:** `4403` with reason `viewer scope required` | `viewer scope expired` (checked every tick during an open socket) |
  `attempt revoked`. Do not retry with the same token; request a new scope (it will 404 once the attempt is no longer in progress).
* **Revocation:** `POST /internal/revoke-attempt` (signed simulation-publisher scope, called by the Education API) closes that
  attempt's viewers, clears its buffered frames and rejects further publishes for it (403). Other attempts are unaffected.
* **Ingest (server-to-server, not for the Desktop):** `POST /internal/simulation-telemetry` now carries optional `attempt_id`;
  the Education API sends `execution.attempt_id` from the experiment's immutable snapshot.
* No command route exists on the Twin; the Desktop must not send commands over this socket.
Verified: `tests/test_attempt_scope.py` (per-attempt filtering, 6 denial cases incl. expired/no token/other school/robot/attempt,
revocation) and the existing 56 Twin tests.

**Revocation (implemented 2026-11-20).** The Education API now calls `POST /internal/revoke-attempt` itself, best-effort and never blocking the
business operation, with bounded retry (`DIGITAL_TWIN_REVOKE_RETRY_MS`, default `0,500,2000,5000`; retried on network error/5xx only, a 4xx is final;
fresh signed token per delivery). Triggers: final submission of the attempt; student membership suspended; organization suspended/closed; account
disabled; classroom archived; student removed from the classroom; a different robot allocated to the classroom (the viewers bound to the previous
robot are revoked). Verified: unit tests (8), E2E against the real DB with a signature-verifying double (6 scenarios), and the real Twin service
(202 for a valid signature; 403 for wrong secret, other robot, other organization, missing id, garbage token). Not automatic: entitlement *expiry*
(no API action revokes an entitlement; the 60 s scope TTL and the in-progress check at scope issuance bound it). `VISTA_TWIN_WS_URL` discovery per
environment is still an operator decision; Playwright covers the broker and revocation calls, not a browser WebSocket client.

## 4. Isolated local integration environment

`scripts/local_integration_stack.sh up|down` creates a loopback-only stack (PostgreSQL 17 on tmpfs, RustFS S3, bootstrapped
schema D–O, restricted runtime role, phase-2.4.3 and WF-03 fixtures, Education API on :3001). It refuses nothing external because it
never contacts anything external. Auth is the repo's local JWKS signer started by Playwright
(`VISTA_E2E_JWKS_PORT=54323`); a matching **real GoTrue** for student login is the procedure in `docs/operations/student-temp-password.md`
(`gotrue:v2.197.0` + the Node reverse proxy) and is not automated by the script. Use
`export VISTA_E2E_API_BASE_URL=http://127.0.0.1:3001/api/v1 VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-int.json`.
