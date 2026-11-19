# Web LMS completion and deployment handoff (2026-11-19)

Scope: the academic Web LMS only (robotics, CHECKIK, Digital Twin, VLA, IoT and Desktop were not touched in this sprint segment).
Branch `sprint/vista-90`; nothing pushed, merged or deployed; no Production data touched. Local evidence only: it does not establish new
Production acceptance.

## 1. Feature checklist (verified in source and UI before implementing)

| Area | State at start | State now | Evidence |
|---|---|---|---|
| School Admin (schools, classrooms, members, enrolment, isolation) | implemented | unchanged, re-verified | Playwright (lms-independent, security matrix, authoring, curriculum delivery via UI) |
| Instructor course builder (course → module → lesson → section → activity, media, quizzes, rubric, publish) | implemented | + level/tags/prerequisites fields | Playwright (see §4) incl. new specs |
| Student (My Learning, lessons, quizzes, assignments, Blockly, grades, feedback) | implemented | + level/tag filters, learning path page, assignment difficulty display | Playwright, Vitest |
| Quiz engine (weights, snapshots, pass %, attempt limits, retakes) | implemented | unchanged (no regressions) | Jest + DB suites, lms-unlock-rule, qb-import |
| Rubric grading, release, correction | implemented | unchanged | lms-assignment-grading |
| Learning media (single private bucket) | implemented | unchanged | lms-lesson-media, S3 integration earlier |
| **Course level** BEGINNER/INTERMEDIATE/ADVANCED | table existed, unused | **structured field, API + builder + catalog + path + badges** | migration P, `course-academic.ts`, lms-academic.spec |
| **Course tags** (multi, existing/suggested vocabulary, search/filter, duplicate prevention) | missing | **implemented** (max 10, 32 chars, case-insensitive de-dup) | unit + E2E |
| **Course prerequisites** | lesson-level only | **course-level** (≤5, same school or global, no self/cycle) | E2E (self 400, cycle 409, cross-school 400) |
| **Learning path** (BEGINNER → INTERMEDIATE → ADVANCED, completion, recommended next, locked reasons) | per-course lesson path only | **`GET /me/learning-path` + `/learning-path` page** | 3 unit tests + E2E |
| **Assignment difficulty / type / pass score / grading method / objectives** (independent of course level) | missing | **`GET/PATCH …/assignments/:id/academic`, instructor panel, student display** | unit + E2E |
| SO-101 curriculum | one legacy course | **3-course subset seeded idempotently** | data-pack spec (6), seeder run twice, E2E delivery |

## 2. What was NOT completed (honest list)

* **Prerequisites are guidance, not enforcement**: a course with unmet prerequisites shows "Locked – complete X first" on the path but an enrolled student can still open it (deliberate: avoids locking learners out of delivered content).
* **Catalog scope**: the catalog lists courses a student is enrolled in (and authored courses for staff). There is no public school-wide browse/enrol catalog.
* **Curriculum size**: 9 lessons / 30 questions / 3 module quizzes / 3 assignment templates / 0 practical labs, against the 18 / 180 / 9 / 6 / 6 target. The pack is a coherent beginner → advanced subset, not the target counts. See `ACADEMIC_CURRICULUM_COVERAGE.md`.
* **Seeded beginner Blockly template has no linked challenge**, so its `automatic` grading needs an instructor to bind a challenge when delivering it (the Blockly E2E with a challenge-bound assignment passes). The seeded quizzes were **not** taken through the browser (the quiz engine's own E2E covers attempts, weights and unlock rule).
* **Per-question weight display before submission** was not re-verified in the browser this session.
* Intermediate/advanced assignment *displays* are verified through the API/UI for difficulty and grading text; robot-lab assignments were not exercised (out of scope).
* Real-GoTrue student-auth Playwright suites were not run locally (Jest auth suites pass; Production evidence from earlier).

## 3. Acceptance by role (local, real PostgreSQL + API + browser)

* **School Admin**: delivers the seeded beginner course through the real UI (classroom, offering, members); cannot see/alter other schools.
* **Instructor**: creates/edits courses with level, tags, prerequisites; sets assignment difficulty/type/grading/pass score/objectives; validation errors are explained (400/409).
* **Student**: finds the course by level and tag filters, sees badges and tags, lesson list, learning path state and recommendation, assignment difficulty/grading/objectives.
* **Isolation**: other-school admin/student get 404/403 on the academic endpoints and course edits.

## 4. Test and build results

| Check | Result |
|---|---|
| Education API `tsc --noEmit`, `npm run build` | clean |
| Backend Jest incl. PostgreSQL suites (disposable DB) | 110 suites passed / 5 skipped (opt-in S3, IoT feedback, runtime-role probes); 1144 tests passed / 40 skipped |
| Frontend `tsc`, `vite build`, Vitest | clean; 97 files / 647 tests |
| Database tests (`tests/database`) | 372 run OK (93 skipped), incl. migration P ordering and unscoped-release assertions |
| Playwright LMS suite (14 spec files incl. digital-twin attempt scope; WF-03/real-GoTrue/visual excluded) | last full run **54 passed / 1 failed** of 55: the failure was my new `lms-academic` test picking the first catalog tile once seeded courses existed (test bug, fixed afterwards). After the fix `lms-academic` + `lms-curriculum` passed 5/5 twice. **The full suite was not re-run after that fix.** Before the curriculum seed the full run was 53/53 (49 prior + 4 new) |
| Playwright Blockly (real drag-and-drop, grading, release) | **1/1** (3/3 earlier) |
| Student temporary password | Jest suites (service, guard, rate limit, DB activation) pass; included in the 110 suites |

Skipped and why: S3 integration, IoT feedback DB and runtime-role security probes need extra opt-in infrastructure; WF-03 needs the robot-runtime stack (out of scope); `visual-audit` is a screenshot audit; real-GoTrue student-auth specs need the manual GoTrue harness.

## 5. Commits (on `sprint/vista-90`, base `eff03d6` = Production)

`87211ca` Twin/API earlier work · migration P `…level_tags_prerequisites_assignment_difficulty` · API (course academic, learning path, assignment academic) · web (badges, filters, builder fields, learning path, assignment panel) · tests (lms-academic, lms-curriculum) · curriculum pack + seeder. Use `git log eff03d6..HEAD` for exact SHAs; the head at hand-off is the latest commit.

## 6. Production deployment readiness (nothing deployed)

* **Required migrations (in order)**: `20261119_o_wf01_robot_allocation_permission` (only if WF-01 ships) and **`20261119_p_course_level_tags_prerequisites_assignment_difficulty`** (additive: seeds three `learning_levels` rows, adds `learning_courses.tags`, `.prerequisite_course_ids`, `learning_assignments.difficulty/assignment_type/pass_score/grading_method/learning_objectives`, two CHECK constraints, one GIN index; no new tables, so the migration-L runtime allowlist and grants are unchanged).
* **Ordering is a hard dependency**: the new API selects the new columns in raw SQL. **Apply P to Production before deploying this API**, otherwise `/courses`, `/me/learning-path` and assignment reads fail. Old API + migrated DB is safe (extra columns ignored).
* **Release scope**: O and P are in the manifest but have **no reviewed release scope** (`database/release-scopes.json`); the Production DB release runner will not apply them until a scope + runbook are reviewed and approved. K–L (and M) status is unchanged from earlier documents.
* **Environment changes**: none. **Feature flags**: none added (existing `STUDENT_TEMP_PASSWORD_ENABLED` unchanged).
* **Seed**: `seed-so101-curriculum` is for isolated databases only (guarded); importing curriculum into Production needs a separate approved procedure.
* **Rollback**: roll the API image back (previous image is compatible with the migrated schema); migration P columns/rows can stay unused; dropping them is optional and only after the old API is running.
* **Blockers**: reviewed release scope for O/P; approval for the DB release workflow; protected `aws-demo` deploy approval; a Production re-test plan with an isolated fixture school (the previous one is closed).

## 7. Honest Web LMS completion estimate

Feature completeness of the academic Web LMS ≈ **88 %** (all requested features exist and are locally verified; remaining: prerequisite enforcement policy, public catalog, extra browser coverage of seeded quizzes and weight display). Academic content ≈ **30 %** of the 18/180/9/6/6 target. Production acceptance of the new features: **0 %** (not deployed). Combined Web LMS readiness estimate ≈ **75–80 %**, separate from the robotics work and from the overall VISTA score (unchanged: 65.7 software / 53.6 five-dimension, because this segment does not change robotics evidence).
