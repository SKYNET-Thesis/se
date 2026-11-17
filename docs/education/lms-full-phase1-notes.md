# LMS Full Phase 1 — implementation notes

Status of this document: written during Phase 1D on branch `feat/lms-full-phase1`; it records decisions and
limitations, not a release approval. Local results are not remote CI or Production evidence.

## Grade history limitation (deliberate)

- Reopening a released grade (`POST attempts/:attemptId/grading/reopen`) requires a reason and writes an
  `audit_logs` row (`grading.release_withdrawn`) holding the withdrawn scores, feedback, releaser and reason.
- The runtime role `vista_app_runtime` has `INSERT` but no `SELECT` on `audit_logs` (migration L). The API therefore
  cannot read that history, and no in-app Grade History screen or endpoint exists.
- A secure history view needs a separate, reviewed authorization design (for example a purpose-built history
  table or a narrowly scoped read path). Do not grant the runtime role broad `SELECT` on `audit_logs`, and do not
  add a migration solely for this without that review.

## Instructor progress monitoring

`GET classrooms/:classroomId/learner-progress` (permission `learning.work.review`) returns per enrolled student the
completed lessons, course progress (same rounding as the learner's course path), submitted attempts, best
auto-graded score and last activity. The Teacher classroom page renders it.

## Local verification recipe (disposable resources only)

- PostgreSQL 17: `docker-compose.education-local.yml` on a random loopback port; never 55432–55434.
- S3-compatible storage: a throw-away container with tmpfs (for example the locally cached `rustfs/rustfs`) bound to
  `127.0.0.1`. Set `RUN_LOCAL_S3_INTEGRATION=1` and `LEARNING_MEDIA_S3_ENDPOINT=http://127.0.0.1:<port>`.
  `learning-media.storage.s3.int.spec.ts` and `learning-media.s3.db.spec.ts` skip unless both that flag and
  `RUN_POSTGRES_INTEGRATION=1` are set. This proves storage behaviour against an S3-compatible service, not the
  AWS bucket, IAM policy or CORS configuration.
- Browser journeys: see `docs/operations/phase-2-4-3-local-acceptance.md` (fixtures, local JWKS signer, API as
  `vista_app_runtime`).

## Phase 1E acceptance map (local, disposable resources)

The repository documents only the Release-Candidate journeys 1–3 (`docs/agent-reports/`). The 18-journey list used for
this phase comes from the Phase 1 task definition and is mapped to tests below; it is not a repository requirement
document.

| # | Journey | Evidence |
|---|---|---|
| 1 | Instructor creates a course | `lms-authoring.spec.ts` Journey 1 |
| 2 | Modules and lessons (incl. unlock rule) | Journey 1, `lms-unlock-rule.spec.ts` |
| 3 | Learning materials uploaded and attached | `lms-lesson-media.spec.ts` (real browser, local S3-compatible storage), `learning-media.s3.db.spec.ts` |
| 4 | Questions created manually | Journey 2 |
| 5 | CSV import | `qb-import.spec.ts` |
| 6 | XLSX import | `qb-import.spec.ts` (downloaded XLSX template re-imported), `question-bank-import.http.db.spec.ts` |
| 7 | Weighted quiz from Question Bank | `qb-import.spec.ts`, `lms-unlock-rule.spec.ts` |
| 8 | Assignment and rubric | `lms-assignment-grading.spec.ts` |
| 9 | Preview and publish | Journey 1, `lms-unlock-rule.spec.ts` |
| 10 | Student opens an authorized course | Journey 1, `lms-lesson-media.spec.ts` |
| 11 | Lessons completed, progress shown | `qb-import.spec.ts`, `lms-unlock-rule.spec.ts`, `progression-journey.db.spec.ts` |
| 12 | Weighted quiz result | Journey 2, `qb-import.spec.ts` (25% then 100%) |
| 13 | Assignment submitted | `lms-assignment-grading.spec.ts` |
| 14 | Automatic grading | Quiz only (exact match, weighted). Blockly verdicts do not become rubric grades. |
| 15 | Teacher reviews and releases | `lms-assignment-grading.spec.ts` |
| 16 | Student sees feedback and progress | `lms-assignment-grading.spec.ts`, `lms-independent.spec.ts` |
| 17 | Unauthorized users denied | all journeys, `assignment-grading-lifecycle.db.spec.ts` |
| 18 | Cross-school denied | all journeys, `lms-independent.spec.ts`, DB-backed specs |

Database paths verified on disposable PostgreSQL 17: fresh bootstrap (10 migrations, deterministic schema fingerprint) and
`scripts/check_local_upgrade_path.py` (baseline + D..J with data, then K..M: data preserved, idempotent re-run,
least-privilege runtime role, same fingerprint). K–M remain unapproved for Production.

Known limits: Learning Media has no delete endpoint (an attachment is removed from a lesson, the stored file remains);
the Playwright JWKS port (54321/54323) is shared by every agent, so runs must not overlap.
