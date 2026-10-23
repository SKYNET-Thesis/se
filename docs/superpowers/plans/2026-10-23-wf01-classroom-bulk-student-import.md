# WF-01 Classroom Bulk Student Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only classroom student-import preview, idempotent confirm orchestration, and a server-searchable Add Member selection list while preserving existing WF-01 security and provisioning semantics.

**Architecture:** Two Education Admin endpoints use a shared row contract and batch resolution. A new `StudentProvisioningService` owns the existing student provisioning transaction so organization import and classroom import share one implementation. The web adds focused candidate-picker and classroom-import components backed by scoped TanStack Query operations.

**Tech Stack:** NestJS 11, Prisma 5/PostgreSQL, React 18, TanStack Query 5, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-23-wf01-classroom-bulk-student-import-design.md`

## Global Constraints

- Preview performs no database write, Supabase invitation, or other side effect.
- Confirm revalidates and re-resolves rows server-side and never trusts preview status.
- No database migration.
- Do not modify auth guard, Robot Allocation, teacher provisioning behavior, Supabase architecture, C1/C2/C3, CHECKIK, robot-runtime, or WF-02.
- Frontend sends only student row fields for import and only `userId` for Add Member; it never sends editable organization/classroom roles.

---

### Task 1: Classroom import contract and read-only preview

**Files:**
- Create: `services/education-api/src/modules/education-admin/dto/import-classroom-students.dto.ts`
- Create: `services/education-api/src/modules/education-admin/classroom-student-import.service.ts`
- Create: `services/education-api/src/modules/education-admin/classroom-student-import.service.spec.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.controller.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.module.ts`

**Interfaces:**
- Produces `preview(user, organizationId, classroomId, dto)`.
- Preview result includes counts and rows with `new_student | existing_student | already_in_class | needs_review`.

- [ ] Write failing Jest tests proving preview classification, duplicate/invalid handling, profile-difference warning, cross-org denial, and zero writes/invitations.
- [ ] Run `npm test -- classroom-student-import.service.spec.ts` and verify failure is caused by missing implementation.
- [ ] Add the bounded student-row DTO, authorized classroom lookup, batch student/membership resolution, and read-only classification.
- [ ] Wire only the preview endpoint and run the focused tests until green.

### Task 2: Shared student provisioning and confirm orchestration

**Files:**
- Create: `services/education-api/src/modules/education-admin/student-provisioning.service.ts`
- Create: `services/education-api/src/modules/education-admin/student-provisioning.service.spec.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.service.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.service.spec.ts`
- Modify: `services/education-api/src/modules/education-admin/classroom-student-import.service.ts`
- Modify: `services/education-api/src/modules/education-admin/classroom-student-import.service.spec.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.controller.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.module.ts`

**Interfaces:**
- `StudentProvisioningService.provision(organizationId, row, classroomId?)` returns the provisioned user ID and atomically creates optional classroom membership in the DB transaction.
- `ClassroomStudentImportService.confirm(...)` returns `created_and_added | existing_added | unchanged | failed` per row.

- [ ] Write failing extraction tests for no-email pending state, email invitation reuse, and invitation/transaction failure without classroom membership.
- [ ] Write failing confirm tests for new, existing, already-in-class, repeat import, cross-classroom reuse, invalid/duplicate rows, unsupported role, and batch-prefetch behavior.
- [ ] Run both focused suites and verify expected failures.
- [ ] Extract the current student provisioning semantics into the shared service and route existing student User Import through it; leave the teacher branch unchanged.
- [ ] Implement confirm with fresh validation/resolution, existing-profile authority, derived student role, and row-level results.
- [ ] Wire the confirm endpoint and run focused/full API tests until green.

### Task 3: Searchable Add Member picker

**Files:**
- Create: `web/robot-edu/src/pages/school/MemberCandidatePicker.tsx`
- Create: `web/robot-edu/src/pages/school/memberCandidateState.ts`
- Create: `web/robot-edu/src/pages/school/memberCandidateState.spec.ts`
- Modify: `web/robot-edu/src/pages/school/SchoolManagement.tsx`
- Modify: `services/education-api/src/modules/education-admin/school-admin-query.service.ts`
- Modify: `services/education-api/src/modules/education-admin/school-admin-query.service.spec.ts`

**Interfaces:**
- Candidate search remains server-side with query key `(organizationId, classroomId, search, page, pageSize)`.
- `MemberCandidatePicker` emits a selected `userId`; role remains display-only.

- [ ] Write failing API test proving filtering and selectable-state resolution occur before pagination and total excludes existing classroom members.
- [ ] Write failing web tests for 300 ms debounce state, search reset, empty state model, hidden/safe pagination boundaries, selection, Student/Teacher preview, and `{userId}` request body.
- [ ] Run focused API/Web tests and verify red.
- [ ] Update candidate SQL to filter non-selectable members before count/pagination.
- [ ] Implement the direct radio list, explicit empty state, bounded pagination, immediate reset, and non-stale candidate query.
- [ ] Run focused tests until green.

### Task 4: Classroom import review and result UI

**Files:**
- Create: `web/robot-edu/src/pages/school/ClassroomStudentImport.tsx`
- Create: `web/robot-edu/src/pages/school/classroomStudentImport.ts`
- Create: `web/robot-edu/src/pages/school/classroomStudentImport.spec.ts`
- Modify: `web/robot-edu/src/lib/api.ts`
- Modify: `web/robot-edu/src/pages/school/SchoolManagement.tsx`
- Modify: `web/robot-edu/src/queries/schoolAdminQueries.ts`
- Modify: `web/robot-edu/src/queries/schoolAdminQueries.spec.ts`

**Interfaces:**
- API client exposes `previewClassroomStudentImport` and `confirmClassroomStudentImport`.
- Dialog consumes the existing Student CSV parser and emits scoped invalidations after confirmed persistence.

- [ ] Write failing tests for row normalization without preview status, summary mapping, result mapping, and scoped invalidation keys.
- [ ] Run focused tests and verify red.
- [ ] Add API types/client methods and implement Upload → Review → Confirm → Result UI with the approved metrics and safe copy.
- [ ] Add the action beside Add Member and invalidate only People/Overview plus selected classroom roster/candidates/summary.
- [ ] Run focused Web tests until green.

### Task 5: Full gate and live-test handoff

**Files:**
- Modify only files above if a gate exposes a scoped defect.

- [ ] Run `npm test` and `npm run build` in `services/education-api`.
- [ ] Run `npm test` and `npm run build` in `web/robot-edu`.
- [ ] Run `npx prisma validate --schema prisma/schema.prisma` in `services/education-api`.
- [ ] Run `git diff --check` from repository root.
- [ ] Prepare an exact three-row host CSV/live procedure for new, existing-not-in-class, and already-in-class students.
- [ ] Report live status only from observed results; WF-01 is frozen/demo-ready only after all three result states and reload persistence pass.
