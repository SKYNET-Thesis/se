# VISTA Frontend API Handoff

All learning data goes through Nest at `VITE_API_BASE_URL` (default `http://localhost:3000/api/v1`). Obtain the bearer token exclusively from the existing Supabase session. Do not read or write `learning_*` directly from the browser's Supabase client.

The typed entry points are in `web/robot-edu/src/lib/api.ts`: `identityApi`, `catalogApi`, `classroomApi`, `assignmentApi`, `attemptApi`, `programApi`, `submissionApi`, `experimentApi`, `symbolicEvaluationApi`, `assessmentApi`, `feedbackApi`, `reflectionApi`, `demonstrationApi`, `datasetApi`, `modelApi`, `vlaProvenanceApi`, and `runtimeApi`.

`organizationApi` and `dashboardApi` provide scoped composite reads. Classroom
member, summary and dashboard APIs are teacher/TA review-scope APIs, not learner
directory APIs. `attemptApi.workspace` returns only the current learner's
authorized workspace context.

## Learner demo sequence

1. `GET /me`, then `GET /me/classrooms` and `GET /classrooms/:id/assignments`. Learners receive only published assignments.
2. `POST /classroom-assignments/:id/attempts`; then `GET /me/attempts/:id`.
3. `GET` or `POST /me/attempts/:id/program`. Persist a canonical RobotProgram v1 payload; Blockly workspace JSON is editor state, not execution IR.
4. `PATCH /me/programs/:id`; `POST /me/programs/:id/versions`; then `POST /me/attempts/:id/submission` with that exact version ID.
5. `POST /me/attempts/:id/experiments` with `executionMode: "schematic"`, then `POST /me/experiments/:id/run-schematic`, then `GET .../result`.
6. Optionally `POST .../evaluate-symbolic`; list/read evidence through `/me/symbolic-evaluations`. This returns passed/failed rule evidence, not a numerical grade.
7. Read feedback at `GET /me/submissions/:id/feedback`; create/list reflection at `/me/submissions/:id/reflections`.

Expected protected-route errors: `401` missing/invalid token, `400` malformed DTO/validated UUID, `403` permission boundary where applicable, and `404` for unavailable or inaccessible scoped resources.

## Course catalog and classroom enrollment lifecycle

- System administrators manage global templates only through `POST /admin/courses`, `PATCH /admin/courses/:courseId`, `POST /admin/courses/:courseId/publish`, and `POST /admin/courses/:courseId/archive`. A course must be global and contain at least one lesson before it can be published. Archived courses are not re-published through this API.
- School administrators browse assignable templates at `GET /education-admin/organizations/:organizationId/published-courses`, then create an organization-scoped delivery record with `POST /education-admin/organizations/:organizationId/course-offerings`. The server rejects unpublished and organization-owned templates.
- A classroom is created against that offering through the existing classroom endpoint. `POST /education-admin/organizations/:organizationId/classrooms/:classroomId/archive` soft-archives a classroom and revokes only its active enrollments; historical learning rows remain intact.
- Learner course-path reads are enrollment-driven. The browser must never fall back to `/courses` to populate **My Learning**; an active enrollment is required.
- Adding a student to a classroom through `POST /education-admin/organizations/:organizationId/classrooms/:classroomId/members` or the classroom CSV import synchronizes that classroom's active published offering. The operation is idempotent and preserves existing lesson progress.
- Remove a classroom member through `DELETE /education-admin/organizations/:organizationId/classrooms/:classroomId/members/:studentId`. This atomically (under a classroom lock) changes the membership to `removed` (the Production CHECK has no `left`) and only the matching classroom enrollment to `revoked`; it does not delete attempts, submissions, assessments, feedback, program versions, or experiment evidence. Another active classroom enrollment remains independently valid.

## Teacher review

Start with `GET /me/classrooms`, then `GET /classrooms/:id/submissions`, `GET /submissions/:id`, and `GET /submissions/:id/assessment`. The detail includes the rubric criteria actually linked to the assignment. Save assessment through `POST /submissions/:id/assessment` (`overallFeedback?`, `scores[]`) and create human feedback through `POST /submissions/:id/feedback` (`content`). The server requires active organization membership, teacher/TA classroom relation and `learning.work.review`; assessment writes also require `learning.assessment.assess`.

## Available metadata screens

- Demonstrations: own episode list/detail, segments and annotations; read-only provenance. No upload/capture button should claim availability.
- Datasets: own version detail and episode membership; read-only provenance.
- Models/training: own run metadata, accessible model/checkpoint metadata; never label a row as an active training job.
- VLA: own interaction/action-step provenance only; no generate/inference UI.
- Runtime: health/status only for `robot.manage`; never show a command control.
- Owned provenance relationships are also available: demonstration → observation
  configuration/dataset versions; dataset version → training runs; training run
  → dataset/metrics/checkpoint; evaluation run → benchmark/checkpoint; VLA
  interaction → experiment/summary.

## Explicit UI labels

Use **SCHEMATIC** for the deterministic symbolic interpreter. Never label it simulation or a real execution. Disable or label unavailable: simulation, real robot, capture/upload, training execution and VLA generation.

## Classroom lifecycle and publication contract (updated after the develop merge)

All classroom routes are under `/education-admin/organizations/:organizationId/classrooms/:classroomId` and require
`education.classroom.manage` (members: `education.classroom.members.manage`). Every operation locks the classroom row first, so
concurrent changes serialize and a removed student or archived classroom can never be re-enrolled by a racing synchronization.

- `PUT .../offering` `{ offeringId }`: offering must belong to the same school, be `active` and reference a `published` global course;
  an archived classroom must be reactivated first. Access through the previous offering is revoked, then the new one is synchronized
  (same transaction).
- `POST .../archive` and `POST .../reactivate`: idempotent. Archiving revokes only this classroom's enrollments; reactivating
  re-synchronizes. Progress, attempts and results are never deleted.
- `DELETE .../members/:studentId`: membership becomes `removed`, only this classroom's enrollment becomes `revoked`.
- `POST /admin/courses/:courseId/publish` is **all-or-nothing**: the course and the enrollments of every active classroom of an active
  offering change in one transaction. The response is the course plus `enrollmentSync: { classrooms, enrolled }`. Any error means the
  course is unchanged; publishing again is the safe, idempotent retry. `POST /admin/courses/:courseId/enrollments/sync` re-runs the same
  all-or-nothing synchronization for an already published course.

## UI issues handed to Antigravity (not fixed in the backend work)

1. Course editor: when a save or create call fails the draft dialog is closed/reset by `cancel()` before the response; the draft
   (activity, section, lesson) must stay open with its values and show the error.
2. Asset Library appears twice on the course catalogue page ("Manage Your Files" and "Asset Library" cards open the same
   course-scoped Learning Media library) and requires a selected course; merge them into one entry point with a clear empty state.
