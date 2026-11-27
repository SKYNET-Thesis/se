# Rubric specification vs implementation — compatibility matrix and grading policy (2026-11-27)

Specification: `VISTA_Assessment_Rubrics.docx` v0.1 ("Proposed policy — owner review required"; file in the owner's checkout `se/docs/rubrics/`). Nothing in it is treated as approved. Implementation inspected on `develop` `e245aa8`.
Labels: **EXISTING** (works today) · **DEFECT** · **PROPOSED** (spec) · **CHANGE** (implementation needed) · **APPROVAL** (owner decision/ migration needed).

## 1. Compatibility matrix
| # | Specification item | Existing implementation | Status | Required change | Approval |
|---|---|---|---|---|---|
| 1 | Quiz = existing weighted auto-grading only, no manual rubric | Quiz attempts graded server-side (`progression.service` writes `attempt.score` %, `result_snapshot`, auto-released `grading_release_origin='system_auto'`); `PUT rubric` on a quiz → 409 `QUIZ_HAS_NO_RUBRIC`; auto-graded results cannot be reopened | **EXISTING** | none | none |
| 2 | Four assessment kinds map to templates (Blockly, Simulation, Physical, Final) | `learning_assignments.assignment_type` already allows `knowledge, quiz, blockly, simulation, robot_lab, manual_final`; `grading_method` ∈ `automatic, manual, mixed`; `pass_score numeric` | **EXISTING** (types) | none; a template is just a preset of criteria for the matching type | none |
| 3 | Configurable criteria (name, descriptor, weight) | `learning_rubric_criteria(title, description, max_points>0, ordinal)`; authoring `assignment-config.service` (PUT rubric), locked once any score exists (`RUBRIC_IN_USE`); one rubric per assignment, not per delivery | **EXISTING** | none for name/description/max | none |
| 4 | **Weight** w per criterion, max = 4 × w | Not a column. **Expressible**: `w = max_points / 4` | **EXISTING (derived)** | none | none |
| 5 | **Four level descriptors** per criterion (4/3/2/1 text) | No storage. `description` is one free-text field | **GAP** | additive nullable `descriptors jsonb` (4 strings) on `learning_rubric_criteria` **or** keep descriptors inside `description` by convention | **APPROVAL** (schema, migration T via Production Database Release) |
| 6 | Instructor selects level 4/3/2/1/0; points = level × w | UI enters **direct points** in a text box per criterion (`SubmissionReviewDetail`, `buildAssessmentScores`); API stores `awarded_points` 0…max; no level stored | **GAP** | UI level selector writing `level × max/4` into the existing `awarded_points` (no schema change); optional nullable `level smallint` on scores to remember the chosen level | **APPROVAL** for storing `level` (schema); selector alone needs none |
| 7 | Explicit zero vs ungraded (null) | DB check `awarded_points >= 0`; ungraded = no row; UI box blank vs `0` | **EXISTING** (data); UI blank/0 distinct | UI must show "Not graded" vs "0" explicitly | none |
| 8 | Total % = Σawarded/Σmax; score/10; rating | Instructor UI totals use ALL criteria max (`scoreTotals`). **Student released view** summed only *scored* criteria (so 3/4 looked like 3/4, and a skipped criterion vanished). **`attempt.score` is `null` for rubric grades** (only quizzes write it) while the student assignment list derives `assessment_score/assessment_max` from scored rows | **DEFECT** (inconsistent sources) | **Done (this PR #265):** canonical server-side `summary` {awarded, max, percentage, scoreOutOf10, rating, gradedCriteria, totalCriteria, complete} computed from every criterion; student panel shows it; ungraded criterion flagged | none (additive, nothing persisted) |
| 9 | Examples 6/6+3/4=9/10=90 % and 31/36=86.11 %=8.61/10 | not verified before | **VERIFIED** | spec vectors added in `rubric-score.spec.ts` (all levels, 0 vs null, bounds, template maxima 36/40/48/40) | none |
| 10 | Ratings ≥90/80/70/50 | not implemented anywhere | **CHANGE (done in #265)** `rubricRating` | none | none (thresholds previously defined) |
| 11 | Release gate D-06: every mandatory criterion scored (0 valid, null blocks); draft may be incomplete | API: **no gate** (any assessment or feedback releases; `assess` accepts a partial subset). UI already blocks saving an assessment unless every criterion has a value, so the hole is API-only | **DEFECT/PROPOSED** | [draft #263](https://github.com/SKYNET-Thesis/se/pull/263): 409 `RUBRIC_INCOMPLETE`; must also update `assignment-grading-lifecycle.db.spec` (currently releases with feedback only) | **APPROVAL** (policy) — not merged |
| 12 | Draft grading saved before release | `POST assessment` upserts; UI requires all criteria for a save → **no true partial draft in the UI** | **GAP vs spec** | allow saving a partial draft in the UI (API already accepts a subset); release stays gated | APPROVAL (UX policy) |
| 13 | Student sees published rubric before submission | `StudentAssignmentDetail` shows a "Grading rubric" section (title, description, max points) for rubric assignments | **EXISTING** (no level descriptors until row 5) | none | none |
| 14 | Released grades remain locked; reopen is audited | `GRADE_RELEASED` 409; `grading/reopen` with reason; auto grades not reopenable | **EXISTING** | none | none |
| 15 | Historical grades untouched | all changes additive; no migration; legacy direct-point rubrics keep working (level selector computes the same `awarded_points`) | **PRESERVED** | none | none |
| 16 | Gradebook consistency | There is **no rubric Gradebook**. "Learner progress" shows lessons, attempts and **best auto-graded `attempt.score`** (`learning-insights.service`); instructor Submissions list shows assessed/released counts only | **GAP** | [PROPOSED] show the rubric `summary` percentage in the instructor submission list and learner progress for rubric assignments (read-only query using the same `summarizeRubric` rule); do not write `attempt.score` for rubric attempts unless approved | **APPROVAL** (whether `attempt.score` should carry the rubric percentage) |
| 17 | Safety: grading never authorizes motion; no physical evidence from mock/simulation; safety grade cap needs approval | grading code touches no runtime; evidence classification `SIMULATION`/`MOCK_RUNTIME` preserved; no cap implemented | **EXISTING** | none | any cap = approval |
| 18 | Rubric configurable, not a global hard-coded rubric | rubric per assignment, authored by the instructor | **EXISTING** | "apply template" preset action (client-side fill of criteria with spec weights/descriptors) | APPROVAL of template weights |

## 2. Canonical score contract (proposed, partly implemented)
- **Source of truth for rubric grades:** the stored `awarded_points` per criterion against `max_points`; the *only* derived values are computed by `summarizeRubric` (`services/education-api/src/modules/learning/rubric-score.ts`): `awarded`, `max` (all criteria), `percentage` (2 dp), `scoreOutOf10` (= percentage/10, 2 dp), `rating`, `complete`.
- **Auto-graded (quiz/knowledge check):** `attempt.score` percentage — unchanged.
- **Do not double count:** an assignment has either an auto result (`attempt.score`) or a rubric summary; `grading_method='mixed'` has no defined combination rule today → **[OWNER DECISION]** (no invented weighting).
- **Why `score` was null with "9/10" in the student UI:** only auto-grading writes `attempt.score`; the student list computed `SUM(awarded)/SUM(max of scored rows)`; the grading DTO returned the null column. Fixed by exposing the canonical `summary`.

## 3. Smallest compatible schema proposal (owner approval; NOT implemented)
Migration T (additive, nullable, no data rewrite, via Production Database Release): `ALTER TABLE learning_rubric_criteria ADD COLUMN descriptors jsonb` (array of 4 strings, check `jsonb_array_length = 4` when present); optional `ALTER TABLE learning_assessment_scores ADD COLUMN level smallint CHECK (level BETWEEN 0 AND 4)`. Without them everything else in this matrix still works (levels derived as `points / (max/4)`). Existing rows stay valid (NULL = legacy direct-point).

## 4. Implementation status
| Item | Status |
|---|---|
| Canonical summary + ratings + level helper + spec vectors | **Implemented** in PR #265 (tests: 6 rubric-score, student panel, release/grading specs) |
| Student released grade shows %, /10, rating, ungraded flag | **Implemented** (#265) |
| D-06 release gate | **Prepared, not approved/merged** (#263 draft; db spec to update on approval) |
| Level selector + descriptor table UI (instructor), student rubric preview | **Not implemented** — waits on matrix rows 5, 6, 12 decisions; no UI built to avoid a second grading contract |
| Gradebook rubric column | **Not implemented** (row 16 decision) |
| Quiz auto-grading verification | see `REGRESSION_REPORT_20261127.md` and §5 |

## 5. Quiz auto-grading (preserved, verified locally)
Playwright `lms-module-quiz` and `lms-unlock-rule` (weighted quiz fail → module two locked, passing retake unlocks), `qb-import` (weights, single/multiple choice), Vitest `QuizResultDashboard.spec` (weighted score, earned/max, PASS/FAIL, rating, counts), `progression`/`quiz` Jest suites. Multiple-choice partial-credit rules were **not changed**. Production quiz acceptance remains NOT RUN (needs approved test content).
