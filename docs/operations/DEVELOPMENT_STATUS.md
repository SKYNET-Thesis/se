# VISTA — Development Status

> Last updated: 2026-11-07. Results marked *reported* were supplied by a prior
> session and were not re-executed here. Results marked *verified* were observed
> in this session's working tree.

## Branch / worktree

- Repository root: `/home/quangduc/Code/vista/se`
- Course Management worktree: `.worktrees/course-catalog-classroom-enrollment`
  (branch `feat/course-catalog-classroom-enrollment`)
- Main checkout `se/` is on `feat/course1-learning-experience`.

## Course Management — implementation state

### System Admin

| Feature | State |
| --- | --- |
| Global course catalog list | Implemented — `pages/admin/AdminCourses.tsx` |
| Create course | Implemented 2026-11-07 (added in this session) |
| Edit course details | Implemented 2026-11-07 (added in this session) |
| Publish / archive | Implemented |
| Canonical curriculum editor (lesson → section → activity) | Implemented — `CanonicalCurriculumEditor.tsx` |
| Lesson prerequisites | Implemented |
| Reorder lessons / sections / activities | Implemented |

### School Admin

Published-course offering creation, classroom create/edit/archive, teacher and
student assignment, offering reassignment, enrollment revoke/rejoin: implemented
in `pages/school/SchoolManagement.tsx` plus `education-admin` API.

### Student

My Learning, enrollment-scoped visibility, lesson and activity progression:
implemented. Historical progress preserved across revocation.

### Teacher

Assigned classrooms, roster, assignments, student progress, evidence review:
implemented.

## Resolved issue — System Admin "Course catalogue" opened Student My Learning

**Symptom.** System Admin clicking *Course catalogue* received the learner page
("Welcome back, admin", "Your courses", "Keep going", "How course access works").

**Root cause (confirmed by source inspection).**
1. `data/navigation.ts` mapped the admin sidebar item to `/courses`, which is
   `pages/Courses.tsx` — the learner catalog, not an admin page.
2. No `admin/courses` route existed in `App.tsx` on the main checkout, and
   `AdminCourses.tsx` / `CanonicalCurriculumEditor.tsx` existed only as
   uncommitted files inside this worktree.

**Fix (this session).**
- Admin sidebar item now targets `/admin/courses`.
- `AdminCourses` gained Create course and Edit details entry points, wired to the
  existing `POST /admin/courses` and `PATCH /admin/courses/:id` endpoints.
- `/admin/courses` route remains guarded by `RequireRole roles={['admin']}`;
  the backend still enforces `assertSystemAdministrator`.

Learner, teacher and school-admin routes were not changed.

## Verification in this session

| Check | Result |
| --- | --- |
| `npx vite build` (web/robot-edu) | PASS — built in 8.26s |
| `npx vitest run` (full frontend) | PASS — 37 files, 215 tests |
| `CanonicalCurriculumEditor.spec.tsx` | PASS — 6/6 |
| `npx tsc --noEmit` | Pre-existing repo-wide errors (unused React imports, `lessonActivities.ts` union mismatch); none in files changed here |
| `git diff --check` | PASS |

Not executed in this session: backend regression, authenticated cross-role HTTP
E2E, PostgreSQL enrollment lifecycle suite, browsers-based UI verification.

## Reported historical results (not re-run)

- Backend regression: 52 suites / 464 tests PASS.
- Canonical Curriculum Editor: 6 focused tests PASS.
- PostgreSQL enrollment lifecycle/concurrency: 10/10 PASS.
- Current-schema provisioning on disposable PostgreSQL 16: PASS.

## Open blockers

1. No authenticated cross-role HTTP E2E has been executed.
2. `AdminCourses` depends on `catalogApi.courses` (`GET /courses`), which returns
   courses visible to the caller; confirm the system-admin listing includes drafts
   in a real request.
3. School Admin has no dedicated offering management page; offerings are created
   implicitly when a classroom is created.
4. Production migration readiness remains NO-GO — see
   `DATABASE_MIGRATION_STATUS.md`.
5. `tsc --noEmit` is not clean repo-wide, so type checking cannot be used as a
   gate yet.
