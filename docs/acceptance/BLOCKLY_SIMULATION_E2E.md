# Blockly → simulation → grading → review → release (end-to-end, local)

Spec: `web/robot-edu/tests/e2e/blockly-simulation.spec.ts`. Real Chromium, real Education API as the restricted
`vista_app_runtime` role, disposable PostgreSQL 17, local JWKS signer. Fixture: the WF-03 local fixture (seeded
"Robotics Fundamentals" course, challenge **Reach Target A**). Result: **3/3 consecutive passes (≈22 s each)**.

Run (see `docs/operations/phase-2-4-3-local-acceptance.md` for the stack): `VISTA_E2E_WF03_FIXTURE_FILE=/tmp/vista-wf03-e2e-fixture-*.json
VISTA_E2E_API_BASE_URL=http://127.0.0.1:3001/api/v1 VISTA_E2E_JWKS_PORT=54323 npx playwright test tests/e2e/blockly-simulation.spec.ts`.

## Journey and what each step proves

| # | Requirement | How it is exercised | Evidence asserted |
|---|---|---|---|
| 1 | Instructor creates a Blockly assignment | `GET /classrooms/:id/delivery-options` → pick the **Reach Target A** challenge → `POST /classrooms/:id/assignments {lessonId, challengeId}` → `PUT …/rubric` (6 + 4 points) → `POST …/publish`. Authoring is by API here; the instructor *UI* authoring path is covered by `lms-assignment-grading.spec.ts`. | 201 on create, rubric saved, delivery id returned |
| 2 | Student opens the assigned workspace | Browser opens `/practice/:attemptId` after `POST /classroom-assignments/:id/attempts` | assignment title heading + Blockly SVG |
| 3 | Student builds a program | **Mouse drag-and-drop** from the real flyout: start → `use left arm { home → move to x240 y220 z120 → wait }`; number fields edited in the editor widget | main-workspace block count 1→2→3→4→5 |
| 4 | Program validated | *Validate* button | "valid and ready for server evaluation" |
| 5–6 | Saved and version persisted | *Save version* | `POST /me/programs/:id/versions` → 201 (immutable `learning_program_versions`) |
| 7 | Execute supported actions in simulation | *Run simulation* → browser SO-101 preview + server schematic experiment | `POST /me/experiments/:id/evaluate-symbolic` → 201 |
| 8 | Results recorded | persisted experiment + symbolic evaluation | verdict `passed`; UI heading "Simulation Passed"; experiment `execution_mode = schematic` |
| 9 | Automatic grading where appropriate | server-side symbolic rules (`ordered_actions`, `preview_target_match`) | rule results listed in the instructor review |
| 10 | Final submission is immutable | *Submit assignment* → confirm | `POST /me/attempts/:id/submission` → 201 `submitted`; a second submission is refused (400/409/422); grade not visible while unreleased |
| 11 | Instructor reviews evidence | `/teacher/classes/:classroomId/submissions/:id` | program JSON (exact canonical steps), symbolic evaluation PASS with both rules, schematic experiment lifecycle |
| 12 | Assess, feedback, release | UI: points 6 + 3, overall feedback, *Send feedback*, *Release grade & feedback* | grading API `released:false` → `true`, scores `[3, 6]`, feedback text |
| 13 | Student sees the released result; isolation | student grading API + `/my-learning/:id` "Graded"; classmate and foreign-school teacher | peer and foreign teacher get 403/404 |

## Defect found and fixed

A delivery created from a curriculum challenge (the normal instructor path) stored `constraints = {}` and `allowed_blocks =
[]`. The practice page then offered only the generic toolbox (Program/Gripper/Timing), so **Reach Target A was unsolvable**
(`ORDERED_ACTIONS_INCOMPLETE`, observed in the first E2E run). `LearningService.createAssignment` now copies the canonical
assignment's `allowed_blocks` and `constraints` (`kind: symbolic_program`, target) when `challengeId` is supplied. Covered by
a unit test in `learning.service.spec.ts` and by this E2E. Production still has the defect until this branch is released.

## Boundaries (do not over-read this result)

* "Simulation" = in-browser SO-101 preview plus the server's **schematic** symbolic evaluator. It is not physics, not MuJoCo,
  and not the Digital Twin. The experiment is stored as `schematic`, never as physical execution.
* Physical execution of the same program (WF-03) is a separate path and was verified only with the fake follower.
* Authoring the assignment used the API; browser drag-and-drop covers the student side only.
* Not covered: the Blockly "Vision/AI" blocks (disabled and rejected by the generator by design), both-arm programs
  (no canonical concurrency semantics), mobile/touch drag.
* Production has not been exercised with this journey; no Production fixtures were created.
