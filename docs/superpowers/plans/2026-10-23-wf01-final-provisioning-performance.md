# WF-01 Final Provisioning and Read Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the final WF-01 bulk-provisioning and School Administration read-performance pass without changing authorization, role derivation, or Robot Allocation semantics.

**Architecture:** Add a read-only `SchoolAdminQueryService` beside the existing command service and expose small organization/classroom-scoped endpoints. Use TanStack Query for scoped frontend server-state, lazy query enablement, cached revisits, and exact invalidation. Keep the Supabase auth guard unchanged and optimize bulk import only by prefetching existing school codes.

**Tech Stack:** NestJS 11, Prisma 5/PostgreSQL, React 18, TanStack Query 5, Vitest, Jest.

**Spec:** `docs/superpowers/specs/2026-10-22-wf01-final-provisioning-performance-design.md`

## Global Constraints

- Do not change the Supabase auth guard, authorization semantics, Robot Allocation semantics, no-email provisioning semantics, or classroom role derivation.
- Do not add a database migration, Redis, queues, event sourcing, another database, or a microservice.
- Do not touch C1/C2/C3, CHECKIK, robot-runtime, physical execution, VR, or WF-02.
- Never expose service-role credentials or raw Prisma, PostgreSQL, Supabase, or SMTP diagnostics to the browser.
- Live teacher provisioning requires host-provided real deliverable addresses; otherwise report `HOST VERIFICATION REQUIRED`.

---

### Task 1: Read query contracts and service

**Files:**
- Create: `services/education-api/src/modules/education-admin/dto/school-admin-query.dto.ts`
- Create: `services/education-api/src/modules/education-admin/school-admin-query.service.ts`
- Create: `services/education-api/src/modules/education-admin/school-admin-query.service.spec.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.controller.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.module.ts`

**Interfaces:**
- Produces `overview(user, organizationId)`.
- Produces `people(user, organizationId, { page, pageSize, search?, role? })` returning `{items,page,pageSize,total}`.
- Produces `classrooms`, `classroomMembers`, `offerings`, and `memberCandidates` read methods.

- [ ] Write failing Jest tests for overview counts, People pagination/search/role filtering, candidate search/`alreadyMember`, and cross-org denial.
- [ ] Run `npm test -- school-admin-query.service.spec.ts` and verify failures are caused by the missing service.
- [ ] Implement validated DTOs and parameterized SQL read models with existing permission checks.
- [ ] Wire controller endpoints and module provider.
- [ ] Re-run the focused tests until green.

### Task 2: Bulk import prefetch and regressions

**Files:**
- Modify: `services/education-api/src/modules/education-admin/education-admin.service.ts`
- Modify: `services/education-api/src/modules/education-admin/education-admin.service.spec.ts`

**Interfaces:**
- `importUsers` performs one organization/kind code prefetch before row processing.
- Existing row result contract remains `created | unchanged | failed`.

- [ ] Add failing tests proving a 20-student and five-teacher reimport returns unchanged from one prefetch, invokes no invitation, and opens no row transaction.
- [ ] Run the focused Education Admin tests and verify red.
- [ ] Implement normalized code prefetch and pass the existing-code set into row provisioning.
- [ ] Preserve row transactions, safe invitation classification, and no-email pending behavior.
- [ ] Re-run the focused tests until green.

### Task 3: TanStack Query foundation and identity deduplication

**Files:**
- Modify: `web/robot-edu/package.json`
- Modify: `web/robot-edu/package-lock.json`
- Modify: `web/robot-edu/src/App.tsx`
- Modify: `web/robot-edu/src/contexts/RoleContext.tsx`
- Create: `web/robot-edu/src/queries/schoolAdminQueries.ts`
- Create: `web/robot-edu/src/queries/schoolAdminQueries.spec.ts`

**Interfaces:**
- `RoleContextValue` exposes authoritative `/me/roles` memberships.
- Query-key factories include organization, classroom, and filter values.
- Scoped invalidation helpers enumerate only affected keys.

- [ ] Add failing Vitest tests for key scoping, mutation invalidation targets, and the single identity request contract.
- [ ] Install `@tanstack/react-query` and run the focused test to confirm behavioral failures remain.
- [ ] Add `QueryClientProvider`, session-safe cache clearing, key factories, and invalidation helpers.
- [ ] Change RoleContext to one `/me/roles` request and retain memberships.
- [ ] Re-run focused tests until green.

### Task 4: API client and lazy School Administration UI

**Files:**
- Modify: `web/robot-edu/src/lib/api.ts`
- Modify: `web/robot-edu/src/pages/school/SchoolManagement.tsx`
- Modify: `web/robot-edu/src/pages/school/ClassroomRobotAllocation.tsx`
- Modify: `web/robot-edu/src/pages/school/SchoolImportUsers.tsx`
- Create: `web/robot-edu/src/queries/schoolAdminLazyState.spec.ts`

**Interfaces:**
- API client exposes overview, paginated People, candidates, existing classroom reads, offerings, and eligible Robots.
- Query enablement depends only on the active tab/dialog/selection described by the spec.

- [ ] Add failing tests for lazy offerings, candidates, roster, and eligible Robots plus cached People revisit behavior.
- [ ] Run focused web tests and verify red.
- [ ] Replace SchoolManagement manual fetching with independent TanStack queries and local pagination/search controls.
- [ ] Render true-first-load skeletons while preserving cached data on revisit.
- [ ] Load offerings/candidates/eligible Robots only when their dialogs open.
- [ ] Scope create/add/allocate/import invalidation exactly as specified.
- [ ] Re-run focused web tests until green.

### Task 5: Full verification and performance measurement

**Files:**
- Modify only test/measurement helpers if required; do not add production observability unless measurement proves it necessary.

- [ ] Run Education API build and full tests.
- [ ] Run Web build and full tests.
- [ ] Run Prisma validation and `git diff --check`.
- [ ] Start/reuse the local API and web app with the current host configuration.
- [ ] Measure the same initial, SchoolManagement, and People → Classroom → People request paths used by the baseline.
- [ ] Measure cold/warm timing and People/Classroom API timing; report unreliable values as `NOT MEASURED`.
- [ ] Read-only verify People DB timing without adding an index.
- [ ] Perform available live no-email provisioning, persistence, classroom membership, authorization, and Robot Allocation regressions.
- [ ] Do not perform teacher invitation tests without host-provided real deliverable addresses.
