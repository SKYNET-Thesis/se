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
