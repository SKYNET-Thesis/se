# D03 Stage 2: release readiness, grade policy and browser E2E

Status: **prepared for review. Nothing here was applied.** No Production write, AWS/Terraform change, deployment or workflow
dispatch was made while preparing it. Evidence date: 2026-11-13.

## 1. Where Production stands (from CI evidence, not a live ledger read)

| Fact | Evidence |
| --- | --- |
| D-I applied (6 versions, one transaction), post-flight 44 passed / 0 failed, Stage J excluded | `Production Database Release` run 43405229623 (`release-evidence.json`, plan hash `bbcc80be…`), finished 2026-11-13 09:59:48Z |
| A logical backup with a passing restore test preceded it (PITR is off on this plan) | `backup-apply.json` in the same run |
| The D03 API and web (`99a1b1b`) were then deployed; `schema-gate`, `deploy-api`, `deploy-web` all succeeded | `Education CI` run 43405678255 |
| Stage 2 (J) is **not applied** and not in the manifest | `database/release-scopes.json` (`excludedVersions`), plan `stageJ: "excluded"` |

Consequence: **Production already runs the D03 API on a Stage 1 schema.** Quiz drafts, attachments, history, grading and release
work. `POST /me/attempts/:id/submission` (final submit) and `POST /me/attempts/:id/experiments` (runs) answer 503 until Stage 2.
Programming/Blockly students cannot finish an assignment today. This also means the old API (the only thing Stage 2 is
incompatible with) is **no longer running**, so the "scale to zero" step of the older plan is no longer needed to protect against it.

A live read-only confirmation of the ledger still needs the reader credential (`vista_backup_reader`), which was not available in this
session: run `python scripts/verify_production_release_d_i.py --verify` with the reader URL, or the `Production Database Release` preflight.

Pre-release Production row counts (`pre.json`): `learning_submissions` 1, `learning_assessments` 1, `learning_assessment_scores` 1,
`learning_feedback` 1, `learning_reflections` 0, `learning_assignment_attempts` 8, `learning_experiments` 7, `learning_program_versions` 4, `users` 31.

## 2. Stage 2 validation (disposable PostgreSQL 17)

Baseline + D-H template, then Stage 1, then Stage 2: `tests/database/test_attempt_submission_migrations.py` 8/8 passed
(requires Stage 1; one submission per attempt with history preserved; legacy conflict target invalidated; capability probe
`false|false` → `true|false` → `true|true`; grade-visibility transition; re-run of the backfill for rows written between stages; Stage 1 additive/unambiguous only).
The full database suite (252 tests) and backend suite (917 DB-backed tests with Stage 2 applied) pass. The constraint Stage 2 drops,
`learning_submissions_assignment_id_learner_user_id_key`, exists in the verified Production baseline.

## 3. Blockers before Stage 2 can be released

1. **Release tooling has no scope for J.** `database/release-scopes.json` defines only `D-I` and lists J under `excludedVersions`;
   `scripts/production_db_release.py` requires the manifest to equal the scope and rejects J in the manifest, `database/migrations/` and the ledger.
   A reviewed change is needed: scope `J` (`requiresApplied` = D-I versions, pinned SHA-256, verifier for J), a workflow `scope` choice, tests, and
   the J file moved to `database/migrations/` + registered (order 7) with the two-commit `sourceCommit` procedure. The tooling must not be bypassed
   (no manual runner call, no editing the ledger).
2. **Deployment ordering.** Once J is in the manifest on `main`, `schema-gate` fails closed for every `Education CI` deployment until J is in the ledger
   (the healthy container is not stopped). Sequence: merge → run the release (J) → re-run `Education CI` deploy. Merge only when ready to release the same day.
3. **Policy decision (section 4)** must be signed off before cutover, because the policy is applied by the SQL.
4. **Read the Production audit table first** (section 5, step 2). The numbers in section 1 are from before the release; learners may have used the app since.
5. Optional hygiene: PITR is off; the logical backup is the only restore path. Accept that explicitly.

## 4. Historical grades: options and recommendation

Context: before D03 every assessment/feedback was visible to the student immediately. D03 makes grades invisible until the teacher releases.
A legacy row can be wrong in one case: the old upsert overwrote earlier attempts, so a grade may sit on a row for a *different* attempt's work
(`grading_attribution_uncertain`).

| Option | Behaviour at Stage 2 | Pros | Cons |
| --- | --- | --- | --- |
| **A (implemented default)** | Unambiguous grades stay visible (`legacy_visible`); uncertain ones are withheld and audited until a teacher releases each | Never shows a grade next to the wrong work; nothing a student could already see among clean rows disappears | A student may lose sight of one uncertain grade until reviewed |
| B | Release uncertain ones as `legacy_visible` too | No visibility change at all | May display a grade attached to work it was not given for |
| C | Release on the latest attempt only; earlier attempts "grade unavailable" | Matches where the row was attached | Needs new UI state and SQL not written or tested |

Recommendation: **A.** Production had **1** submission, **1** assessment and **1** feedback row at the release, so at most a single grade can be affected,
manual teacher review costs minutes, and A is the only option already implemented and tested. Check before cutover: if that row is not flagged
`grading_attribution_uncertain` in `learning_submission_backfill_audit`, the choice has no effect on Production at all. B and C add risk or code for
at most one row. Note the 31 users and this volume suggest demo/test data; confirm with the data owner.

## 5. Stage 2 release plan (do not execute without explicit approval at each gate)

1. Implement and review blocker 1 (scope J tooling) on a branch; CI green (`Database Migration Safety`, `Database Bootstrap`, `Education CI`).
2. Read-only, with the reader role, record: counts of `learning_submissions`, `learning_assessments`, `learning_assessment_scores`, `learning_feedback`,
   `learning_reflections`, `learning_experiments`, `learning_symbolic_evaluations`, `learning_assignment_attempts`, `learning_program_versions`;
   `SELECT classification, grading_attribution_uncertain, count(*) FROM learning_submission_backfill_audit GROUP BY 1,2;`;
   `SELECT count(*) FROM learning_submissions WHERE attempt_id IS NULL;`; any open sessions touching `learning_submissions` (`pg_stat_activity`).
3. Record the approved A/B/C decision. Announce a short window (submissions return 503 anyway until done; the DDL needs a brief exclusive lock on a tiny table).
4. Merge the J change to `main` (two-commit procedure), confirm `Production Database Release` preflight shows plan `status: ready`, a fresh logical backup with passing restore test, and plan hash.
5. Dispatch the release for scope J (needs the apply environment reviewers). Expected: J applied in one transaction; failure leaves the schema at Stage 1.
6. Post-flight: legacy UNIQUE gone; `guard_learning_submission_attempt` present; `learning_submission_backfill_audit` has `stage2` rows; dependent-table counts
   unchanged; `learning_submissions` grew only by `origin='reconstructed'` rows; capability probe `true|true`. The API re-probes every 30 s, so no restart is required.
7. Re-run the `Education CI` deployment if the schema-gate had blocked it; then execute the browser E2E (section 6) on Production with test accounts, or on staging first.
8. Review the audit rows with the teacher: `grading_attribution_uncertain`, `legacy_grading_withheld_uncertain`, `reconstruction_skipped`.

Rollback: none automatic (see `d03-student-submissions.md`, "Roll-forward and recovery"). Failure in the transaction → still Stage 1 (fix forward, the current API keeps working
with submit 503). Failure after: fix forward on the new API; never redeploy the pre-D03 API; restore from the logical backup only with explicit approval.

## 6. Browser E2E checklist (student submission and teacher grading)

Prerequisites: Stage 1 **and** Stage 2 applied (or the disposable stack), one published Course 1 programming lesson delivered to a classroom with
an active student enrolment, a student `S`, a second student `S2` in another classroom, a teacher `T` of the classroom, a teacher `T2` of another one.
Record the attempt id from the URL `/practice/:attemptId` and the submission id from `/teacher/classes/:classroomId/submissions/:submissionId`.
Console and Network tabs open; every step lists the expected result.

| # | Actor | Action | Expected |
| --- | --- | --- | --- |
| 1 | S | `/my-learning`, open the assignment (`/my-learning/:classroomAssignmentId`), press **Start attempt** | Attempt 1 "In progress"; Practice opens; `POST /classroom-assignments/:id/attempts` 201 |
| 2 | S | Build a program; wait for "Saved to VISTA"; **Save version**; reload | Program and version restored; no submission yet |
| 3 | S | **Run simulation** three times, saving in between | Result each time; attempt still "In progress"; Blockly editable; lesson not completed; **no** `POST …/submission` in Network |
| 4 | T | `/teacher/submissions` | S's attempt is **not** listed |
| 5 | S | (attachments enabled only) upload a valid PDF/PNG/DOCX; then a file with a wrong extension or oversize | Progress shown; valid file "ready"; invalid one rejected with a clear error; a pending/failed file blocks Submit |
| 6 | S | **Submit assignment**, read the dialog, double-click **Confirm** | Exactly one `POST …/submission` succeeds (201), a repeat returns a conflict-type error without creating a row; "Submitted" banner; Save/Run/new version disabled; no second Submit button |
| 7 | S | Reload; try `POST /me/attempts/:id/submission` again from the console | Rejected (attempt not in progress); still one submission |
| 8 | S | Assignment page history | Attempt 1 "Submitted"/"Evaluated"; grade and teacher feedback **not shown** |
| 9 | T | Open the submission | Sees workspace/program, files (download works, served as attachment), run results |
| 10 | T | Save assessment and feedback, do **not** release | S's page and `GET /me/attempts/:id/grading`, `GET /me/submissions/:id/feedback` show nothing/`[]` |
| 11 | T | **Release** (`POST /attempts/:id/release`), press it twice | Succeeds once; second call is idempotent/rejected without side effects; cannot be undone |
| 12 | S | Reload history | Grade and feedback visible on Attempt 1 only |
| 13 | S | Start Attempt 2 (if `max_attempts` allows) and submit it | Attempt 1's submission, grade and lesson completion unchanged; new row for Attempt 2; grade for Attempt 2 hidden until released |
| 14 | S2 / T2 | Request S's attempt, files and submission by id (console `fetch` with their own tokens) | 403/404 on every one; T2 cannot list, grade or release S's work |
| 15 | S | Submit after the delivery is closed/unpublished or past `close_at` | Rejected with a clear message; nothing written |
| 16 | S | Quiz assignment: save draft, submit | Auto-graded result visible immediately (system release); unchanged from before D03 |
| 17 | Any | Resize to 375 px width on steps 1, 6, 9, 10 | No horizontal scroll; actions reachable |
| 18 | Stage 1-only DB (staging) | Steps 3 and 6 | "not enabled in this environment yet" (503) and no rows written |

Pass criterion: every row as expected, no unexpected 5xx, no console errors from D03 pages. File results as a table in the PR/issue with attempt ids.

## 7. Web TypeScript triage (`tsc --noEmit`, 93 errors on develop)

Not a CI gate (`npm run build` is `vite build`). Attribution by file set of PR #131 and `git blame`:

| Class | Count | Detail |
| --- | --- | --- |
| D03-specific, **fixed** on branch `chore/d03-web-type-hygiene` | 3 | `Practice.tsx` TS2339 (`WorkspaceSvg.scrollIntoView`, a real no-op bug in "Edit program"), unused `React` in `StudentAssignmentDetail.tsx` and `TeacherSubmissionReview.tsx` |
| In a D03-touched file but older Course 1 code | 10 | `Practice.tsx`: TS2322/TS2345 `number\|undefined` and `CanonicalNestRobotProgram` vs `Record<string, unknown>` (same root cause as `LearningLoop.tsx`), TS18046 on `version` (lines last changed by L2/L3 simulation commits); line 241 is the same pattern, only re-indented by D03 |
| Unrelated baseline | 80 | 75 × TS6133 unused imports/`React` across pages, plus `useDigitalTwinViewerScope.spec.tsx`, `CourseDetail.spec.tsx`, `LearningLoop.tsx`, `ClassroomRobotAllocation`-area files |

Recommendation: a separate cleanup PR for the baseline; make `tsc --noEmit` a CI check only after it reaches 0.

## 8. Local files compared (nothing overwritten)

Two earlier untracked drafts, `production-release-d-i-runbook.md` (93 lines) and `verify_production_release_d_i.py` (183 lines), were moved aside to let develop's versions
(220 and 202 lines) be checked out. Develop's versions are strict supersets: the automated release design, reader/apply role separation, the RLS-blind-reader guard and
`supabase_identity` validation were added; the drafts hold only the earlier manual runbook and no content missing from develop.
