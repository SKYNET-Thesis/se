# UI route audit (2026-11-27 late) — develop `2d0b260` + this branch

Method: 33 in-scope routes captured on the isolated local stack with synthetic fixtures (real API, local JWKS identities, RBAC enforced — no bypass), at 1440 × 900 and 390 × 844 for the review pass, and at 1440 / 1280 / 768 / 390 for the final pass (`web/robot-edu/tests/e2e/ui-screens.spec.ts`, `VISTA_SHOT_WIDTHS`). Before = develop (already containing #261); After = this branch. Raw sets: `/tmp` only (136 images); committed pairs for every materially changed page: `docs/acceptance/screenshots/ui-polish-r2/` (11 pairs) and the earlier `ui-polish/` (9 pairs).
Design rules kept: existing teal accent palette, warm off-white canvas, light theme; no dark mode; no new components; no API/route/RBAC/test-selector changes. **The public landing page is an existing dark composition — it was left unchanged, not introduced by this work.**
Paper MCP: tools are listed but every call returns "Paper account setup is incomplete" (credentials in this session were issued before account setup; the owner must **re-authenticate Paper MCP** — log out and authenticate again, reconnect alone does not refresh the token). Paper was therefore **not used**; no Paper design reference exists. Taste skill: read as guidance; applied through restraint (hierarchy, spacing, consistent cards) rather than new aesthetics.

| Route | Role | Visual issue found (before) | Improvement | Screenshot | Responsive (1440/1280/768/390) | Status |
|---|---|---|---|---|---|---|
| `/` (public) | anon | existing dark marketing page | none (existing identity preserved) | public-home | captured, no overflow asserted by `website-public-smoke` | Reviewed, unchanged |
| `/login` | anon | hero footer sentence unreadable where it overlaps the robot image | dark-teal backing panel, larger measure | `before/after-login-1440` | captured | **Improved** |
| `/forgot-password` | anon | none (centered card, clear hierarchy) | none | forgot-password | captured | Reviewed, meets standard |
| `/admin/organizations` | System Admin | none material | none | admin-organizations | captured | Reviewed |
| `/admin/robots` | System Admin | model/serial wrapped mid-token | no-wrap + mono serial (earlier round) | `ui-polish/*admin-robots*` | captured | **Improved** |
| `/admin/students` | System Admin | sparse until a school is selected | none (state is intentional) | admin-students | captured | Reviewed |
| `/admin/courses` | System Admin / Instructor | none material (stat tiles + table) | none | admin-courses | captured | Reviewed |
| `/admin/courses/:id?tab=curriculum` (Course Builder) | System Admin | none material; dense but organised (outline, editor, preview) | none | admin-course-builder (fixture fixed: admin owns the seeded global course) | captured | Reviewed |
| `/school` (overview) | School Admin | heavy grey stat tiles inconsistent with white cards | white bordered tiles, tabular numerals | `before/after-school-home-*` | captured | **Improved** |
| `/school/users` | School Admin | action column cramped | none this round | school-users | captured | Reviewed (follow-up: widen actions) |
| `/school/classrooms`, `/school/classrooms/:id` | School Admin | none material | none | school-classrooms, school-classroom | captured | Reviewed |
| `/school/offerings`, `/school/courses` | School Admin | none material | none | school-offerings, school-courses | captured | Reviewed |
| `/teacher` | Instructor | grey stat tiles and unframed class cards | white cards, hover border, accent-ink links, tabular numerals | `before/after-instructor-home-*` | captured; 390 stacks to one column | **Improved** |
| `/teacher/classes` | Instructor | grey class cards, oversized title and gaps | card tokens, balanced title scale, footer rule | `before/after-instructor-classes-*` | captured | **Improved** |
| `/teacher/classes/:id` | Instructor | mixed flat/heavy sections | consistent cards for Robot Resource, Students, Assigned learning, Submitted results (earlier round) | `ui-polish/*instructor-class*` | captured | **Improved** |
| `/teacher/assignments`, `/new` | Instructor | none material | none | instructor-assignments, instructor-assignment-new | captured | Reviewed |
| `/teacher/quizzes`, `/teacher/submissions`, `/teacher/challenges` | Instructor | none material (clear empty states) | none | instructor-quizzes/-submissions/-challenges | captured | Reviewed |
| `/` (dashboard), `/courses` | Student | none material | none | student-dashboard, student-courses | captured | Reviewed |
| `/my-learning` | Student | none material | none | student-my-learning | captured | Reviewed |
| `/catalog`, `/learning-path` | Student | none material | none | student-catalog, student-learning-path | captured | Reviewed |
| `/courses/:id` | Student | course title oversized (up to 56 px) dominating the page | clamp 28–40 px, tighter tracking | `before/after-student-course-*` | captured | **Improved** |
| `/courses/:id/lessons/:id` | Student | stray white strip below the outline card (aside background) | transparent aside on desktop (earlier round) | `ui-polish/*student-lesson*` | captured | **Improved** |
| `/assignments` | Student | oversized card title on mobile | responsive title scale (earlier round) | `ui-polish/*student-assignments-390*` | captured | **Improved** |
| `/studio` | Student | none material (Blockly workspace, preview panel) | none | student-studio | captured | Reviewed |
| `/ai-registry` | Student | none material | none | student-ai-registry | captured | Reviewed |
| `/account` | Student/Staff | unframed fields, weak grouping | identity and password grouped in cards | `before/after-student-account-*` | captured | **Improved** |
| `/lab` (Robot Lab) | Student | none material; honest "not configured" states, no fabricated telemetry | none | robot-lab | captured | Reviewed |
| Student run panel (WF-03) | Student | no Digital Twin in the run panel; success text claimed evidence unconditionally | attempt-scoped Twin panel; truthful evidence text (#262) | — (needs a live run; covered by `digital-twin-*` specs) | — | **Improved (functional)** |

**Not captured / not reviewed visually (no data or route in the fixture):** quiz taking and quiz result views, assignment detail/submission screens, rubric scoring and evidence viewer, gradebook, Question Bank, Excel import wizard, Learning Media upload, Quiz Builder. These are covered functionally by Playwright (`lms-module-quiz`, `lms-assignment-grading`, `qb-import`, `lms-lesson-media`, `lms-authoring`) but **no new visual review was done for them**; listed as follow-up, not claimed.


## Addendum — deep pages (2026-11-28, previously unreviewed)
Captured on the isolated stack with synthetic fixtures at 1440 and 390 px (`tests/e2e/ui-screens-deep.spec.ts`); images in `docs/acceptance/screenshots/ui-deep/`.
| Page | Role | Finding | Change | Responsive | Status |
|---|---|---|---|---|---|
| Student quiz landing (`…/activities/:quiz`) | Student | clear start card, "what to expect" panel | none | 1440/390 reviewed | Reviewed, meets standard (quiz **taking** and **result** views need an in-progress quiz attempt: covered by `lms-module-quiz`, not re-photographed) |
| Student reading activity | Student | clean | none | reviewed | Reviewed |
| Student assignment detail | Student | rubric list had no total | "Total: N points" under "How this is graded" | reviewed | **Improved** |
| Instructor submissions list | Instructor | clear stats and table | none | reviewed | Reviewed |
| Instructor submission review + **rubric scoring** | Instructor | criterion rows lacked description, a points field detached from its criterion, no ungraded cue, no running total | criterion cards with description, points beside the criterion, **"Not graded" vs "x of N"**, live total / percentage / score of 10 / rating (twin of the API contract) | reviewed at 1440 and 390 (stacks cleanly) | **Improved** |
| Course Builder (curriculum, details, media library, settings) | Admin | dense but organised | none | reviewed | Reviewed |
| Quiz Builder (info + **Questions / Question Bank** tab) | Admin | clear; points per question visible | none | reviewed | Reviewed |
| Excel/CSV **Import wizard** dialog | Admin | not captured (button inside the Questions tab opens the dialog; automation did not reach it) | — | — | **NOT reviewed visually** (functionally covered by `qb-import`, `global-course-question-authoring`) |
| Evidence viewer, **Gradebook** | — | no rubric Gradebook exists; evidence panel shows "No persisted experiment evidence" for the fixture | — | — | Gradebook: **not applicable/gap** (decision W4-5); evidence viewer with a real artifact: NOT captured (needs a WF-03 run) |


## Addendum 2 (2026-11-28) — remaining visual reviews (screens actually reached by automation; images in `docs/acceptance/screenshots/ui-final/`)
| Screen | Evidence | Result |
|---|---|---|
| Excel/CSV **Import questions** wizard (dialog: template links, file picker, disabled "Import 0 valid questions" until a valid preview) | `builder-import-wizard-1440/390.png`; the filled wizard (mapping, default points, draft, confirmation checkbox) is driven by `qb-pilot-import` UI test (passes) | Reviewed, meets standard (dialog is compact, keyboard reachable, same palette) |
| Quiz Builder Questions tab (Question Bank search, per-question points, quiz order) | `builder-quiz-questions-1440.png` | Reviewed |
| **Quiz result** (weighted score ring, PASS/FAIL, rating, points earned, pass mark, "exact match — no partial credit" note, question types, difficulty, objectives, suggested review) | `quiz-result-pass.png`, `quiz-result-fail.png` from `lms-module-quiz` | Reviewed, meets standard |
| **Evidence viewer with a real synthetic artifact** (instructor review of a WF-03 run on the local stack) | `wf03-instructor-evidence-review.png`, `wf03-student-run-result.png` | Reviewed |
| Rubric authoring (assignment editor "Grading rubric": criterion, description, max points, total) and rubric scoring (live summary) | visual-audit `teacher-assignment-edit`, deep `instructor-grading-panel` | Reviewed |
| Quiz **taking** (question page with weights/answers) | not photographed: the fixture's "practice quiz" activity resolves to an assignment landing; `lms-module-quiz` exercises the taking flow (weights visible, answers, submit, result) but takes no screenshot of it | **NOT visually reviewed** |
| Gradebook | no rubric Gradebook exists (decision W4-5) | gap, not reviewed |
Machine check: visual-audit `overflow.json` reports 0 px horizontal overflow on every captured LMS/teacher screen at 1440 and 390.
