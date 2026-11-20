# Integration handoff: Web LMS / Education API → Desktop Lab Station and Robot Runtime (2026-11-20)

Related: [`DEVICE_PROVISIONING_CONTRACT.md`](DEVICE_PROVISIONING_CONTRACT.md), [`ROBOT_3D_DIGITAL_TWIN_HANDOFF.md`](ROBOT_3D_DIGITAL_TWIN_HANDOFF.md) (3D/MuJoCo/Twin inventory, licensing, verified paths).

For Codex (Desktop, Edge Runtime) and for whoever integrates the Robot Runtime. The authoritative route-level contract is
[`DESKTOP_API_CONTRACTS.md`](DESKTOP_API_CONTRACTS.md) (source-verified). This file states **what the backend now guarantees, what changed since
Codex's last review, what is still open, and how to run an isolated environment**. Nothing here modifies the Desktop repository, and no shared
API contract was changed silently.

## 1. What changed since the last Desktop review

| Change | Contract impact |
|---|---|
| Education API now revokes Twin viewers itself (submission, membership/account/organization suspension, classroom archive, student removal, robot change) with bounded retry | **None for routes.** Closes the open item "Education API does not yet call `/internal/revoke-attempt`". The socket behaviour (`4403 attempt revoked`) is the Twin's, unchanged. |
| Organization suspension/closure and account disable are enforced on **every** request | A suspended organization's members get the same answers as having no membership (404 on school routes, no permissions). A disabled account gets `403`. |
| Invited instructors / School Admins activate only through the guarded transition | No Desktop impact (students are never activated this way). |
| `GET /health/ready` added | Optional for Desktop; useful as a pre-flight (503 = schema/DB not ready). |
| New instructor-side routes (`author/challenges`, `…/unpublish`, invitation reissue, `users/:id/status`) | Additive. Desktop does not use them. |
| Challenge authoring: an authored Blockly challenge carries its toolbox in `tabletop_config` and its target in the assignment `constraints.target` | Same shape as the curriculum labs the Desktop already reads (`allowed_blocks`, `constraints.kind = symbolic_program`). |

**Proposed contract changes for Codex: none required.** Optional follow-ups are listed in §6.

## 2. Authentication (unchanged, verified against real GoTrue locally)

`GET /auth/students/capabilities`; `POST /auth/students/login` → Supabase session + `password_change_required`; restricted session may only
`PATCH /auth/students/password`; refresh via Supabase `grant_type=refresh_token` keeps the restriction until the change; `SESSION_ROTATED` after
the change; Recovery Code (`POST /auth/students/recover`) and legacy Setup Code remain separate. Real-GoTrue evidence: API suite 10/10, browser 4/4 +
recovery journey. Run the harness: `scripts/local_integration_stack.sh up` then `scripts/local_student_auth_harness.sh up` (GoTrue + API :3012 flag-on / :3013 flag-off).

## 3. Lab attempts, Blockly execution, submission, results

`POST /classroom-assignments/:id/attempts` creates or resumes; program/version/submit as in the contract; `submit` is the **only** terminal write and now also
revokes the attempt's Twin viewers. A submitted attempt rejects writes (`ATTEMPT_NOT_IN_PROGRESS` / `ALREADY_SUBMITTED`). Schematic evaluation is server-side
(`evaluate-symbolic`); automatic grading uses the challenge rules (now also authorable by instructors: ordered actions, counts, arm/gripper state, home,
wait time, target position, object grasp/lift/release/zone). Grades/feedback appear only after the instructor releases them. The Desktop must not duplicate grading.

## 4. Robot/device authorization, provisioning, MQTT (backend-owned status)

| Area | State |
|---|---|
| Attempt-bound viewer scope (`POST /me/attempts/:attemptId/digital-twin/viewer-scope`) | **Implemented, verified** (E2E on real DB, restricted role). 404 on every failure, never a token. |
| Robot allocation (WF-01) and entitlement checks in the scope path | **Implemented, verified** (DB-backed suite + E2E). |
| Revocation | **Implemented, verified** (see DESKTOP_API_CONTRACTS.md §3). |
| Physical execution authorization (`physical-executions`, runtime map, R1) | Implemented in the API; **WF-03 physical path BLOCKED locally**: needs the CHECKIK fake-follower adapter (port 8016), which is not in this repository. R1 unit tests 17/17. No hardware was used or claimed. |
| MQTT cloud integration (`iot-command`, `iot-feedback`, publish recovery) | Implemented with unit and repository tests; broker/AWS IoT acceptance **NOT TESTED** (no broker/AWS in this environment). |
| **Device provisioning** (registering/enrolling a Desktop or edge device with the backend) | **IMPLEMENTED behind `DEVICE_PROVISIONING_ENABLED` (off by default), verified locally (E2E 10/10).** Contract: [`DEVICE_PROVISIONING_CONTRACT.md`](DEVICE_PROVISIONING_CONTRACT.md): operator registers the device → one-time code → device generates its own Ed25519 key and proves possession → signs a single-use nonce per session → 15-min device token, re-checked against live device/org state on every request; suspend/resume/revoke/rotate; audit; rate limits. No AWS credential is ever issued; no AWS IoT provisioning. Needs staged migration R (unapproved). |

## 5. How to run an isolated environment (no Production, no AWS)

```
scripts/local_integration_stack.sh up                     # PostgreSQL 17 (tmpfs), RustFS S3, fixtures, API :3001 (kills stale API; needs the backend worktree idle)
scripts/local_student_auth_harness.sh up                  # real GoTrue + proxy :54323, API :3012 (temp-password on) / :3013 (off)
cd services/digital-twin && VISTA_TWIN_AUTH_SECRET=twsecret_local PYTHONPATH=src uv run --frozen uvicorn vista_digital_twin.app:app --host 127.0.0.1 --port 8767
```
The stack API already points at the Twin on `127.0.0.1:8767` with the shared `DIGITAL_TWIN_SCOPE_SECRET=twsecret_local` (a local, non-secret value). Fixture ids:
`/tmp/vista-phase243-fixture-int.json` (users, `classroomId`, `programDeliveryId`, `allocatedRobotId`, `replacementRobotId`). Student-auth accounts are created in GoTrue with the
fixture ids and passwords `LocalFixturePass-<role>!` (local fixtures only). Do not run `local_integration_stack.sh up` while another backend process uses the same ports.

## 6. Mapping to the Desktop's `INTEGRATION_ACCEPTANCE_CHECKLIST.md`

| Checklist item | Backend status |
|---|---|
| Source-verified temp-password contract; viewer-scope route and `/ws/twin` protocol | done (unchanged) |
| Isolated DB bootstrap fingerprint; local GoTrue, Education API, Twin start | **available** (§5) |
| Disposable accounts, assigned symbolic task, writable attempt, allocated simulation robot | available from the fixture; Codex must create its own disposable school/students for destructive runs |
| Education API calls `/internal/revoke-attempt` on submission and allocation withdrawal, with reliable retry | **done and proven with real WebSocket viewers** (`digital-twin-websocket-revocation.spec.ts` 11/11: submission, membership/account/organization suspension, classroom removal/archive, robot reassignment → `4403`; idempotent; retry after Twin restart). Retry is bounded; no persistent outbox: an API crash between commit and delivery falls back to the 60 s TTL. |
| Login/refresh/expiry/wrong school/logout, `/me*`, assignments, attempts, Blockly, schematic result, submission, submitted-write rejection | covered by the backend suites (`platform-*`, `lms-*`, `student-auth-*`) |
| Twin connects with a fresh attempt scope; wrong attempt/school/robot/expired/revoked fail closed; socket closes `4403` on submission or withdrawal | Twin 59/59 tests; API side verified; **real Node WebSocket clients against API-triggered revocation: 11/11** (a real *browser* client was not run). **Fixed:** the Twin now echoes the `vista.twin.*` subprotocol on accept, without which browsers abort the handshake |

## 7. Open items and risks

1. Device provisioning: contract implemented (see §4); production application of migration R and enabling the flag are release decisions; Desktop-side key storage is Codex's responsibility.
2. Persistent revocation outbox (optional hardening) — only if the 60 s TTL exposure is unacceptable.
3. Entitlement expiry is not an event; exposure is bounded by the 60 s scope TTL.
4. Physical WF-03 and CHECKIK acceptance require the external adapter and supervised hardware — not claimed anywhere.
5. `VISTA_TWIN_WS_URL` / Twin address discovery per environment is an operator decision.
