# Phase 2.4.3 Remaining Acceptance Blockers — Implementation Plan

> **For agentic workers:** execute inline in this session. No commits or database writes are authorized before the user's consolidated approval.

**Goal:** Prepare a least-privilege Education API PostgreSQL role, executable browser and local S3 integration tests, and synthetic fixtures for the isolated Course Builder database.

**Architecture:** The API uses one direct Prisma PostgreSQL identity, so database row policies can admit only the trusted API role while course/classroom authorization remains in `LearningScopeService` and adjacent service methods. A local MinIO service provides S3-compatible integration without AWS; Playwright drives the real web app and API against an isolated database after approval.

**Tech Stack:** PostgreSQL 17, Prisma, SQL migration runner, NestJS, React/Vite, Playwright, MinIO.

**Spec:** User-provided VISTA Phase 2.4.3 request, especially tasks A–N.

## Global Constraints

- Do not modify historical migrations D/E or Production.
- Do not commit, push, deploy, access AWS, or apply Terraform.
- Do not write to PostgreSQL before one consolidated user approval.
- Keep course/classroom tenant checks in service code; do not claim tenant-isolated RLS.
- Use tmpfs/local containers only for integration fixtures and S3-compatible testing.

---

### Task 1: Runtime-role migration and privilege integration tests

**Files:** additive SQL under `database/migrations/`, security integration spec under `services/education-api/src/modules/learning/`, migration release manifest registration prepared only after source revision is authorized.

- [ ] Confirm API table access needs, identity propagation, migration runner role DDL support, and model sequences.
- [ ] Write migration source for non-superuser `vista_app_runtime`, narrow schema/table/sequence privileges, and role-scoped policies on RLS tables.
- [ ] Add role verification scenarios for DML, restricted tables, role attributes, DDL denial, and service-layer scope.
- [ ] Run static SQL transaction validation without connecting to a database.

### Task 2: Browser E2E harness and fixture provisioning

**Files:** Playwright config/specs and deterministic synthetic fixture provisioning for the disposable database.

- [ ] Add an executable Playwright harness for the admin-to-student course and quiz workflow.
- [ ] Add fixture setup/cleanup for admin, instructor, students, organization, course, curriculum, canonical quiz, classrooms, memberships, and enrollments.
- [ ] Add authorization scenarios for drafts, cross-course media, classroom delivery, and private grading payloads.
- [ ] Do not run the harness until database write approval arrives.

### Task 3: Local S3-compatible integration

**Files:** disposable Compose service, test configuration, and integration tests.

- [ ] Add a private MinIO test service and isolated credentials/bucket bootstrap.
- [ ] Exercise presigned POST, metadata verification, signed GET, expiration, missing object, and cross-course access through Learning Media services.
- [ ] Run the storage integration locally without AWS.

### Task 4: Verification and approval handoff

- [ ] Run focused and broad safe static/non-mutating tests.
- [ ] Record exact migration SHA-256, future release source requirements, database operations, and fixture scope.
- [ ] Request one consolidated approval before local database writes, migration application, or commit.
