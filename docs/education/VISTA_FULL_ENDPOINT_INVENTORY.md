# VISTA REST API Inventory

Last reconciled: 2026-10-16. Every business route is under `/api/v1` and uses a Supabase access token unless stated otherwise. `404` is used for inaccessible resources so cross-user, cross-classroom and cross-organization records are not disclosed. This is a capability inventory, not a CRUD target.

## A. Implemented controller routes

Only the routes in this section are registered by Nest and appear in Swagger.

### Platform and identity

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET | `/health` | public process health | IMPLEMENTED | yes |
| GET | `/status` | public runtime-status adapter summary | IMPLEMENTED | yes |
| GET | `/me` | current JWT-to-public-user mapping | IMPLEMENTED | yes |
| GET | `/me/roles`, `/me/permissions`, `/me/memberships` | current active identity | IMPLEMENTED | yes |
| PATCH | `/me/profile` | current user; `fullName` only | IMPLEMENTED | yes |

## Curriculum, classroom and delivery

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET | `/courses`, `/courses/:courseId`, `/courses/:courseId/lessons`, `/lessons/:lessonId` | enrolled/classroom-reachable course, or system administrator | IMPLEMENTED | yes |
| GET | `/course-offerings`, `/course-offerings/:offeringId` | active organization/classroom reachability | IMPLEMENTED | yes |
| GET | `/me/enrollments`, `/me/classrooms`, `/classrooms/:classroomId`, `/classrooms/:classroomId/course` | own active membership, teacher/TA scope, or admin | IMPLEMENTED | yes |
| GET | `/classrooms/:classroomId/assignments` | learner sees only `published`; scoped teacher/TA sees delivery configuration | IMPLEMENTED | yes |
| GET | `/classroom-assignments/:classroomAssignmentId` | same publication and classroom rule | IMPLEMENTED | yes |
| POST | `/classrooms/:classroomId/assignments` | `learning.delivery.manage` plus active teacher/TA classroom scope | IMPLEMENTED | yes |
| PATCH | `/classrooms/:classroomId/assignments/:assignmentId` | same teacher/TA scope | IMPLEMENTED | yes |
| POST | `/classroom-assignments/:classroomAssignmentId/attempts` | own learner identity, active student classroom membership, publication/window/max-attempt rule | IMPLEMENTED | yes |
| GET | `/me/attempts`, `/me/attempts/:attemptId` | own attempt and active classroom membership | IMPLEMENTED | yes |

## Programming and immutable provenance

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET/POST | `/me/attempts/:attemptId/program` | own authorized attempt; canonical RobotProgram v1 | IMPLEMENTED | yes |
| PATCH | `/me/programs/:programId` | own mutable draft only | IMPLEMENTED | yes |
| GET/POST | `/me/programs/:programId/versions` | own program; POST creates immutable version | IMPLEMENTED | yes |
| POST | `/me/attempts/:attemptId/submission` | own attempt; exact immutable ProgramVersion relationship | IMPLEMENTED | yes |
| GET | `/me/submissions`, `/me/submissions/:submissionId` | own submission plus active student classroom scope | IMPLEMENTED | yes |

## Schematic experiment and symbolic evaluation

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| POST | `/me/attempts/:attemptId/experiments` | own authorized attempted/submitted ProgramVersion; `learning.experiment.execute` | IMPLEMENTED | yes |
| GET | `/me/experiments`, `/me/experiments/:experimentId`, `/me/experiments/:experimentId/result`, `/me/experiments/:experimentId/events`, `/me/experiments/:experimentId/artifacts` | own experiment | IMPLEMENTED | yes |
| POST | `/me/experiments/:experimentId/run-schematic`, `/cancel` | own experiment and valid lifecycle | IMPLEMENTED | yes |
| POST | `/me/experiment-comparisons` | both own, comparable experiments | IMPLEMENTED | yes |
| POST | `/me/experiments/:experimentId/evaluate-symbolic` | own completed schematic experiment | IMPLEMENTED | yes |
| GET | `/me/symbolic-evaluations`, `/me/symbolic-evaluations/:evaluationId` | own evaluation through own experiment chain | IMPLEMENTED | yes |

## Learner progression

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET | `/me/courses/:courseId/path` | own active enrollment or active student classroom delivery | IMPLEMENTED | no |
| POST | `/me/attempts/:attemptId/knowledge-check` | own writable active student classroom attempt; server-graded answers | IMPLEMENTED | no |

The schematic interpreter is deterministic symbolic computation only: not a physics simulation, IK engine, collision detector, VLA provider or robot executor. The authoritative result remains in `output_snapshot`; it does not manufacture a storage artifact.

## Teacher assessment, feedback and reflection

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET | `/classrooms/:classroomId/submissions`, `/submissions/:submissionId` | `learning.work.review`, active org membership, teacher/TA classroom scope | IMPLEMENTED | yes |
| GET/POST | `/submissions/:submissionId/assessment` | GET review scope; POST also `learning.assessment.assess` | IMPLEMENTED | yes |
| GET/POST | `/submissions/:submissionId/feedback` | teacher/TA review scope | IMPLEMENTED | yes |
| GET | `/me/submissions/:submissionId/feedback` | own submission | IMPLEMENTED | yes |
| GET/POST | `/me/submissions/:submissionId/reflections` | own submission; learner identity derived from JWT | IMPLEMENTED | yes |

Assessment, feedback, learner reflection, competency evidence and symbolic machine evidence are separate records; none automatically updates competency.

## Catalog and authorized metadata

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET | `/learning-levels`, `/competencies`, `/me/competencies`, `/me/competencies/:competencyId` | authenticated catalog / own progress | IMPLEMENTED | yes |
| GET | `/challenges`, `/challenges/:challengeId`, `/challenges/:challengeId/objects`, `/challenges/:challengeId/conditions` | course/classroom-reachable challenge | IMPLEMENTED | yes |
| GET | `/benchmark-tasks`, `/benchmark-tasks/:taskId` | authenticated read-only catalog | IMPLEMENTED | yes |
| GET | `/me/demonstrations`, `/me/demonstrations/:demonstrationId`, `/me/demonstrations/:demonstrationId/segments`, `/me/demonstrations/:demonstrationId/annotations` | own demonstration provenance only | IMPLEMENTED | yes |
| GET | `/me/dataset-versions`, `/me/dataset-versions/:datasetVersionId`, `/me/dataset-versions/:datasetVersionId/episodes` | own dataset provenance only | IMPLEMENTED | yes |
| GET | `/me/training-runs`, `/me/training-runs/:trainingRunId`, `/me/training-runs/:trainingRunId/checkpoints` | own training metadata only | IMPLEMENTED | yes |
| GET | `/ai-models`, `/ai-models/:modelId`, `/ai-models/:modelId/checkpoints`, `/model-checkpoints/:checkpointId` | accessible model entitlement / owner scope | IMPLEMENTED | yes |
| GET | `/me/evaluation-runs`, `/me/evaluation-runs/:evaluationRunId`, `/me/evaluation-runs/:evaluationRunId/metrics` | own generic evaluation metadata only | IMPLEMENTED | yes |
| GET | `/me/experiments/:experimentId/vla-interactions`, `/me/vla-interactions/:interactionId`, `/me/vla-interactions/:interactionId/action-steps` | own experiment provenance only | IMPLEMENTED | yes |

These are metadata/provenance reads. A row never represents capture, dataset export, training, generic evaluation, model inference or VLA execution by itself.

## Runtime adapter

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET | `/runtime/health`, `/runtime/status` | `robot.manage`; read-only adapter status | IMPLEMENTED | yes |

`reachable` is not `ready`. No runtime proxy, motion, gripper, teleop, calibration, unlock, execution, stop or E-stop route exists.

## Expansion read models

| Method | Route | Auth / scope | Status | Frontend |
|---|---|---|---|---|
| GET | `/organizations/:organizationId`, `/organizations/:organizationId/classrooms` | active membership in that organization or system administrator | IMPLEMENTED | yes |
| GET | `/classrooms/:classroomId/members`, `/students`, `/instructors`, `/summary` | `learning.work.review`, active teacher/TA classroom scope | IMPLEMENTED | yes |
| GET | `/assignments/:assignmentId`, `/assignments/:assignmentId/rubric`, `/challenges/:challengeId/assignments` | reachable classroom; learners see published work only | IMPLEMENTED | yes |
| GET | `/me/dashboard`, `/me/learning-summary`, `/me/recent-activity` | own authoritative learning records | IMPLEMENTED | yes |
| GET | `/classrooms/:classroomId/dashboard`, `/progress-summary`, `/submission-summary`, `/activity` | `learning.work.review`, active teacher/TA classroom scope | IMPLEMENTED | yes |
| GET | `/me/attempts/:attemptId/workspace` | own active student attempt scope | IMPLEMENTED | yes |
| GET | `/me/dataset-versions/:datasetVersionId/summary`, `/episodes/:episodeId` | own dataset version provenance | IMPLEMENTED | yes |
| GET | `/me/training-runs/:trainingRunId/metrics`, `/checkpoints/:checkpointId` | own training metadata | IMPLEMENTED | yes |
| GET | `/model-checkpoints/:checkpointId/model` | existing `model.use`/entitlement scope | IMPLEMENTED | yes |
| GET | `/me/evaluation-runs/:evaluationRunId/benchmark` | own evaluation metadata | IMPLEMENTED | yes |
| GET | `/me/vla-interactions/:interactionId/summary`, `/experiment` | own VLA provenance chain | IMPLEMENTED | yes |
| GET | `/me/demonstrations/:demonstrationId/observation-configuration`, `/dataset-versions` | own demonstration provenance chain | IMPLEMENTED | yes |
| GET | `/me/dataset-versions/:datasetVersionId/training-runs` | own dataset provenance | IMPLEMENTED | yes |
| GET | `/me/training-runs/:trainingRunId/dataset-version` | own training provenance | IMPLEMENTED | yes |
| GET | `/me/evaluation-runs/:evaluationRunId/checkpoint` | own evaluation provenance plus checkpoint entitlement | IMPLEMENTED | yes |

These routes aggregate records already persisted by VISTA. They do not calculate
new competency, training, VLA, simulation or robot-execution outcomes.

## B. Complete planned REST architecture

The capabilities below are part of the VISTA architecture but are not controller
routes and must not appear as available Swagger operations.

### Deliberately unavailable routes

| Class | Routes intentionally absent | Reason |
|---|---|---|
| BLOCKED_PROVIDER | demonstration capture/upload intent, annotation/episode creation, dataset curation/freeze, training start/cancel, checkpoint generation, VLA generation, generic evaluation start | no approved provider/authority/lifecycle contract; Supabase Storage bucket and service configuration are not verified |
| BLOCKED_HARDWARE | any runtime command, real-robot experiment, motion, teleop, calibration or gripper API | M5 physical-robot checkpoint is locked |
| DEFERRED_SECURITY | invitation, membership/role mutation, direct browser Supabase learning writes, RLS rollout | dedicated security design remains deferred |
| INTENTIONALLY_ABSENT | DELETE versions/submissions/experiments/assessments/demonstration history | provenance and reproducibility are append-only |
