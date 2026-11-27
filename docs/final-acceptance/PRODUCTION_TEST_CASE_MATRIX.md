# Production test case matrix (2026-11-27, Production `43dcb60`)

Status values: PASS / FAIL / BLOCKED / NOT RUN. "Evidence" cites `docs/acceptance/screenshots/` or the acceptance script output recorded in `08-production-acceptance.md`. Every case's cleanup is "none" unless stated. Requirement refs point to `docs/SRS.md` areas (R-AUTH, R-ADM, R-LMS, R-ROB, R-SEC, R-IOT) and `docs/final-architecture/04-use-case-model.md`.

Environment for every row: Production `https://skynex.best` unless stated. **Tested revision:** rows executed on 2026-11-27 morning = `43dcb60`; WF03/WF04 retest rows = `430ad59`; CI/DB-spec/unit rows = the CI run of the cited PR (not Production); NOT RUN rows have no revision.

Columns: **ID · Req · Objective · Actor · Preconditions/Data · Navigation · Steps (numbered) · Expected · API/DB verification · Actual · Status · Evidence · Cleanup**.

## AUTH
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | R-AUTH | Public landing and sign-in render | Anonymous | none | `/`, `/login` | 1 open `/` 2 open `/login` | pages render, no console error | HTTP 200 | rendered | PASS | `production-final/` shots | none | Production | 43dcb60 (morning) / 430ad59 |
| AUTH-02 | R-AUTH | Wrong credentials give a generic error | Anonymous | any email | `/login` | 1 enter wrong password 2 submit | generic error, no account enumeration | Supabase 400 | generic message | PASS | UI script (#250) | none | Production | 43dcb60 (morning) / 430ad59 |
| AUTH-03 | R-AUTH | Email sign-in, refresh keeps session, logout | System Admin | main admin | `/login` | 1 sign in 2 refresh 3 logout 4 sign in | session persists; logout returns to login | JWT valid on `/me` | as expected | PASS | `prod-admin-*.png` | none | Production | 43dcb60 (morning) / 430ad59 |
| AUTH-04 | R-AUTH | Student first login forces password change | Student | VTEST112701 temp password | `/login` | 1 sign in 2 try deep link 3 type mismatching confirm 4 type matching 5 submit | restricted session; deep links blocked; submit disabled until valid; dashboard after | `password_change_required` cleared | as expected | PASS | `prod-password-change-masked.png` | none | Production | 43dcb60 (morning) / 430ad59 |
| AUTH-05 | R-AUTH | Self-service student sign-in with student code | Student | VTEST112701 | `/login` | 1 enter code + new password | signed in | JWT | as expected | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
| AUTH-06 | R-AUTH | Password recovery email | Any | mailbox | `/forgot` | 1 request reset | email delivered | Supabase | not exercised (E2E mailboxes have no inbox) | NOT RUN | — | none | — | — |
## SA — System Admin
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SA-01 | R-ADM | Organizations list | System Admin | main admin | `/admin/organizations` | 1 open | E2E1901/E2E1901B listed | `GET /admin/organizations` 200 | listed | PASS | `prod-admin-orgs.png` | none | Production | 43dcb60 (morning) / 430ad59 |
| SA-02 | R-ADM | Robot Resources and allocation | System Admin | robot f1c066c4 | `/admin/robots` | 1 open 2 check entitlement/allocation | robot, entitlement and allocation shown | admin robots API 200 | shown | PASS | `prod-admin-robots.png` | none | Production | 43dcb60 (morning) / 430ad59 |
| SA-03 | R-ADM | Bulk student import XLSX | System Admin | XLSX of 10 | `/admin/students` | 1 upload 2 preview 3 confirm | 10 Ready; 10 accounts; distinct 32+ char one-time passwords | `parse-file`, `import` 2xx | 10 created | PASS | `prod-import-preview.png` | accounts remain | Production | 43dcb60 (morning) / 430ad59 |
| SA-04 | R-ADM | Partial import with invalid rows | System Admin | invalid row | `/admin/students` | 1 upload mixed file | invalid rows blocked, valid imported | API validation | covered by unit/db specs; not run on Production | NOT RUN | CI | none | — | — |
| SA-05 | R-ADM | Student temp-password reissue | System Admin | account still password-change-required | `/admin/students` | 1 reissue with `{confirm:true}` | new one-time password | API 2xx | works only while change-required (E2ES01 rejected, expected) | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
## SCHOOL — School Admin
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SCHOOL-01 | R-ADM | Class roster and members | School Admin | E2E org | classroom page | 1 open class 2 list members | VTEST112701 enrolled | members API | as expected | PASS | API | none | Production | 43dcb60 (morning) / 430ad59 |
| SCHOOL-02 | R-ROB | Force end Lab Session (reason ≥5 chars, audited) | School Admin | open session | classroom → Lab Session | 1 Force end 2 enter reason | safe termination, audit entry | `lab-sessions/:id/force-end` | covered by DB specs; not run on Production | NOT RUN | CI | none | — | — |
## INST — Instructor
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INST-01 | R-LMS | Instructor sign-in and class list | Instructor | E2E instructor | `/login` | 1 sign in | classes shown | `/me` | as expected | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
| INST-02 | R-ROB | Start Lab Session | Instructor | robot allocated, runtime online | classroom → Lab Session | 1 click Start Lab Session | "Reserved for this classroom" | reservation row; unique open index | as expected | PASS | `prod-instructor-lab-session.png` | End session | Production | 43dcb60 (morning) / 430ad59 |
| INST-03 | R-ROB | End Lab Session releases robot | Instructor | open session | same | 1 click End (confirm) | "Available"; student blocked `LAB_SESSION_NOT_ACTIVE` | reservation released | as expected | PASS | `prod-instructor-after-end.png` | — | Production | 43dcb60 (morning) / 430ad59 |
| INST-04 | R-ROB | Extend 30 min | Instructor | open session | same | 1 click Extend | expiry +30 min | API 2xx | unit/db tested; not run on Production | NOT RUN | CI | none | — | — |
| INST-05 | R-LMS | Review submission, evidence, feedback, release | Instructor | submitted attempt | classroom → submissions | see WF04 | see WF04 | see WF04 | see WF04 | see WF04 | — | none | — | — |
## STU — Student
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| STU-01 | R-LMS | My Learning dashboard | Student | VTEST112701 | `/` after login | 1 open | enrolled class, assignment | API 200 | as expected | PASS | shots | none | Production | 43dcb60 (morning) / 430ad59 |
| STU-02 | R-LMS | Basic vs Advanced classification | Student | Advanced class | class page | 1 open Advanced class 2 open assignment | Advanced shows robot-lab tasks; Basic does not offer robot run | course level field | Advanced shown; Basic-class negative not re-run today | PASS (Advanced) / NOT RUN (Basic) | shots | none | Production | 43dcb60 (morning) / 430ad59 |
| STU-03 | R-SEC | Student cannot open admin pages | Student | VTEST112701 | `/admin/students` | 1 open directly | redirected to My Learning | 404 on admin APIs | as expected | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
| STU-04 | R-UI | Responsive no overflow 390/768 px | Student | — | key pages | 1 resize | no horizontal overflow | — | none | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
## LMS / QUIZ / ASSIGN
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LMS-01 | R-LMS | Course view and lessons | Student | enrolled | class → course | 1 open lesson | content renders | API 200 | not re-run today (earlier Web LMS acceptance 36/36 local) | NOT RUN (Production) | `WEB_LMS_FINAL_ACCEPTANCE.md` | none | — | — |
| QUIZ-01 | R-LMS | Take a quiz and view result | Student | quiz in course | lesson → quiz | 1 answer 2 submit | score recorded | quiz attempt row | local acceptance PASS; Production NOT RUN | NOT RUN (Production) | local doc | none | — | — |
| ASSIGN-01 | R-LMS | Start assignment attempt, Blockly program, schematic, symbolic check, submit | Student | VTEST112701 | assignment | see WF02 | symbolic PASS, submitted | attempt/submission rows | see WF02 | PASS | wf03_final | none | Production | 43dcb60 (morning) / 430ad59 |
| ASSIGN-02 | R-LMS | Submit revokes Twin attempt only after run complete | Student | — | — | covered by regression (#255) | Twin accepts telemetry after submit | Twin 202 | PASS (CI + Production 202) | PASS | #255, #253 | none | Production | 43dcb60 (morning) / 430ad59 |
## ROBOT / LAB
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ROBOT-01 | R-ROB | Entitlement and allocation gate | System Admin | robot | `/admin/robots` | 1 verify | allocated to class | tables | PASS | PASS | shots | none | Production | 43dcb60 (morning) / 430ad59 |
| ROBOT-02 | R-ROB | Student simulation wording | Student | Lab Session open | Robot Lab | 1 open run panel | "Explicit Simulation Confirmation Checklist", "Confirm & Run Local Simulation" | UI text | as expected after #253 | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
| LAB-01 | R-ROB | Student blocked without open Lab Session | Student | no session | start | 1 start | `LAB_SESSION_NOT_ACTIVE` | API 409/403 code | as expected | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
| LAB-02 | R-ROB | One open reservation per robot | System | two classes | — | 1 start in class B while class A open | rejected | partial unique index | DB spec PASS; not run on Production | NOT RUN (Production) | CI | none | — | — |
| LAB-03 | R-ROB | Stop Execution (MQTT cancel) | Instructor | run in progress | Lab Session | 1 click Stop execution | runtime stops, ack | `cancel` command | run lasts ~0.5 s, not feasible; DB spec only | NOT RUN | CI | none | — | — |
## WF01–WF04
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WF01 | R-ROB | Robot resource allocation + Lab Session | SysAdmin, Instructor, Student | see runbook | see runbook | see runbook | reserve → student eligible → end → blocked | reservation rows | as expected | PASS | `08-production-acceptance.md` | End session | Production | 43dcb60 (morning) / 430ad59 |
| WF02 | R-LMS | Student assignment → symbolic → submit | Student | VTEST112701 | see runbook | see runbook | submitted, symbolic PASS | attempt/submission | PASS | PASS | wf03_final.json | none | Production | 43dcb60 (morning) / 430ad59 |
| WF03 | R-ROB/R-IOT | Simulation run via IoT, Twin display, evidence | Student | Lab Session + Edge online; Production `430ad59` | see runbook | see runbook | succeeded, Twin frames, evidence artifact | events, Twin, artifact | run succeeded; events prepared, queued, ack, executing, latest-frame, completed; Twin 202; 228 viewer frames (mock stream, D-09); **status endpoint 500 and no artifact (D-03/D-08)** | **FAIL (evidence) — #260 pending** | `wf03_frames.json`, API logs | End session | Production | 430ad59 |
| WF04 | R-LMS | Instructor review, grade, feedback, release; student views | Instructor, Student | submission `64b58103…` (attempt `92c7780c…`), `430ad59` | see runbook | see runbook | released, visible to student | assessment/feedback/release rows | rubric 6/6 + 3/4 = 9/10 saved (POST 201, readback correct); feedback 201; release 201; re-assessment 409 `GRADE_RELEASED`; student API grading + feedback correct; student UI Completed tab shows "Evaluated, Score 9 / 10, Teacher feedback"; **instructor evidence opening NOT RUN (no artifact, D-03)** | **PASS (scoring, feedback, release, student view, lock) / NOT RUN (evidence)** | script output | none | Production | 430ad59 |
## SEC
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | R-SEC | Tenant isolation | Student | org A/B | admin APIs | 1 call admin routes | 404 | HTTP 404 | as expected | PASS | script | none | Production | 43dcb60 (morning) / 430ad59 |
| SEC-02 | R-SEC | Twin token scope (no cross-attempt) | Student | attempt | `/ws/twin` | 1 connect with other attempt token | reject | Twin close | Twin unit tests; not run on Production | NOT RUN | CI | none | — | — |
| SEC-03 | R-SEC | No secrets in repo/logs | Dev | — | — | scan | none | CI secret scan | as expected | PASS | CI | none | Production | 43dcb60 (morning) / 430ad59 |
| SEC-04 | R-SEC | Rollback guard refuses rollback after migration S | CI | — | workflow | dispatch | guard blocks | job result | run 45970542970 `rollback-guard` skipped (forward deploy); guard tested in CI | PASS (CI) | CI | none | Production | 43dcb60 (morning) / 430ad59 |
## IOT / SAFE (physical = NOT RUN)
| ID | Req | Objective | Actor | Pre/Data | Navigation | Steps | Expected | API/DB verify | Actual | Status | Evidence | Cleanup | Environment | Tested revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IOT-01 | R-IOT | Edge connects with mTLS, Shadow fresh | Edge | cert ACTIVE | — | 1 start R1 | Shadow connected, age <15 s | `shadow/get` | connected, ~2 s | PASS | IOT readiness doc | none | Production | 43dcb60 (morning) / 430ad59 |
| IOT-02 | R-IOT | Command → ack/status/telemetry correlation | Edge | — | — | 1 WF03 run | correlated by commandId | events | status + telemetry correlated; ACK arrives after executing (D-04) | PASS with defect D-04 | wf03_final.json | none | Production | 43dcb60 (morning) / 430ad59 |
| IOT-03 | R-IOT | Reconnect / disconnect behaviour | Edge | — | — | 1 kill R1 2 restart | readiness stale then fresh | Shadow | earlier reboot showed stale 3.6 h → fresh after restart | PASS (observed) | session log | none | Production | 43dcb60 (morning) / 430ad59 |
| IOT-04 | R-IOT | Desktop runtime replaces R1 with same identity | Edge | Codex | — | stop R1, start Desktop | one client only | CloudWatch | tomorrow | NOT RUN | — | — | — | — |
| IOT-05 | R-IOT | Physical adapter `so101_follower` | Edge | leader/follower | — | — | executes steps | — | not implemented in R1 (`adapter_mode_not_supported`) | NOT RUN | handoff §0 | — | — | — |
| SAFE-01 | R-SEC | Physical Emergency Stop | Operator | hardware | — | — | motion halts | — | physical | NOT RUN | — | — | — | — |
| SAFE-02 | R-SEC | Safe-stop confirmation (`edgeStopUnconfirmed`) on end | Instructor | — | — | — | quarantine until edge confirms | session state | DB specs; not run on Production | NOT RUN | CI | — | — | — |
| SAFE-03 | R-SEC | Arm only by local operator action | Operator | hardware | — | — | `armed=false` after connect | Shadow | tomorrow | NOT RUN | — | — | — | — |
| SAFE-04 | R-SEC | First physical motion limited, one pair | Operator | — | — | — | — | — | tomorrow | NOT RUN | — | — | — | — |

## Detailed procedures for the thin rows (execute with designated accounts only)
**LMS-01 / ASSIGN / course delivery** — Pre: published course in class `9c09e27d…`, student enrolled. 1 Student opens My Learning → course. 2 Open module → lesson; media loads (presigned URL). 3 Mark activity complete. Expect: progress bar advances; `GET /me/...progress` reflects it. Actual: NOT RUN on Production (local acceptance only).
**QUIZ-01..03** — Pre: module with mini-quiz at module end (weights shown before submit), single- and multiple-choice items, pass threshold. 1 Student opens the module end. 2 Confirm weights visible. 3 Submit all-correct → pass + feedback. 4 Submit partially wrong multiple-choice → partial/zero per rule. 5 Score below threshold → fail state. Expect per approved rules; Verify `quiz attempt` rows. Actual: NOT RUN on Production.
**Course Builder / Question Bank / Excel import** — Instructor creates course → module → lesson → media upload → quiz from Question Bank; imports an XLSX of questions (preview, mapping, validation errors listed) ; publishes. Expect: draft→published, student sees it. Actual: NOT RUN on Production.
**Gradebook / analytics** — Instructor opens class gradebook; row for VTEST112701 shows 9/10 for `64b58103…`. Actual: not opened in the UI; API verified.
**WF01** — 1 System Admin confirms entitlement+allocation. 2 Instructor `/teacher` → class → Start Lab Session. 3 Student eligibility `GET …/physical-execution-eligibility` → eligible. 4 End Lab Session. 5 Eligibility → `LAB_SESSION_NOT_ACTIVE`. DB: reservation `active→released`. Actual 2026-11-27: PASS (`43dcb60`, repeated `430ad59`).
**WF02** — 1 Student starts attempt (`POST /classroom-assignments/:id/attempts`). 2 Program + version. 3 Schematic run. 4 Symbolic check. 5 Submit. Actual `430ad59`: PASS (attempt `92c7780c…`).
**WF03** — 1 Lab Session active. 2 Student ticks the 3 simulation confirmations, clicks Confirm & Run Local Simulation. 3 Poll `GET /me/physical-executions/:id` until `succeeded`. 4 Check events. 5 Open Twin (attempt scope). 6 List artifacts. Expect: events incl. ack, executing, completed; Twin frames carry the robot UUID and run sequence; artifact retrievable. Actual `430ad59`: steps 1–4 PASS; step 3 returns 500 after success (D-08); step 5 shows fixture frames (D-09); step 6 empty (D-03).
**WF04** — 1 Instructor opens submission. 2 Opens evidence (BLOCKED by D-03). 3 `POST /submissions/:id/assessment` with scores. 4 Feedback. 5 Release. 6 Student opens Assignments → Completed. Actual `430ad59`: 1,3–6 PASS (9/10), 2 NOT RUN.
