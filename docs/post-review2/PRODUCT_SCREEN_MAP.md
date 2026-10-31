# Post-Review-2 Product Screen Map

**Principle:** The primary navigation must communicate lesson → executable program → task simulation → evidence → physical experiment, not a generic LMS flow.

## Student screens

| Screen | Route | Existing page/component | Required data | User actions | Backend endpoint | Next screen/state | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 My Learning | `/my-learning` | `pages/MyLearning.tsx` | Enrollments, Course 1 progress, current unlocked lesson, latest evidence | Continue current lesson; open course path | Existing `GET /me/learning`, `GET /me/enrollments`; extend with progression read model | S2 or current S3 | Modify |
| S2 Course Path | `/courses/:courseId` | `pages/CourseDetail.tsx` | Ordered lessons, progress, prerequisite satisfaction, lock reason, current lesson | Open available lesson; inspect lock reason | Extend `GET /courses/:courseId` or add `GET /me/courses/:courseId/path` | S3 | Modify |
| S3 Lesson Detail | `/courses/:courseId/lessons/:lessonId` | `pages/LessonViewer.tsx` | Objective, content/media, prerequisite state, challenge/delivery, prior evidence | Start/continue guided practice | Extend `GET /lessons/:lessonId`; existing classroom assignment APIs | S4 | Modify |
| S4 Blockly + 3D Task Simulation | `/practice/:attemptId` | `pages/Practice.tsx`, `BlocklyCanvas`, `So101Viewer3D` | Attempt, restricted toolbox, challenge scene, draft, ProgramVersion, task instruction | Edit/save; preview; reset; submit; run authoritative evaluation | Existing program/version/submission/experiment/symbolic endpoints; extend challenge task contract | S5 | Modify |
| S5 Simulation Result | `/practice/:attemptId/result/:evaluationId` (recommended) | Embedded `EvaluationResult` in `Practice.tsx` | Immutable verdict, rule results, reason codes/messages, unlocked lesson | Retry on FAIL; continue on PASS | Existing `GET /me/symbolic-evaluations/:evaluationId`; progression response/query | S4 on retry; S2/S3 on continue | New route, reuse component |
| S6 Physical Robot Lab | `/practice/:attemptId/physical` (or L5 lesson route) | `PhysicalExecutionPanel` and confirmation dialog in `Practice.tsx` | Exact ProgramVersion, prior L4 PASS, allocation, entitlement, readiness, safety, active session | Confirm; start; stop; poll status | Existing physical eligibility/start/status/stop endpoints | S7 | Modify/extract |
| S7 Experiment Result | `/experiments/:experimentId` | `RobotLab.tsx`, `ExperimentList`; teacher evidence UI has richer data | Physical state/result, events, artifacts, provenance, safe failure message | Review evidence; return to path | Existing Experiment and physical execution endpoints | S8 or S2 | Modify/New student detail |
| S8 Progress / Evidence | `/my-learning/:courseId/evidence` | No single page; data/components exist | Lesson progress, attempts, schematic evaluations, physical experiments, feedback | Filter lesson; open evidence; read feedback | Existing submissions/experiments/evaluation/feedback APIs; add aggregated read model if needed | S3/S5/S7 | New |

## Teacher screens

| Screen | Route | Existing page/component | Required data | User actions | Backend endpoint | Next screen/state | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 Teacher Dashboard | `/teacher` | `TeacherOverview.tsx` | Classes, pending reviews, Course 1 progression alerts | Open class/review | Learning insights dashboard APIs | T2/T5 | Exists; extend metrics |
| T2 Classroom Detail | `/teacher/classes/:classroomId` | `TeacherClassDetail.tsx` | Roster, assignments, robot allocation, lesson progress | Inspect learners; publish lesson challenge | Classroom summary/progress/assignment APIs | T3/T4/T5 | Exists; modify progression |
| T3 Curriculum / Assignment | `/teacher/assignments`, `/teacher/assignments/new`, edit route | `TeacherAssignments.tsx`, `TeacherAssignmentEditor.tsx` | Course 1 lessons, published challenges, allowed blocks, delivery state | Create, edit, publish | Existing learning assignment endpoints | T2 | Exists; modify fields |
| T4 Student Progress | `/teacher/classes/:classroomId` progress tab (recommended) | Partial classroom progress queries | Per-student lesson status, attempts, current lock, PASS source | Filter/open student evidence | Existing progress-summary; extend progression read model | T5 | Modify |
| T5 Evidence Review | `/teacher/classes/:classroomId/submissions/:submissionId` | `TeacherSubmissionReview.tsx` | ProgramVersion, symbolic evaluation, experiments, events/artifacts, reflection | Inspect evidence | Existing assessment/evidence endpoints | T6 | Exists |
| T6 Feedback / Assessment | Same submission route | Review form/components in `TeacherSubmissionReview.tsx` | Rubric, feedback, assessment scores | Assess; comment | Existing assessment/feedback endpoints | T4/T5 | Exists |

## School-admin screens

| Screen | Route | Existing page/component | Required data | User actions | Backend endpoint | Next screen/state | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SA1 Users | `/school/users` | Users tab in `SchoolManagement.tsx`; import pages | Organization people/profile/account state | Search/import | Education-admin organization people/import endpoints | SA2/SA3 | Exists |
| SA2 Classrooms | `/school/classrooms` | Classrooms tab in `SchoolManagement.tsx` | Offering, roster counts, allocated robot | Create/select classroom | Education-admin classroom endpoints | SA3/SA4 | Exists |
| SA3 Membership | `/school/classrooms` selected classroom | Members panel/candidate picker/import | Eligible members and classroom roles | Add/import members | Member/candidate/import endpoints | SA2 | Exists |
| SA4 Robot Resources | `/school/classrooms` selected classroom | `ClassroomRobotAllocation` | Organization robots and allocation | Allocate/release robot | Existing education-admin allocation endpoints | SA5 | Exists |
| SA5 Robot Authorization | `/school/robots/:robotId/authorization` (recommended) | No authoritative dedicated page; `AdminRobots.tsx` is local demo data | Entitlement, safety profile, mode, readiness/commissioning summary | Inspect/assign entitlement and policy; no low-level control | Existing entitlement/safety concepts; endpoint coverage must be confirmed before implementation | S6 readiness | New/UNKNOWN backend mutation |

## Navigation/state rules

1. S1 Continue Learning resolves from authoritative prerequisite and completion state, never last page visited alone.
2. S2 displays all five Course 1 lessons but only links to eligible lessons; lock reasons come from the API.
3. S4 local preview is explanatory. S5 PASS/FAIL is based on persisted server evidence for the exact immutable ProgramVersion.
4. S6 accepts only the ProgramVersion that passed the required simulation and always rechecks eligibility server-side.
5. T4/T5 and S8 read the same immutable evidence chain; they must not synthesize PASS from UI state.
6. SA4 allocation does not imply SA5 authorization or runtime readiness.
