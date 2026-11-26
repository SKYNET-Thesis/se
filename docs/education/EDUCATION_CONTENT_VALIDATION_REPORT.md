# Education content validation report — pilot package

Date: 2026-11-26. Source: `VISTA_Education_Content/` (kept out of the repository; every JSON file is marked `DRAFT_NOT_IMPORT_READY`, source `VISTA_Question_Bank_180_Curriculum.xlsx`). Validation was a read-only script over `vista_courses.json`, `vista_question_bank.json`, `vista_quiz_mapping.json`; the XLSX files were not yet exercised through the import UI. Nothing was imported anywhere.

## Counts (verified, match expectation)

| Item | Expected | Actual |
|---|---|---|
| Courses | 3 | 3 (BEGINNER / INTERMEDIATE / ADVANCED, 6 lessons each) |
| Lessons | 18 | 18 |
| Questions | 180 | 180 (10 per lesson) |
| Quiz blueprints | 9 | 9 (3 per course, 20 questions each) |

## Structural checks — PASS

- 180 unique question codes, no duplicate stems, no duplicate options inside a question.
- Every question references an existing lesson; course/lesson pairs are consistent (0 mismatches).
- Every quiz `Question Pool` range resolves to exactly 20 questions of a single course; `Count` = pool size.
- Correct answers are A/B/C/D (45/46/45/44), each pointing at a populated option; no empty required field.
- Difficulty: EASY 72, MEDIUM 54, HARD 54. One learning-outcome code per lesson (LO-01…LO-18).
- Quiz thresholds: 70% (3), 80% (3), 85% (3); max attempts 2 on all nine.

## Defects that block "import-ready" (not silently fixed)

| # | Finding | Impact | Needed decision / action |
|---|---|---|---|
| 1 | **No points column.** | Weighted grading and "points visible before submission" need points. | Owner/instructor to choose a rule (e.g. 1 point each; or by difficulty). Not invented here. |
| 2 | **`Explanation` equals the correct option's text in 180/180 questions.** | Feedback after submission would add no information. | Instructor must author real explanations, or accept option-echo feedback as a limitation. |
| 3 | **All content is Vietnamese**; product UI and capstone docs are English. | Mixed-language learner experience. | Decide: demo pilot in Vietnamese, or translate (at least one course) before import. |
| 4 | **Single choice only** (180/180). No multiple-choice or true/false rows. | The import and grading paths for multiple choice / true-false cannot be demonstrated with this content. | Add a few reviewed rows, or demonstrate those types with test fixtures only (clearly labelled). |
| 5 | **Every record is `DRAFT`**, no reviewer notes. | Not an approved Production package. | Instructor review sign-off before any Production use. Local isolated import is fine. |
| 6 | **No Learning Section / topic mapping.** Rows carry course, lesson and a lesson-level learning outcome only. | Import must pick a Learning Section manually; topic-level analytics and recommendations will be coarse. | Section mapping in the import UI; recommendations limited to lesson/objective level (state "Insufficient evidence" otherwise). |
| 7 | Blueprint = 2 lessons per quiz (9 quizzes / 18 lessons). | Requirement says mini-quiz at the end of each module; confirm a "module" is a lesson pair here and a Learning Section otherwise. | Confirm module definition. |
| 8 | Source citations are generic ("LeRobot docs; …; cần giảng viên rà soát theo phiên bản"). | Provenance needs instructor review. | Reviewer step. |

## Relation to the existing importer

`question-import.ts` on `develop` accepts CSV/XLSX with headers `code, type, difficulty, cognitive_level, stem, option_a…f, correct, points, explanation, source_reference` (single/multiple choice, 1 MB, 500 rows, bounded ZIP reader, no formulas). The pilot sheet uses different headers and has no points, so an explicit column mapping/transform is required; the importer's Course/Lesson/Learning Section selection and topic/learning-objective fields from the requested template are not implemented yet (see the Education gap list in the sprint report).

## Verdict

Structure: **PASS**. Import-readiness: **NOT READY** until decisions 1–3 are made. Actual import through the Web UI in an isolated database: **NOT RUN**.
