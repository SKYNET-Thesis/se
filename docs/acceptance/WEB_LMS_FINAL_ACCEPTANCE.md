# Web LMS + Education API — final acceptance report (2026-11-20, final sprint pass)

Statuses: **PASS**, **FAIL**, **BLOCKED**, **NOT TESTED**. Everything below was run sequentially on the final code, on disposable local infrastructure (PostgreSQL 17 tmpfs, RustFS S3, local JWKS signer, real GoTrue `v2.197.0` harness, real Digital Twin service). Nothing touched Production, AWS, hosted Supabase, `dev`/`main` or any physical robot.

## 1. Branch

Worktree `/home/quangduc/Code/vista/se-sprint-90`, branch `sprint/vista-90`, base `28a88f2`. `/home/quangduc/Code/vista/se` (`rc/checkpoint-2026-11-16`) was not modified.

## 2. Scope delivered in this pass

| Item | Status | Evidence |
|---|---|---|
| Migration M (revoke PUBLIC TEMP) — idempotent, on disposable DB, compatible with GoTrue/Prisma/API | PASS locally; **Production BLOCKED** (hosted validation, unapproved) | `runtime-role-security.db.spec` **8/8** (was 5/8); K-L/M verifiers; GoTrue UI 5/5 and API 10/10 on an M+Q+R database |
| Media archive/restore (soft, reference-checked, tenant/RBAC, UI + API, audit, single bucket) | PASS (needs staged migration Q, unapproved) | `platform-media-archive` 3/3; curriculum unit tests incl. archived-attachment refusal; readiness reports the columns |
| Device provisioning backend contract | PASS (flag off by default; needs staged migration R, unapproved) | `platform-device-provisioning` 10/10; Jest device-crypto + flag-off 6/6; [`DEVICE_PROVISIONING_CONTRACT.md`](DEVICE_PROVISIONING_CONTRACT.md) |
| Twin revocation with **real WebSocket clients** | PASS | `digital-twin-websocket-revocation` 11/11, run twice: real uvicorn Twin, Node WebSocket viewers; submission, membership suspension, account disable, organization suspension, classroom removal, classroom archive, robot reassignment all close the viewer with `4403 attempt revoked`; sibling attempt unaffected; idempotent; retry lands after Twin restart. **Defect found and fixed**: the Twin did not echo the `vista.twin.*` subprotocol, so browsers could never complete the handshake |
| WF-04 evidence storage/review | PASS for the implemented review (evidence storage in S3, submission review, assessment, release); **inference BLOCKED** | S3 evidence storage integration 3/3; `blockly-simulation`, `platform-from-scratch`; no model output exists, nothing was fabricated (see `VLA_SCOPE_AND_EVIDENCE.md`) |
| Blockly E2E determinism | PASS | helpers now wait on state (geometry stable across frames, block count) instead of timeouts; `blockly-simulation` 3/3 repeated + 1/1 on fresh stack; `lms-beginner-lab` and `platform-from-scratch` 2× each |
| Robot 3D / MuJoCo / Twin discovery | PASS (discovery); rendering NOT VERIFIED | [`ROBOT_3D_DIGITAL_TWIN_HANDOFF.md`](ROBOT_3D_DIGITAL_TWIN_HANDOFF.md): Menagerie SO-101 MJCF loaded with MuJoCo 3.3.6 + `mj_forward` (3 scenes), 6 joints/6 actuators |

## 3. Web functionality by role

| Area | Status | Evidence |
|---|---|---|
| System Admin (organizations lifecycle, School Admin assignment, invitations, accounts, isolation) | PASS | `platform-system-admin`, `platform-lifecycle`, `platform-full-journey` |
| School Admin (profile, roles, teachers/students, classrooms, activation, recovery, devices API) | PASS | `platform-school-admin`, `student-auth-ui` 5/5 incl. recovery journey |
| Instructor (course from scratch, modules, media upload **and archive/restore**, quizzes, assignments in UI, Blockly authoring, publish/unpublish, grading/release) | PASS | `platform-from-scratch`, `platform-media-archive`, `lms-authoring`, `lms-lesson-media`, `platform-lifecycle` |
| Student (activation, auth, learning, quizzes, assignments, Blockly lab auto-grading, grades, completion, denied states) | PASS | `lms-*`, `blockly-simulation`, real-GoTrue suites |
| UI hygiene / route sweep / resilience | PASS | `platform-route-sweep`, `platform-resilience` |
| Accessibility (axe WCAG 2.0/2.1 A+AA) | PASS | `platform-axe` |
| Responsive/visual | PASS (opt-in suite; 2 skipped in the default run by design) | `visual-audit` previously 2/2 with 0 overflow; not repeated in this pass |

## 4. WF-01 … WF-04

| WF | Status |
|---|---|
| WF-01 robot allocation | PASS (`robot-allocation.db.spec`, `lms-independent`, revocation on reallocation incl. real WebSocket) |
| WF-02 learning/assignments/review | PASS |
| WF-03 simulation/Twin path | PASS (`blockly-simulation`, Twin 59/59, real-WebSocket revocation) |
| WF-03 physical / fake-follower path | **BLOCKED** (`wf03-runtime-evidence` needs R1 runtime + CHECKIK adapter running; not run in this pass; R1 unit tests previously 17/17; no hardware) |
| WF-04 teacher review of evidence | PASS |
| WF-04 AI inference step | **BLOCKED** (no model output exists; none fabricated) |

## 5. Test results (final code, sequential)

| Suite | Result |
|---|---|
| TypeScript API / web; API build; web build | PASS |
| Jest `--runInBand`, no DB env | **1065 passed**, 0 failed (213 skipped need DB/S3; 96 suites). One suite had regressed (`curriculum.service.spec`, the new archived-attachment guard) — fixed and re-verified 28/28 |
| Jest DB + S3 gated (dedicated disposable DB, local RustFS), 25 suites | **179 passed**, 0 failed (needs `AWS_ACCESS_KEY_ID/SECRET` for the S3 client) |
| Jest `runtime-role-security.db.spec` (fixture env) | **8/8** |
| Vitest (single fork) | **649/649** (98 files); 3 expectations were updated for the new `archived` argument |
| Playwright main (fresh stack, serial, 32 spec files excl. harness/wf03/blockly-sim) | **149 passed, 2 skipped (opt-in), 0 failed** |
| Playwright `blockly-simulation` (WF-03 fixture) | PASS |
| Real GoTrue: browser / API | **5/5 / 10/10**; plaintext leak scan **0 occurrences of 10 secrets** (DB dump, GoTrue, API, proxy logs) |
| Digital Twin pytest | **59/59** (new subprotocol regression test) |
| Database Python tests | 374 OK (93 skipped without DB env, as designed) |
| Migration manifest validator | PASS |
| Secret scan of all changed files | clean |

## 6. Remaining blockers and production status

1. Approval of release scope O–P, and of Q and R (human). 2. Migration M: hosted Supabase platform-role validation. 3. Hosted Supabase acceptance (mail, redirects, email confirmation) — NOT TESTED. 4. Production env check against the boot validator (`DEVICE_TOKEN_SECRET` if devices enabled). 5. Human security sign-off ([`WEB_LMS_SECURITY_ACCEPTANCE.md`](WEB_LMS_SECURITY_ACCEPTANCE.md)). 6. NOT TESTED: AWS/CloudFront, broker/AWS IoT MQTT, a real *browser* viewer against the Twin, MuJoCo/Three.js rendering, physical WF-03. 7. Open product decisions: archived-media retention, organization-list pagination.

**Production Ready: NO.** The Web LMS and Education API are feature-complete and verified locally; release-critical approvals and hosted checks remain. See `docs/operations/WEB_LMS_PRODUCTION_READINESS.md` (migration approval matrix §3a).
