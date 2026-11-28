# Owner decisions — WF-01 … WF-04 (grouped; nothing here is implemented unless stated)

Exactly four workflows; no WF-05. "Approved" = repository activity diagrams / gate documents. Detailed definitions: `WF01_WF04_DEFINITION_PACKAGE.md`; rubric detail: `RUBRIC_COMPATIBILITY_MATRIX.md`.

## WF-01 — School Administration & Robot Resource Allocation
| ID | Current implementation | Approved requirement | Proposed change | Open decision | Affected components | Recommendation | Acceptance criteria |
|---|---|---|---|---|---|---|---|
| W1-1 (= D-11) | Legacy `PUT …/robot-allocation` **adds** an allocation (many-to-many since migration S); `allocated_robot` = first | "Create Classroom Robot Allocation" (diagram); old doc said one robot per classroom, replaced on re-allocate | none | Keep PUT = add (documented), or restore "replace" for PUT only? | `education-admin.controller/service`, `lms-independent`/`digital-twin-*` specs | Keep "add"; deprecate PUT in favour of POST/DELETE; update the baseline doc | spec and doc state one behaviour; Twin revocation only on removal |
| W1-2 | Lab Session (instructor reserves the robot; 120 min default, +5–60, ≤480 total) shipped as a *refinement* of WF-01/WF-03 | refinement note: "not a new workflow" | none | Is the Lab Session part of the final WF-01 definition? Are the limits right? | `lab-session.service`, `LabSessionPanel` | Treat as WF-01 refinement; keep limits | owner signs the refinement text in `wf-01-robot-resource-allocation.md` |
| W1-3 | Force End by School Admin (reason ≥5, confirmation) | refinement | none | Should System Admin also Force End? | `lab-session.service` | No (keep tenant boundary) | unchanged |

## WF-02 — Learning & Assignment Management
| ID | Current | Approved | Proposed | Open decision | Components | Recommendation | Acceptance |
|---|---|---|---|---|---|---|---|
| W2-1 | WF-03 needs a *submitted* submission; attempt becomes `evaluated` after submit | diagram: submit then (WF-03) run | none | Allow the robot run before final submission? | `physical-execution.service`, `programming.service` | Keep (evidence anchors on the submission); Twin scope already handles it (#262) | WF-03 spec passes unchanged |
| W2-2 | Symbolic FAIL does not block submission; blocks WF-03 | not specified | none | Should FAIL block submission? | `programming.service` | No | unchanged |
| W2-3 | Basic courses: Blockly assignments without Robot Lab; Advanced: simulation/lab | product rules (`VISTA_PRODUCT_RULES.md`) | none | Confirm Basic path is part of WF-02 | `StudentAssignmentDetail`, eligibility | Confirm | Basic class never offers a robot run |
| W2-4 | Rubric per assignment: title, description, max points; locked after the first score; `assignment_type` ∈ knowledge, quiz, blockly, simulation, robot_lab, manual_final; `grading_method` ∈ automatic, manual, mixed | rubric spec v0.1 (proposed) | level descriptors (4) per criterion; "apply template" presets (weights ×3,×2,×1…) | Approve descriptors storage (JSONB column, migration T) or keep them in `description`; approve template weights | `learning_rubric_criteria`, `assignment-config.service`, `TeacherAssignmentEditor` | Approve migration T (additive, nullable) | instructor edits 4 descriptors; student sees them before submission |
| W2-5 | `grading_method='mixed'` has no combination rule | none | none | Define or forbid `mixed` | `assignment-config` | Forbid until defined (no invented weighting) | API rejects `mixed` for rubric assignments or the rule is written |

## WF-03 — Robot Experiment Execution
| ID | Current | Approved | Proposed | Open decision | Components | Recommendation | Acceptance |
|---|---|---|---|---|---|---|---|
| W3-1 | Attempt-bound Twin scope: in-progress attempt, or owner of a run ≤30 min old (#262, merged, not deployed) | "Return status + telemetry" | none | Should a student view the Twin before starting a run? | `digital-twin-scope.service` | No (needs a run) | after deploy: frames carry robot UUID/controller/sequence, no `offline-fixture` |
| W3-2 | Evidence: JSON telemetry artifact in S3 after success; run `succeeded` even if evidence storage fails (`evidence:'unavailable'`) | "Store result + evidence" | none | Is a run without evidence acceptable? Size/retention cap? | `experiment-evidence.service` | Acceptable but flagged; keep 1 MB cap | IAM applied → artifact present; failure → truthful state, no 500 |
| W3-3 | Robot-wide Twin scope retained (staff/Robot Lab preview, may show labelled fixture) | none | none | Restrict to staff only? | `digital-twin-scope.controller`, `RobotLab` | Keep for preview; never used for a run panel | run panel uses attempt scope only |
| W3-4 | ACK/status ordering race (D-04) | EDGE §7 | accept late ACK once | none (engineering) | `iot-feedback.repository` | CC-2 | `iot_ack_acknowledged` exactly once in any order |
| W3-5 | R1 simulation only; Desktop/physical not implemented | EDGE contract | CX-1…CX-6 | none tonight | Desktop repo | follow handoff | physical cases NOT RUN until commissioning |

## WF-04 — AI/Data Integration & Teacher Review
| ID | Current | Approved | Proposed | Open decision | Components | Recommendation | Acceptance |
|---|---|---|---|---|---|---|---|
| W4-1 (= D-06) | API releases with any assessment or feedback; UI saves only fully scored rubrics | review → assessment → feedback → student sees | 409 `RUBRIC_INCOMPLETE` unless every criterion graded (0 valid, null blocks); non-rubric unchanged ([#263](https://github.com/SKYNET-Thesis/se/pull/263) draft) | Approve? | `assessment.service`, db spec `assignment-grading-lifecycle` | Approve | release of a partial rubric → 409; complete/non-rubric → 201; quizzes unaffected |
| W4-2 | Direct-point entry; no level selector | rubric spec | level 4/3/2/1/0 selector, points = level × max/4 (no schema change) | Approve selector UX and the "level 0" rule | `TeacherSubmissionReview` | Approve | selecting a level writes the same `awarded_points`; legacy rubrics still accept points |
| W4-3 | Partial draft impossible in UI | spec: draft may be incomplete | allow partial save, gate release | Approve | UI only | Approve | partial save OK; release blocked until complete |
| W4-4 | `attempt.score` null for rubric grades; student list sums scored rows; **canonical `summary` now returned by the API (PR #265)** | none | write `attempt.score` = rubric percentage at release? | Persist or compute only? | `assessment.service`, Gradebook queries | Compute only; no migration; Gradebook reads the same function | UI, API, list and Gradebook show identical %, /10, rating |
| W4-5 | No rubric Gradebook (learner progress shows best auto-graded score) | none | read-only rubric % in submissions list and learner progress | Approve scope (no course-level aggregation) | `learning-insights.service` | Approve minimal | per-assignment rubric % visible to the instructor |
| W4-6 | Reopen released grade: instructor with review+assess, reason, audited; auto grades not reopenable | refinement | none | Who may reopen? | `assessment.service` | Keep | unchanged |
| W4-7 | Performance rating thresholds (≥90/80/70/50) | previously defined | implemented as display only | none | `rubric-score.ts`, web | — | independent of pass threshold |
| W4-8 | Safety-based grade cap | none | none | Needed? | — | No (not approved) | none |

## Cross-cutting
- **Freeze** needs W4-1 decided (approve or explicitly defer), W1-1 answered, migration T approved or deferred. Until then Web Freeze = PENDING.


## Status after the owner's policy approval (2026-11-28)
| ID | Decision / status |
|---|---|
| W4-1 (D-06) | **Approved and implemented** (develop; Production verification pending release) |
| W4-2 | **Approved** (levels 4,3,2,1 and explicit 0; level 0 = graded with zero points). Implemented in **draft #272** (needs migration T) |
| W4-3 | **Approved and implemented** (partial drafts; UI saves entered criteria only) |
| W4-4 | **Approved**: canonical computation only; `attempt.score` never overwritten (implemented) |
| W4-5 | **Approved**: Gradebook shows quiz and rubric results (implemented, #271) |
| W2-4 | **Approved**: four configurable templates and 4 descriptors per criterion; descriptor storage = migration T (draft #267/#272), release timing pending |
| W2-5 | **Approved**: no NEW mixed-grading configurations; existing mixed records preserved (implemented, #274) |
| D-16 | **Approved**: multiple-choice exact match, no partial credit |
| W1-1 (D-11) | **Still open** — `D11_LEGACY_ALLOCATION_PUT_OWNER_REVIEW.md` |
| Other W1-2…W3-5 | unchanged / open |
