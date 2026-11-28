# WF-01 … WF-04 formal acceptance (2026-11-28)

Exactly four workflows — none renamed, redefined or added. Authoritative definitions: `../WF01_WF04_DEFINITION_PACKAGE.md` (names, actors, steps, endpoints, entities, state tables, owner questions) and `../OWNER_DECISIONS_WF01_WF04.md`. The definitions are **not copied here**; this file records the acceptance outcome. "Approved name" is the repository's approved activity-diagram name.

Tested revision: `develop` `eceb8d1` (local, isolated). Production observed at `430ad59` (read-only this cycle; Production case results are the 2026-11-27 runs at `43dcb60`/`430ad59`, **not re-run**). Rule applied: **a partial workflow is not a completed workflow.** Local PASS is not Production PASS; mock PASS is not physical PASS.

## Summary
| Workflow | Local (`eceb8d1`) | Production | Physical SO-101 | Outstanding |
|---|---|---|---|---|
| **WF-01** School Administration & Robot Resource Allocation | **PASS** (main flow, alternative and exception flows listed below) | **PARTIAL — not accepted** (allocation + Lab Session Start/End PASS; Extend, Force End, Stop, concurrent Start, expiry NOT RUN) | n/a (no hardware action by design) | D-11 owner decision (B5); W1-2/W1-3 |
| **WF-02** Learning & Assignment Management | **PASS** | **PARTIAL — not accepted** (student submission PASS; authoring/publish NOT RUN on Production, no Production test content approved) | n/a | W2-1…W2-3 confirmations; B7 |
| **WF-03** Robot Experiment Execution | **PASS as `MOCK_RUNTIME`/`SIMULATION`** | **FAIL** at `430ad59` (D-03 evidence, D-08 status 500, D-09 Twin fixture) — fix on develop, undeployed, IAM not applied | **NOT RUN / BLOCKED** (Gate H/I) | release + IAM apply + retest; Codex hardware evidence; Desktop gaps (see matrix) |
| **WF-04** AI/Data Integration & Teacher Review | **PASS** (levels excluded — Option B) | **PARTIAL — not accepted** (earlier Production grading works; release gate, canonical summary and Gradebook not deployed) | n/a | release; Migration T for rubric levels (separate decision) |

No workflow is Production-accepted today. The project is therefore **not** declared complete.

## WF-01 — School Administration & Robot Resource Allocation
* **Actors / permissions** — School Admin (allocation, Force End with reason ≥ 5 chars), Instructor (Lab Session), System Admin (robot resources, entitlements), Student (blocked/enabled by session). Verified: `lms-robot-lab-access` (a student of an allocated classroom sees the Lab; a user of another school does not; unauthorised scope refused), `platform-school-admin` (cross-school classroom/roster access denied by the real API), `lab-session-management` ("unauthorized users cannot end").
* **Preconditions / main flow** — `lms-independent` "WF-01 school admin allocates an entitled available robot and the authorized instructor sees the current allocation" (clean-stack 9/9); `lab-session-management` 4/4: System Admin registers/edits/entitles/revokes/retires a robot in the Web UI; School Admin allocates Robot A to Classroom 1 and 2 and Robot B to Classroom 2, duplicates and cross-organization rejected; Instructor 1 reserves Robot A (no arming, survives refresh), Instructor 2 cannot, extension works.
* **Alternative / exception flows** — allocation removal refused during a reservation; Force End needs a reason and releases safely; Instructor 2 can then reserve; 409 on a duplicate allocation (D-11 behaviour); jest `lab-session.db`, `robot-allocation.db`, `lab-session-compat.db` (schema-not-ready → 503, not 500).
* **State transitions** — `active → terminating → released / quarantined` verified by jest `lab-session.db`, `lab-session-safe-stop`, `lab-session-run-lost` and `wf03-safety-long-run` 4/4.
* **Persisted outputs** — allocation rows, lab-session rows, audit rows (DB specs).
* **Business outcome** — instructor sees the allocated robot; reservation blocks others; students blocked again after release. **Met locally.**
* **Local vs Production** — Production: allocation + Start/End PASS (2026-11-27); Extend/Force End/Stop/expiry NOT RUN there. D-11 is a contract change versus the pre-migration-S baseline that only the owner can settle.
* **Final status:** Local **PASS** · Production **PARTIAL** · overall **NOT ACCEPTED**.

## WF-02 — Learning & Assignment Management
* **Actors** — Teacher/author → Student. Role checks: `lms-security-matrix`, "Instructor course authoring is school-scoped" (`lms-independent`).
* **Main flow** — `lms-authoring` 5/5 (author, preview, publish, student sees it, persists across refresh), `lms-beginner-lab` 1/1 (classroom → allocation → Blockly lab → automatic simulation grading → review → release → reflection; **integrated WF-01→WF-04 journey**), `blockly-simulation` 1/1, `lms-independent` "Student submits a ProgramVersion and instructor assesses and returns feedback".
* **Alternative / exception** — symbolic evaluation FAIL does not block submission but blocks WF-03 (W2-2); draft discard (`lms-draft-discard`); duplicate submission returns the stored result (jest); unauthorised submission refused (`lms-security-matrix`).
* **State transitions / persisted outputs** — attempt `in_progress → submitted/evaluated`, one submission per attempt (D03 stage 2 guard; the schema-compatibility service logs when stage 2 is not applied), program versions, symbolic evaluation rows (jest `attempt-submissions.db`, `programming-assignment-authoring.db`).
* **Outcome** — student's program is stored with provenance and gated for WF-03. **Met locally.**
* **Final status:** Local **PASS** · Production **PARTIAL** (authoring NOT RUN, no approved test content) · **NOT ACCEPTED**. W2-3 (Basic Blockly path part of WF-02) awaits confirmation.

## WF-03 — Robot Experiment Execution
* **Actors** — Student; API; Robot Runtime; Digital Twin; object store. Defined as: student runs the submitted program → API validates auth/assignment/robot → runtime executes → API stores result + evidence → student sees result or error.
* **Main flow (local)** — `wf03-runtime-evidence` 1/1: browser student runs the R1 fake follower (**`MOCK_RUNTIME`**, telemetry `SIMULATION`), retrieves scoped persisted evidence; instructor reads it; peer and foreign teacher are refused; deleting the object makes the API answer `unavailable` instead of fabricating a link.
* **Alternative / exception (local)** — `wf03-safety-long-run` 4/4 (cancel mid-run, End Lab Session during a run, runtime disconnect with truthful status and quarantine, recovery/release); jest `physical-execution.service.spec` A–X (unauthenticated, other learner's version, unqualified/failed symbolic evaluation, no entitlement/allocation, busy session, runtime offline, E-stop); D-04 late-ACK fix prepared.
* **State transitions** — lifecycle `queued → acknowledged → executing → completed/failed/timed_out` (monotonic, no regression; `iot-feedback.service.spec`); experiment `pending → running → succeeded/failed`; session `created → active → completed/fault`.
* **Persisted outputs** — experiment events (decimal ids, ordered), one JSON evidence artifact **and** the object in the store; Twin frames bound to `(robot, attempt)`.
* **Outcome** — met locally for the simulation path.
* **Production** — **FAIL** at `430ad59`: D-08 `GET /me/physical-executions/:id` HTTP 500 after a successful run; D-03 no artifact (role lacks `s3:PutObject/GetObject` on `learning-media/experiments/*` — re-verified today: the statement is still absent); D-09 viewer shows the Twin's own offline fixture. Fixes (#260, #262) are in develop and in #266, **undeployed**; IAM apply and retest outstanding.
* **Physical** — **NOT RUN / BLOCKED**: no hardware evidence from Codex; Desktop lacks `kind:"cancel"` (EDGE §14), the authorization-bridge decision, and physical telemetry forwarding (see `DESKTOP_BACKEND_INTEGRATION_MATRIX.md`). Gate I (physical WF-03) therefore closed.
* **Final status:** Local **PASS (mock)** · Production **FAIL** · Physical **BLOCKED** · overall **NOT ACCEPTED**.

## WF-04 — AI/Data Integration & Teacher Review
* **Actors** — Teacher; Student. Evidence and model metadata are linked to the submission; teacher reviews evidence, scores the rubric, gives feedback, releases; the student sees the released result.
* **Main flow (local)** — `lms-assignment-grading` 1/1 and `lms-beginner-lab` (review → partial draft → release → student sees result; Gradebook consistent); jest `assignment-grading-lifecycle.db`, `assessment*.spec`, `rubric-score.spec` (31/36 = 86.11 % = 8.61/10).
* **Alternative / exception** — incomplete rubric release refused (409 `RUBRIC_INCOMPLETE`); explicit zero counts as graded; scoring after release refused (409 `GRADE_RELEASED`); new mixed grading refused (#274); quiz results independent and `attempt.score` untouched.
* **AI registry** — `ai-registry` 7/7 (read-only evaluation runs; the registry endpoints `benchmark-tasks` and run benchmarks have no UI caller, N-07).
* **Rubric levels** — **excluded from Option A**; passes locally on #272 + Migration T only (`RUBRIC_AND_GRADEBOOK_ACCEPTANCE.md`), unreleased.
* **Final status:** Local **PASS** · Production **PARTIAL** (release gate/summary/Gradebook undeployed) · overall **NOT ACCEPTED**.

## Differences local vs Production (for the owner)
Local uses a single-use synthetic fixture, a local JWKS signer (or real GoTrue for the auth suites), RustFS instead of S3 with IAM, an R1 mock instead of AWS IoT/Shadow/SQS, and no Twin container image. Anything depending on IAM, IoT, SQS, CloudFront or the deployed Twin image is **only** proven on Production at the cases listed in `PRODUCTION_ACCEPTANCE_RUNBOOK.md`.
