# D03: student assignment submissions (attempt-based)

Status: **implemented in source; no migration has been applied to any shared or Production database, no AWS or
Terraform change has been made, nothing is deployed.** Everything below is a plan to be reviewed and approved.

## What changes

* One final submission **per attempt** (`learning_submissions.attempt_id`, one row per attempt). The legacy
  `UNIQUE (assignment_id, learner_user_id)` and the `ON CONFLICT` upsert in `ProgrammingService.submit` overwrote the
  earlier attempt's submission (and left its grade/feedback attached to the new content) and are replaced.
* Attempt-level quiz drafts, attempt-linked student attachments, and an explicit instructor **release** of grading
  (`learning_assignment_attempts.grading_released_at`).
* Business semantics that change (see also the final implementation report):
  * `submit` is final: a submitted/evaluated attempt, a closed/unpublished delivery or a passed `close_at` is rejected,
    and program edits/versions are rejected after submission. Retrying means a new attempt (`max_attempts` applies).
    Running a simulation is NOT a submission (see "Run vs final submit").
  * Instructor assessment, rubric scores and feedback are invisible to students until released; the older
    `GET /me/submissions/:id/feedback` returns `[]` until then. Auto-graded quiz results and automatic simulation
    verdicts are unchanged (system-graded; quizzes are released by the system at evaluation).
  * `learning-insights` submission counts are per attempt instead of per learner/assignment.

## Migrations

| Stage | File | Where | Safe with the old API running? |
| --- | --- | --- | --- |
| 1 | `database/migrations/20261113_i_attempt_submission_foundation.sql` | registered in the manifest (order 6) | **Yes.** Additive only; keeps the legacy UNIQUE; backfills only unambiguous `attempt_id`s. |
| 2 | `database/staged-migrations/20261114_j_one_submission_per_attempt.sql` | staged, NOT in the manifest | **No.** After it the old API's `ON CONFLICT (assignment_id, learner_user_id)` is invalid (proved by `tests/database/test_attempt_submission_migrations.py`). |

Backfill rules (both stages): a legacy submission gets `attempt_id` only when exactly one attempt of the same learner,
in a delivery of the same assignment, owns its program. Rows with no match or several matches keep `attempt_id = NULL`
and are recorded in `learning_submission_backfill_audit` (`unmapped_no_attempt`, `ambiguous_multiple_attempts`);
`grading_attribution_uncertain` flags a mapped row that carries an assessment/feedback/reflection although the learner
has other submitted attempts whose own rows were overwritten (that grade may belong to an earlier attempt). Nothing is
deleted or rewritten. Stage 2 additionally reconstructs submissions for earlier finalized attempts **only** when their
snapshots match exactly one stored program version (`origin = 'reconstructed'`, no grade/feedback/reflection invented);
anything else is audited as `reconstruction_skipped`.

## Production release sequence (NOT executed; needs explicit approval at each gate)

1. Review and approve this branch. Commit the SQL, then set the manifest `sourceCommit` (two-commit procedure) and run
   `validate_database_migration_manifest.py --release`. **Stage 1 manifest entry only.**
2. Take the pre-release backup/snapshot and record `SELECT count(*)` of `learning_submissions`, `learning_assessments`,
   `learning_feedback`, `learning_reflections`, `learning_experiments`, `learning_symbolic_evaluations`,
   `learning_assignment_attempts`.
3. Run the SQL release runner for Stage 1 (with migrations D-H as scheduled). The old API keeps serving. Verify: counts
   unchanged, `learning_submission_backfill_audit` reviewed (unmapped/ambiguous/uncertain rows), checksum in the ledger.
4. Source-only IAM change below, reviewed and applied by whoever owns Terraform; verify the API role can reach
   `learning-media/submissions/*` and still cannot reach anything else new.
5. Stage 2 window (announce a short maintenance window for submissions):
   1. scale the education API to **zero** tasks (old and new code must never run together);
   2. re-verify there are no other writers (`pg_stat_activity` for `learning_submissions`);
   3. move the Stage 2 file into `database/migrations/`, register it (order 7), validate, run the runner;
   4. verify: legacy UNIQUE gone, `guard_learning_submission_attempt` present, audit rows for `stage2`, counts of the
      dependent tables unchanged, `learning_submissions` count increased only by the reconstructed rows;
   5. deploy the matching API/web build and scale up; run the smoke checks (start attempt, save, submit, second attempt,
      teacher review, release, student view).
6. Keep the audit table for manual review of `grading_attribution_uncertain` rows before relying on historical grades.

## Roll-forward and recovery (Stage 2)

Stage 2 has **no automatic rollback**: once any learner has two submissions for one assignment the legacy UNIQUE cannot be
re-created without choosing which rows to delete, which is destructive and was ruled out.

* Failure inside the migration: it runs in one transaction, so a failure leaves the database at Stage 1. Fix forward,
  keep the API scaled to zero until the migration is applied or abandoned. If abandoned, redeploy the previous API
  (it works against the Stage 1 schema).
* Failure after Stage 2 with the new API: fix forward on the new API. Do **not** redeploy the old API (its submit path
  fails by design). If the new API must be withdrawn, scale submissions off (read-only mode) and restore from the
  pre-release backup only with explicit approval, accepting loss of work done since.
* A wrongly reconstructed submission is identifiable (`origin = 'reconstructed'`, audit row) and is removed by an
  explicitly approved, reviewed one-off statement; assessments never attach to reconstructed rows automatically.
* `ServiceUnavailable` from `submit` mentioning "Stage 2 database migration has not been applied" means the new API
  was deployed against a Stage 1-only schema: apply Stage 2 (or roll the API back to the old version) immediately.

## AWS / IAM (documentation only: not applied, Terraform not modified)

`infra/terraform/compute.tf` currently grants the API task role `s3:PutObject` and `s3:GetObject` only on
`learning-media/courses/*` and says the submissions prefix is a separate approved change. Student attachments need, on
the **existing** Learning Media bucket and nothing else:

```hcl
statement {
  sid       = "LearningMediaStudentSubmissions"
  actions   = ["s3:PutObject", "s3:GetObject"]   # presigned PUT/POST target + HEAD/ranged-GET verification + presigned download
  resources = ["${aws_s3_bucket.media.arn}/learning-media/submissions/*"]
}
```

* No `s3:DeleteObject`: removing an attachment is a soft delete in the database; objects are kept.
* No new bucket, no new policy on the bucket, no change to public access blocks.
* CORS: browsers upload with a presigned **POST** from the web origin. Verify the bucket CORS rule that serves course
  media uploads allows `POST` (and `PUT` if used elsewhere) for the same origins; that is a Terraform review item.
* Optional hardening to propose separately: a lifecycle rule that expires `learning-media/submissions/` objects whose
  database row is `failed`/`pending` for more than 24 h (needs a reconciliation job; not part of this change).

## Known limitations

* File validation (extension, declared type, exact size, magic bytes, and for DOCX the OOXML package structure, no
  macros/ActiveX, no ZIP64/encryption, bounded sizes) is **not malware scanning**. Files are always downloaded as
  attachments. TXT and ZIP are deferred (no trustworthy type proof).
* Attachments are opt-in per assignment (`constraints.attachments.enabled = true`); there is no authoring UI for that
  flag yet (Course Builder is D02-owned).
* Releasing grading cannot be undone from the UI/API (no un-release).
* `/assignments/:assignmentId` (demo/localStorage `AssignmentDetail`) is intentionally untouched.

## Run vs final submit (Practice / Blockly)

| Action | Endpoint(s) | Effect on the attempt |
| --- | --- | --- |
| Save program / Save version | `PATCH /me/programs/:id`, `POST /me/programs/:id/versions` | none; allowed while the attempt is `in_progress` |
| Run simulation / Run & evaluate | `POST /me/attempts/:id/experiments`, `.../run-schematic`, `.../evaluate-symbolic` | **repeatable**; binds the run to the attempt's *draft* submission (`status='draft'`), records the evaluation in `result_snapshot`, leaves the attempt `in_progress`, does not touch lesson progression, does not consume an attempt, does not lock Blockly |
| Submit assignment (confirmed) | `POST /me/attempts/:id/submission` | the single final action: promotes the draft (or creates the row) to the attempt's one final submission, locks the attempt, and if the submitted version already has a persisted evaluation finalizes the attempt as `evaluated` and projects a PASS to progression |

The previous web flow called the final submission endpoint inside "Run" (and inside "Submit & evaluate"); that is the behavior that was
separated. Draft submissions are ignored by every final-submission reader (teacher lists/review, `/me/submissions`, history, insights,
physical-execution eligibility, demonstration context, progression/qualification evidence). Physical (real-robot) runs still require a
FINAL submission with a persisted symbolic PASS. A lesson completes at final submit, not at run time (documented semantic change).
`Studio.tsx` (free-form programs, not attempt-bound) never called the submission endpoint and is unchanged.

## Stage compatibility (exact minimum schema per API version)

| API version | Minimum schema | Behavior on a lower schema |
| --- | --- | --- |
| previous API (`origin/develop` at `e5ef4b7`) | migrations D-H; works unchanged on Stage 1 (additive; the legacy `UNIQUE` and its `ON CONFLICT` target are kept) | **invalid on Stage 2** (its upsert conflict target no longer exists) |
| this D03 API | **Stage 1** (`20261113_i_attempt_submission_foundation`) to start | `SchemaCompatibilityService.onModuleInit` refuses to boot without Stage 1 (explicit error, no silent degradation) |
| this D03 API, Stage-2 endpoints | **Stage 2** (staged `20261114_j_one_submission_per_attempt`) | answer **503** *before any write*; re-checked every 30 s, so applying Stage 2 needs no restart |

Endpoints that need Stage 2: `POST /me/attempts/:id/submission` (final submit) and `POST /me/attempts/:id/experiments` (it creates the
draft submission a run is bound to). Everything else (quiz drafts, attachments, history, grading, release, reads) needs Stage 1 only. The
capability probe SQL is exercised against pristine / Stage 1 / Stage 2 databases in `tests/database/test_attempt_submission_migrations.py`
(`false|false`, `true|false`, `true|true`).

## Legacy grading visibility: current behavior and the policy decision needed

| Record class | Before D03 | After D03 (implemented) |
| --- | --- | --- |
| Auto-graded quiz results; automatic simulation verdicts | visible immediately | unchanged (quizzes: `grading_release_origin='system_auto'`) |
| Previously visible programming grades/feedback with **unambiguous** attribution | visible immediately | **preserved**: Stage 2 marks the attempt released with origin `legacy_visible` (`released_by` NULL), audited as `legacy_grading_released` |
| Grades on a row that **overwrote earlier attempts** (`grading_attribution_uncertain`) | visible, attached to the latest attempt | **withheld** (unreleased) and audited as `legacy_grading_withheld_uncertain` until an instructor decides |
| New grades after D03 | n/a | invisible until the instructor releases (`origin='instructor'`) |

**Decision needed (not implemented beyond the safe default):** what to do with the withheld, uncertain grades. Options:
(A) keep withheld until the instructor reviews and releases each one (current, safest); (B) release them as `legacy_visible` because the student
already saw them (preserves visibility, but may show a grade next to work it was not given for); (C) release them only on the latest attempt
(the row they were attached to) and mark the earlier attempts "grade unavailable". This policy is applied at Stage 2 cutover and can be changed
before that release by editing the staged SQL only.

## `/assignments/:assignmentId` (demo/localStorage) migration plan

`/assignments` (list) is already on the real API (`/me/learning`) and navigates to `/my-learning/:classroomAssignmentId`. The detail route
`/assignments/:assignmentId` renders `AssignmentDetail` + `AssignmentWorkPanel` from demo data (`data/assignments.ts`, ids such as `asg-reach`, which are
slugs, not classroom-assignment UUIDs) and `LearningContext` (localStorage progress, "Submit draft locally"). Callers: `pages/Dashboard.tsx`,
`components/dashboard/UpcomingAssignments.tsx`, `components/studio/TaskPanel.tsx`; `pages/Assignments.tsx` is not routed (dead). Nothing was changed.

Safe migration (each step verified before the next; nothing deleted): (1) make Dashboard/UpcomingAssignments read `/me/learning` and link to
`/my-learning/:classroomAssignmentId` (same data the list page already uses); (2) give Studio's `TaskPanel` the attempt's classroom assignment
(it already receives the assignment for programs opened from an attempt) and link there; (3) once no caller links to `/assignments/:id`, replace the
route element by a redirect that maps a UUID to `/my-learning/:id` and shows the existing "not found" state for demo slugs; (4) only then retire
`AssignmentWorkPanel`/`LearningContext` assignment state with the owners' approval. These components are teammate-owned.

## Browser verification status and manual checklist

No browser-automation environment exists in this repository (no Playwright/Cypress package in `web/robot-edu`; the Playwright config and
JWKS test signer mentioned in older status docs are not on `develop`). A real-browser run also needs the API with Supabase-style auth, a seeded
database and the web dev server, i.e. new infrastructure, so it was **not** attempted and no E2E coverage is claimed. What is covered instead:

| Step | Automated coverage (not a browser) |
| --- | --- |
| 1-2 open assignment, save program/version | `StudentAssignmentDetail` component specs; `attempt-retry-regression.db.spec.ts` (real PostgreSQL) |
| 3-4 repeated runs, attempt stays editable and in progress | `Practice.spec.tsx` (run never calls submit, Run stays enabled, no lock); DB spec "a simulation run never finalizes, locks or consumes the attempt" |
| 5-6 final submit locks | `Practice.spec.tsx` (confirmation, one submit, locked banner, no second submit button); DB specs (ATTEMPT_NOT_IN_PROGRESS, edits/versions rejected) |
| 7 teacher sees the final submission only | DB spec (drafts invisible to teacher lists/review; final visible) |
| 8 progression only after final submit | DB spec (passing run leaves lesson incomplete; submit completes it; retry does not regress) |

Manual checklist (staging with Stage 1 and Stage 2 applied, a student and a teacher in one classroom, a published Course 1 programming lesson):
1. As the student open My Learning, open the assignment, press Start attempt: the existing Blockly workspace opens.
2. Build a program, wait for "Saved to VISTA", press Save version. Reload: the program and version are restored.
3. Press Run simulation (or Run & evaluate) three times, changing the program and saving a new version in between. Each run shows a result; the attempt is
   never marked submitted, Blockly stays editable, the lesson is NOT completed even after a PASS, and My Learning shows the attempt "In progress".
4. Teacher: the classroom submission list shows nothing for this student/attempt yet.
5. Student: press Submit assignment, read the confirmation, confirm. The "Submitted" banner appears, editing/saving/running new versions is blocked,
   and there is no second Submit button. If the last run of that version passed, the lesson now completes and the next lesson unlocks.
6. Student: the assignment page lists Attempt 1 as Submitted/Evaluated and, if attachments are enabled, shows its files read-only.
7. Teacher: the submission appears as "Attempt 1" with its files; assess it, add feedback. The student sees neither until the teacher presses
   Release; after release the student sees the grade and feedback on that attempt only.
8. Student starts a new attempt (if allowed), submits it: attempt 1's submission, grade and lesson completion are unchanged.
9. On a Stage 1-only database, steps 3 and 5 must answer "not enabled in this environment yet" (503) and nothing must be written.
