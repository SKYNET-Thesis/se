# WF-03 acceptance report — Student Robot Programming and Experiment Execution

Date: 2026-11-26. Revision under test: `develop` 4fb7efe + PR #212 (events BigInt fix) + this report/spec change.

**Scope of this evidence: LOCAL isolated E2E with the CHECKIK fake follower (runtime classification `MOCK_RUNTIME`).**
It is not AWS E2E and not physical-robot acceptance. Both remain **NOT RUN / BLOCKED**.

## Environment (disposable, loopback only)

- PostgreSQL 17 `vista-int-pg` (tmpfs, `127.0.0.1:55497`, db `vista_test_int`), RustFS S3 `vista-int-s3` (tmpfs, `127.0.0.1:59000`, bucket `vista-wf03-e2e-int`).
- Education API built from this revision on `:3001`; runtime role `vista_app_runtime`; test-only secrets; local JWKS signer on `:54323`.
- CHECKIK `wf03_command_adapter.py` (`fake_follower`) `:8016` → R1 `services/robot-runtime` `:8015` → API via `VISTA_ROBOT_RUNTIME_MAP` / `VISTA_RUNTIME_TOKEN`.
- Digital Twin started by the spec on `:8767`. No Production, hosted Supabase, AWS, or the local Supabase containers were used or modified.

## Results

| Check | Result |
|---|---|
| `wf03-runtime-evidence.spec.ts` (real Chromium, fresh single-use fixture) | **PASS** 1/1, 4 fresh-fixture runs (the last 3 include the events assertions) |
| `experiment.service.spec` + real-PostgreSQL `experiment-run.db.spec` on this revision | **PASS** 25/25 |
| physical-execution / robot-runtime / provenance / evidence / Twin-client specs (real PG enabled) | **PASS** 71 passed, 1 skipped (S3 integration, opt-in) |
| `tsc --noEmit` (education-api) | **PASS** |

## Journey covered by the browser spec

Student session → activity page "Physical Experiment" → explicit simulation checklist (3 boxes) → **Confirm & Run Local Simulation** → `POST …/physical-executions/start` = 201 → API authorizes enrolment, assignment/ProgramVersion qualification, classroom allocation, entitlement, runtime readiness → R1 → fake follower → status polled to `succeeded` → Twin telemetry `accepted` → evidence `available` → student downloads JSON evidence from signed URL → instructor opens submission review and downloads the same evidence.

Negative/authorization checks in the same run: peer student and foreign-school teacher get 403/404 for evidence, events and submission; after the S3 object is deleted the download returns `{status:"unavailable"}` (no fabricated link).

## Identifiers from the final run (all consistent)

- experimentId = R1 run id = **03f15e22-a805-4a46-bf94-3e04d815d32d** (the API owns the run id; there is no separate commandId — the run id is the command identifier sent to R1)
- submissionId f5c10a4a-4ff0-41c4-bd04-5af72bd19f3e, attemptId 21ff7460-e7df-42b9-9cba-8aae3707398a, studentId d16ee89a-11be-4ff1-a2df-c5ef2ac73500, classroomId 2c5c8cb4-36c8-4b72-b509-13236e67f732, robotId c4ec1833-1962-4c2b-8aec-317e58a3e1ff
- Persisted events (ordered, ids are decimal strings): `physical_execution_prepared#0 > running#1 > succeeded#2 > physical_completion_withheld#3 > physical_completion_withheld#4`
- Artifact: 1 × `application/json` telemetry (`schema vista.experiment.telemetry.v1`, `sourceMode: SIMULATION`), sha256 `b4a18cd7…eb50`.
- The two `physical_completion_withheld` events are intentional: a fake-follower success is recorded but does **not** complete the physical lesson (spec cases Q2–Q4).

## Exception flows (unit/service + real PostgreSQL)

Covered by `physical-execution.service.spec` A–X: unauthenticated, other learner's ProgramVersion, unqualified version, failed symbolic evaluation, no entitlement, no allocation, conflicting/busy ControlSession, runtime offline/not-ready, E-stop, missing safety confirmation, forged programVersionId, single dispatch, duplicate finalization idempotent, refresh does not re-dispatch, runtime failure/stop/timeout leave the lesson incomplete, runtime lost reported without false termination.

## Defect fixed

P1: `GET /me/experiments/:id/events` returned HTTP 500 (BigInt id). Fixed in #212; the spec now asserts 200, string ids, ascending `event_index`, unique ids and peer denial. Desktop reads this route (`API_CONTRACTS.md`).

## Screenshots

`docs/acceptance/screenshots/wf03/wf03-student-run-result.png` (SUCCEEDED, "does not represent physical robot execution"), `wf03-instructor-evidence-review.png`. Set `VISTA_E2E_SCREENSHOT_DIR` to regenerate.

## Not covered / limits (do not overstate)

- **AWS E2E: NOT RUN.** **Physical robot: BLOCKED** (no commissioning approval). Local fake follower ≠ hardware.
- The spec starts the run from the activity checklist UI. Blockly authoring and symbolic validation are exercised by `blockly-simulation.spec.ts` (separate spec, not rerun in this report).
- Twin telemetry is verified as API-accepted; browser rendering of the Twin viewer is covered by separate `digital-twin-*` specs, not rerun here.
- Desktop (VISTA Lab Station) recording is not yet associated with a Web submission in any evidence; Desktop-originated `vista.robot.recording.v1` upload → SQS → evidence needs the AWS step.
- Single-run timeout, disconnect and missing-telemetry paths are service-level tests, not browser tests.
- Fixtures are single-use; rerun needs a fresh seed.
