# VISTA — Project Context

> Working context for coding agents. Authoritative product intent lives in
> `VISTA_MASTER_CONTEXT_UPDATED_2026-11-07.md` and the master project document;
> this file is the short operational summary. Last updated: 2026-11-07.

## System shape

| Layer | Location | Responsibility |
| --- | --- | --- |
| Web app | `web/robot-edu` | React 18 + Vite + react-router. Learning UX, authoring UI, simulation rendering. Never decides PASS/FAIL. |
| Education API | `services/education-api` | NestJS + Prisma. Auth/RBAC, course catalog, enrollment, progression, authoritative evaluation. |
| Robot runtime | `services/robot-runtime` | Edge execution orchestration, status, stop. |
| CHECKIK | `web/checkIk` | Low-level hardware, calibration, motion, E-stop. |
| Data | Supabase PostgreSQL | Primary production database. |
| Infra | `infra/terraform` | Target architecture, not verified as deployed. |

Identity: Supabase Auth is the session authority. `RoleContext` resolves the
VISTA role from `GET /me/roles` (`systemRoleCodes` + organization memberships).
Backend authorization is authoritative; hiding a sidebar item is not authorization.

## Semantic boundaries

- **Global course** — `learning_courses` row with `organization_id IS NULL`.
  Authored only by System Admin.
- **Course offering** — delivery instance, school-scoped.
- **Classroom** — group of learners inside an organization.
- **Enrollment** — grants learner access to a course through a classroom.
  Revocation is soft (`active → revoked`), progress rows are preserved.
- **ProgramVersion** — immutable provenance anchor for simulation and physical execution.

## Role → route contract

| Role | Home | Course Management entry |
| --- | --- | --- |
| `admin` (system_admin) | `/admin/users` | `/admin/courses` → `AdminCourses` + `CanonicalCurriculumEditor` |
| `school_admin` | `/school/classrooms` | `/school/classrooms` (offerings/classrooms); `/courses` is a read-only catalog view |
| `teacher` / `teaching_assistant` | `/teacher` | `/teacher/courses` |
| `student` | `/my-learning` | `/courses`, `/my-learning` |

`/courses` is the **learner** catalog page (`pages/Courses.tsx`, "Welcome back…").
It must never be the System Admin Course Management destination.

## Constraints

- No production database access, no migrations against production, no deploy.
- Do not modify robotics services for course-management work.
- Do not create a second course/enrollment model or a parallel navigation tree.
