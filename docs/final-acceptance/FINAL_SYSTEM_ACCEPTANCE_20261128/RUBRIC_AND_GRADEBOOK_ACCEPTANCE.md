# Assignment grading, rubric levels and Gradebook acceptance (2026-11-28)

Two separately tested revisions — do not merge their results:

| Track | Revision | Database | Release state |
|---|---|---|---|
| **Track 1 — grading as deployed-to-be (Option A)** | `develop` `eceb8d1` | fresh bootstrap (no Migration T) | merged in develop, **not in Production** (Production `430ad59`) |
| **Track 2 — rubric levels (Option B)** | PR #272 head `17c9c54710d3006ff0749c934eb29d92aa96b536` | fresh bootstrap **plus staged M, R and T** (`vista_test_fa_t`) | **DRAFT, unmerged; #267 (T) unmerged; #272 CI `fresh-bootstrap` red**. Rubric-level functionality is **not released and must not be described as released** |

The rubric specification (`VISTA_Assessment_Rubrics.docx` v0.1) is **not in the repository**: it is an untracked file in the owner's checkout (`se/docs/rubrics/`). Its text was read directly this cycle: templates Blockly 36, Simulation 40, Physical 48, Final 40; levels 4/3/2/1 and explicit 0; null = not graded; example levels 4,3,3,4,2 × weights 3,2,1,2,1 = **31/36 = 86.11 % = 8.61/10**; ratings ≥90 Excellent, ≥80 Good, ≥70 Satisfactory, ≥50 Needs Improvement, else Needs Review; "Proposed policy — owner review required".

## Track 1 — `eceb8d1`
| Requirement | Evidence | Status |
|---|---|---|
| Assignment authoring, student delivery, submission lifecycle | `lms-authoring` 5/5, `lms-assignment-grading` 1/1, `lms-beginner-lab` 1/1, jest `attempt-submissions.db`, `programming-assignment-authoring.db`, `instructor-assignment-management.db` | **PASS** |
| Instructor submission list, evidence review | `lms-assignment-grading` | **PASS** |
| Partial grading drafts; explicit zero vs ungraded | jest `assignment-grading-lifecycle.db.spec` (90/90 reported at merge; part of this cycle's green DB run); `rubric-score.spec` 6/6 | **PASS** |
| Mandatory rubric criteria; incomplete release rejected (409 `RUBRIC_INCOMPLETE`) | `assignment-grading-lifecycle.db.spec`; UI gates Release on a complete saved rubric | **PASS** (policy approved D-06; Production NOT RUN) |
| Feedback, release, released-grade locking (409 after release) | same spec; `assessment-release.service.spec` | **PASS** |
| Canonical score (`summary`: awarded/max/percentage/outOf10/rating) | `rubric-score.spec`, `rubricSummary.spec` (web); student list uses the same maximum (D-15 fix) | **PASS** |
| 31/36 = 86.11 % = 8.61/10 | asserted in `rubric-score.spec.ts:8` (API) and `rubricSummary.spec.ts:5` (web) | **PASS** |
| Student result, Gradebook consistency | `lms-assignment-grading` (student result + instructor view agree); Gradebook = quiz (auto) + rubric (canonical), read-only | **PASS** |
| Historical grade compatibility | direct-point legacy rubrics still accepted; `RUBRIC_COMPATIBILITY_MATRIX.md`; `assignment-compat.spec` | **PASS** |
| Automatic quiz grading independent; `attempt.score` not overwritten | `question-bank-quiz.snapshot.spec` ("grades all three types with exact match and assignment threshold"), `lms-module-quiz` 1/1; D-16 exact-match approved | **PASS** |
| **New mixed-grading configuration rejected** | `assignment-config.mixed.spec` (#274); UI hides the option; existing mixed records stay readable | **PASS** |
| Manual grading of the final assessment | `lms-assignment-grading` (instructor scores, feedback, release) | **PASS** |

## Track 2 — #272 `17c9c54`, database with Migration T
| Requirement | Evidence | Status |
|---|---|---|
| Migration T applies, is idempotent, additive | applied (after M and R) to a fresh bootstrap with `scripts/apply_staged_migration_to_test_database.py`; SQL reviewed: two nullable columns + CHECKs, no rewrite, rollback in the header | **PASS** (local) |
| Four configurable templates (36/40/48/40), four descriptors each | Vitest `rubricTemplates.spec` (inside `src/queries` 14 files / 71 tests, all pass) — template maxima match the specification text read above | **PASS** (unit) |
| Descriptors, level selector, editable weights, student preview, partial draft, release gate, 31/36, student + Gradebook agree, `attempt.score` untouched | **Playwright `rubric-levels-flow` 1/1** on the real browser + real API (`17c9c54`) + PostgreSQL with T: applies the Blockly template, asserts `[12,8,4,8,4]` maxima and a descriptor, student sees "Achievement levels for Program correctness", partial draft, release refused until complete (explicit level 0 counts), release, student result and Gradebook agree | **PASS** (local) |
| Backend level scoring | Jest DB `assignment-grading-lifecycle.db.spec` + assessment suites: 3 suites / 46 tests pass; `tsc` clean | **PASS** (local) |
| Only the Blockly template is exercised in the browser | the other three templates are covered by the unit test of template content, not by a browser flow | **PARTIAL — stated** |
| CI on #272 | `fresh-bootstrap` **FAIL** (step "PostgreSQL integration tests (real database; none skipped)"; workflow applies M and R only) | **FAIL (CI) — blocks merge; cause inferred** |
| Production | not released, no Production database change | **NOT RUN / DEFERRED to owner decision B1/B3** |

## Open items
* Owner approval of Migration T text, template weights and release timing (`OWNER_DECISIONS_AND_APPROVALS.md` B1, B3).
* The specification should be committed to the repository (currently only in an untracked owner checkout) so the acceptance baseline is reproducible.
* Mixed-grading formula remains undefined (new mixed configurations are refused).
* Release without rubric scores for assignments that have no rubric is unchanged (feedback-only/manual grade).
