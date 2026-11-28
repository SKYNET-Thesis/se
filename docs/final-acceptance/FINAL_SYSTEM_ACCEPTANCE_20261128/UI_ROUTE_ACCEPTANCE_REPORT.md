# UI and route acceptance (2026-11-28)

Tested revision `develop` `eceb8d1`; LOCAL isolated stack (real Chrome, real API, real PostgreSQL). Existing approved light visual design — no redesign. **Not Production.**

## Evidence summary
| Check | Result |
|---|---|
| Route inventory vs rendered pages, all roles, 3 widths, horizontal overflow, console and failed requests | `platform-route-inventory` **12/12**, `platform-route-sweep` **22/22**, `console-network-sweep` **5/5** (anonymous, System Admin, School Admin, Instructor, Student: 0 console errors, 0 failed requests, 0 unexpected HTTP errors) |
| Accessibility (WCAG A/AA via axe per role; keyboard, focus, labels) | `platform-axe` **5/5** (System Admin, School Admin, Instructor and Student page sets, plus the dialogs and forms of the management screens and the course-builder tabs), `lms-a11y-smoke` **13/13**, `lms-a11y-extended` **14/14** |
| Screens and states | `ui-screens` **5/5**, `ui-screens-deep` **3/3**, `platform-resilience` **6/6** (clean rerun; first run failed once on a 5 s heading timeout while the machine was under load, passed on a clean stack), `website-mobile-account` **7/7**, `website-notifications` **2/2**, `website-public-smoke` **6/6** |
| **Full-page screenshots** at 1440 / 768 / 390 px (desktop / tablet / mobile) | 18 screens × 3 widths = **54 captures + 19 interaction-state captures = 73 PNG** with `fullPage: true`; `overflow.json`: **0 screens with horizontal overflow, 0 skipped**. Stored **outside the repository** at `~/.vista-acceptance/20261128-final/screenshots/fullpage/` (produced by a scratch copy of `visual-audit.spec.ts` with `fullPage: true`; the repository version captures a 2400 px-tall viewport and is not a true full-page capture) |
| Unit-level UI (Vitest) | 127 files / 843 tests pass |
| Desktop download entry | Linux `.deb` button enabled only if a published, verified file exists, otherwise an explicit unavailable message; Windows and macOS are disabled "Coming Soon" — **installers NOT RUN** |
| Paper MCP | not used (optional) |

Responsive tables, dialogs, forms, loading/empty/error states, validation and keyboard interaction are exercised by the specs above; no defect was found in this cycle beyond N-08 (duplicate `admin/robots` route entry, cosmetic).

## Route inventory (from `web/robot-edu/src/App.tsx`, 58 entries)
Role column is the `RequireRole` list, "any signed-in" = `RequireSession` only (data authorization is enforced by the API), "public" = no session. Redirect rows are not pages.

| Route | Access | Component / target | Browser coverage |
|---|---|---|---|
| `/login` | public | Login | website-public-smoke, GoTrue UI suite |
| `/forgot-password` | public | ForgotPassword | staff-auth-recovery-ui (GoTrue) |
| `/reset-password` | public | ResetPassword | staff-auth-recovery-ui (GoTrue) |
| `/student/change-password` | public | StudentPasswordChange | student-auth-ui (GoTrue) |
| `/` | public | PublicEntry | website-public-smoke |
| `/home-v2` | public | redirect → / | redirect asserted by platform-route-sweep |
| `/admin/courses/:courseId` | admin,teacher,school_admin | CourseBuilder | platform-route-inventory / platform-route-sweep |
| `/account` | any signed-in | AccountSettings | website-mobile-account |
| `/settings` | any signed-in | WebSettings | platform-route-sweep |
| `/courses` | any signed-in | Courses | lms-curriculum |
| `/catalog` | student | CourseCatalog | lms-catalog-enrollment |
| `/learning-path` | student | LearningPath | lms-prerequisite-enforcement |
| `/courses/:courseId` | any signed-in | CourseDetail | platform-route-inventory / platform-route-sweep |
| `/courses/:courseId/info` | any signed-in | CourseInfo | platform-route-inventory / platform-route-sweep |
| `/courses/:courseId/lessons/:lessonId` | any signed-in | LessonViewer | platform-route-inventory / platform-route-sweep |
| `/courses/:courseId/lessons/:lessonId/activities/:activityId` | any signed-in | ActivityReader | platform-route-inventory / platform-route-sweep |
| `/assignments` | student | StudentAssignments | platform-route-inventory / platform-route-sweep |
| `/my-learning` | student | MyLearning | lms-beginner-lab |
| `/my-learning/:classroomAssignmentId` | student | StudentAssignmentDetail | platform-route-inventory / platform-route-sweep |
| `/learning-loop` | any signed-in | LearningLoop | platform-route-inventory / platform-route-sweep |
| `/assignments/:assignmentId` | any signed-in | redirect → /my-learning | redirect asserted by platform-route-sweep |
| `/studio` | any signed-in | Studio | blockly-simulation |
| `/studio/:programId` | any signed-in | Studio | platform-route-inventory / platform-route-sweep |
| `/practice/:attemptId` | any signed-in | Practice | platform-route-inventory / platform-route-sweep |
| `/practice/:attemptId/result/:evaluationId` | any signed-in | SimulationResult | platform-route-inventory / platform-route-sweep |
| `/digital-twin` | any signed-in | redirect → /lab | redirect asserted by platform-route-sweep |
| `/ai-registry` | student,teacher,admin | AiRegistry | ai-registry |
| `/lab` | any signed-in | RobotLab | digital-twin-browser-viewer |
| `/teacher` | teacher,teaching_assistant | TeacherOverview | lms-academic |
| `/teacher/classes` | teacher,teaching_assistant | TeacherClasses | lms-academic |
| `/teacher/classes/:classroomId` | teacher,teaching_assistant | TeacherClassDetail | platform-route-inventory / platform-route-sweep |
| `/teacher/classes/:classroomId/submissions/:submissionId` | teacher,teaching_assistant | TeacherSubmissionReview | platform-route-inventory / platform-route-sweep |
| `/teacher/courses` | any signed-in | redirect → /admin/courses | redirect asserted by platform-route-sweep |
| `/teacher/assignments` | teacher | TeacherAssignments | lms-authoring |
| `/teacher/assignments/new` | teacher | TeacherAssignmentEditor | platform-route-inventory / platform-route-sweep |
| `/teacher/assignments/:classroomId/:assignmentId/edit` | teacher | TeacherAssignmentEditor | platform-route-inventory / platform-route-sweep |
| `/teacher/assignments/:classroomId/:assignmentId` | teacher | TeacherAssignmentEditor | platform-route-inventory / platform-route-sweep |
| `/teacher/quizzes` | teacher | QuizDeliveries | platform-route-inventory / platform-route-sweep |
| `/teacher/challenges` | teacher | TeacherChallenges | platform-route-inventory / platform-route-sweep |
| `/teacher/submissions` | teacher | TeacherSubmissions | platform-route-inventory / platform-route-sweep |
| `/admin/organizations` | admin | AdminOrganizations | platform-lifecycle |
| `/admin/robots` | admin | AdminRobots | lab-session-management |
| `/admin/students` | admin | AdminStudentImport | student-bulk-import-ui (GoTrue) |
| `/admin/users` | any signed-in | redirect → /admin/organizations | redirect asserted by platform-route-sweep |
| `/admin/robots` | any signed-in | redirect → /admin/organizations | redirect asserted by platform-route-sweep |
| `/admin/settings` | any signed-in | redirect → /admin/organizations | redirect asserted by platform-route-sweep |
| `/admin/courses` | admin,teacher,school_admin | AdminCourses | lms-authoring |
| `/school` | school_admin | SchoolManagement | platform-school-admin |
| `/school/users` | school_admin | SchoolManagement | platform-route-inventory / platform-route-sweep |
| `/school/classrooms` | school_admin | SchoolManagement | platform-route-inventory / platform-route-sweep |
| `/school/classrooms/:classroomId` | school_admin | SchoolManagement | platform-route-inventory / platform-route-sweep |
| `/school/quizzes` | school_admin | QuizDeliveries | platform-route-inventory / platform-route-sweep |
| `/school/courses` | school_admin | SchoolCourses | platform-route-inventory / platform-route-sweep |
| `/school/offerings` | school_admin | SchoolOfferings | lms-course-offerings |
| `/school/profile` | school_admin | SchoolProfile | platform-route-inventory / platform-route-sweep |
| `/school/roles` | school_admin | SchoolRoles | platform-route-inventory / platform-route-sweep |
| `/school/import` | school_admin | SchoolImportUsers | platform-route-inventory / platform-route-sweep |
| `/*` | any signed-in | NotFound | platform-route-inventory / platform-route-sweep |

`*` catch-all renders `NotFound`.
