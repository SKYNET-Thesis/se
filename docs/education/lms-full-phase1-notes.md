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
