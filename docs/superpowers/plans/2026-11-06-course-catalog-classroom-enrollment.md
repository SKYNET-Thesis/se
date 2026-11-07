# Course Catalog, Classroom, and Enrollment Implementation Plan

**Goal:** Complete the existing curriculum-delivery workflow without adding a parallel course or enrollment model.

**Architecture:** Keep global templates in `learning_courses` (`organization_id IS NULL`) and use the existing `learning_course_offerings`, `learning_classrooms`, and `learning_enrollments` records for school delivery. Add a focused delivery service that owns offering assignment, idempotent enrollment/revocation, and access checks; retain historical progress and work records.

**Tech Stack:** NestJS, Prisma/PostgreSQL migrations, Jest, React/Vite, Vitest.

## Constraints

- Do not deploy, modify production data, commit, or push.
- Course and enrollment data remain in the existing learning tables.
- Membership and enrollment changes are transactional and idempotent.
- Former members lose classroom-specific access while historical work is retained.

### Task 1: Establish baseline and schema invariants

**Files:** inspect `prisma/schema.prisma`, applied migrations, service tests.

- [ ] Run backend and frontend relevant test suites before edits.
- [ ] Verify `learning_enrollments` uniqueness and all references to enrollment status.
- [ ] Record the chosen status transition: `active -> revoked -> active` without deletion.

### Task 2: Catalog delivery API

**Files:** modify learning DTO/controller/service and their Jest specs.

- [ ] Add failing service/controller tests for system-admin catalog writes, publish validation, published-only school catalog, and archive behavior.
- [ ] Add minimal endpoints and scope checks for course lifecycle operations.
- [ ] Run focused Jest tests and TypeScript build.

### Task 3: Classroom offering and lifecycle API

**Files:** modify education-admin DTO/controller/service and Jest specs.

- [ ] Add failing tests for classroom update/archive, teacher/student role validation, and assigning only a published global course.
- [ ] Implement the smallest scoped classroom/offering operations using existing records.
- [ ] Run focused Jest tests and TypeScript build.

### Task 4: Enrollment synchronization

**Files:** add a focused enrollment-delivery service; modify membership/offering operations; add Prisma migration only if schema requires it.

- [ ] Add failing tests for assignment enrollment, joining enrollment, duplicate/concurrent-safe behavior, revoke/rejoin, and alternate classroom access.
- [ ] Implement transaction-based synchronization and soft revocation while preserving progress/work rows.
- [ ] Run focused Jest tests and TypeScript build.

### Task 5: Frontend delivery experiences

**Files:** modify typed API client plus existing School Management, My Learning, course path, and teacher classroom pages with Vitest coverage.

- [ ] Add failing component/query tests for published assignment selection, enrollment-only My Learning, and classroom course status.
- [ ] Integrate API operations into existing role-based pages; do not create a second navigation tree.
- [ ] Run focused Vitest suites and production web build.

### Task 6: Authorization, workflow verification, and handoff

**Files:** backend integration/service specs and `docs/education/FRONTEND_API_HANDOFF.md`.

- [ ] Add tests for cross-school denial, unassigned-teacher denial, unenrolled-student denial, and end-to-end enrollment lifecycle.
- [ ] Run backend test suite, frontend test suite, and both builds.
- [ ] Update API handoff with only verified endpoint behavior and report any unavailable full-stack dependency.
