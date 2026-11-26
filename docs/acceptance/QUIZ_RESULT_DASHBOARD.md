# Student Quiz Result dashboard, performance rating and deterministic recommendations

Date: 2026-11-26. Local isolated acceptance only (disposable PostgreSQL, real browser, real API). No Production change, no migration, no external AI.

## What was added (grading is unchanged)

- `GET /me/attempts/:attemptId/quiz-result` — owner-only, read-only. Aggregates the attempt's own recorded outcome (`exact_match_v1`, no partial credit) with immutable question-version metadata (type, difficulty, topic, learning objectives). Returns no answer key, stem or option text. PASS/FAIL, weighted score and per-question outcome are the values stored at grading.
- `quiz-analytics.ts` — pure functions: rating, type/difficulty/topic/objective buckets, recommendations.
- `QuizResultDashboard` — rendered inside the existing result section of the quiz attempt page (also for a reopened past attempt).

Weighted score = earned points / possible points; question accuracy = fully correct questions / questions. Both are shown and labelled separately. Rating (informational): ≥90 Excellent, ≥80 Good, ≥70 Satisfactory, ≥50 Needs Improvement, else Needs Review; it never changes PASS/FAIL, which uses the quiz's configured threshold.

Recommendations are deterministic: per learning objective, lost points = sum of the points of the incorrect questions; ranked by lost points, then incorrect count, then objective code; priority High ≥50% / Medium ≥25% / Low of that objective's points lost; at most 5. Each has topic, reason, evidence (missed/total questions, lost/possible points, hard-or-medium missed), priority and a Review Lesson link. Targets are only published reading/video/demonstration activities (never the quiz) linked to the objective, in courses the learner is actively enrolled in (same access rule as the course path); if no section is linked, the lesson is offered; if nothing accessible exists the page says **Insufficient Evidence**. Every result carries the note that a single quiz attempt is not an assessment of overall ability.

## Evidence

| Check | Result |
|---|---|
| `quiz-analytics.spec` (all rating boundaries 100/90/89.99/80/79.99/70/69.99/50/49.99/0, zero denominators, empty attempt, unanswered ≠ incorrect, multi-objective, absent types not listed, ranking/limit/stability, Insufficient Evidence) | PASS 24/24 |
| `quiz-result.service.spec` (recorded PASS/FAIL, analytics, recommendations, lesson fallback, no answer keys/stems, ownership, unreleased/non-quiz attempts) | PASS 7/7 |
| `QuizResultDashboard.spec` (rendering, absent types, PASS independent of rating, Insufficient Evidence, N/A, review links) | PASS 9/9; learning components 58/58 |
| Browser `lms-module-quiz.spec` on the seeded SO-101 module quiz (20 questions: 13 single, 3 multiple, 4 true/false; 35 points): attempt 1 all wrong → FAIL, 0%, Needs Review, 0/35, 0 correct · 20 incorrect · 0 unanswered, per-type and per-difficulty 0/n, per-objective bars, 4 recommendations with Review Lesson links that open the lesson; reopening the past attempt shows the same analysis; API 200 without answer keys, another student and the instructor get 403/404. Attempt 2 all right → PASS, 100%, Excellent, no recommendations ("no review is suggested") | PASS 1/1 |

Screenshots: `docs/acceptance/screenshots/quiz-dashboard/quiz-result-fail.png`, `quiz-result-pass.png`.

## Limits

- **Dark mode:** the application's design system defines only light-theme tokens (`:root` in `index.css`); there is no dark theme to verify against. The new components use only the existing semantic tokens, so they follow a future dark theme, but dark mode itself is **not verified**.
- Topic analytics use the question's own `topic` field; the SO-101 seed has none, so topic bars are hidden there and only objective bars show (verified). Topic display is covered by unit/component tests, not by this browser run.
- Questions are all-or-nothing, so "partial credit" is not applicable under the current policy and is not shown.
- Time spent is not shown: no reliable per-attempt duration is recorded.
- Mobile layout: the component is a single-column flow; a dedicated mobile viewport check was not run.
