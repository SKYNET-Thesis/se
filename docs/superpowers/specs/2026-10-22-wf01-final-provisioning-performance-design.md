# WF-01 Final Provisioning and Read Performance Design

## Status and scope

This design completes the final WF-01 engineering pass. It covers production-like bulk school-user provisioning verification and removal of measured School Administration read-path waste. Successful live verification is required before WF-01 can be frozen.

The pass does not start WF-02 and does not change C1, C2, C3, CHECKIK, robot-runtime, physical execution, VR, Robot Allocation semantics, classroom role derivation, Supabase authentication architecture, or the approved no-email student behavior.

No database or index migration is planned. The current live indexes support the measured reads, and no query evidence justifies another index.

## Architectural approach

WF-01 will use CQRS-lite inside the existing Education API. Commands remain in the existing mutation service. A focused `SchoolAdminQueryService` will own lightweight read models, using the same NestJS application, PostgreSQL database, Prisma client, authorization boundary, and deployment.

The implementation will not add Redis, Kafka, RabbitMQ, event sourcing, a separate read database, a microservice, or a distributed cache.

The Supabase authentication guard will remain unchanged. Every query and command request will continue to perform the existing JWT validation and authoritative organization/permission checks. Frontend caching cannot grant access and cannot bypass the API.

## Identity request deduplication

`GET /me/roles` remains the authoritative frontend access-context response. `RoleContext` will retain both the resolved role and the memberships already returned by that endpoint.

The frontend will stop calling `/me/memberships` from `RoleContext` and `SchoolManagement`. This removes duplicate identity requests without changing server-side authorization.

## Read API

All organization-scoped read endpoints require the existing School Admin permissions and hide inaccessible organizations using the established not-found behavior.

### Overview

The overview endpoint returns only:

- `studentsCount`
- `teachersCount`
- `classroomsCount`
- `robotResourcesCount`
- `accountSetupPendingCount`

`robotResourcesCount` means the number of distinct robot resources currently allocated to classrooms in the organization. Counts are calculated in PostgreSQL without loading complete People, Classroom, roster, or Robot arrays.

### People

The People endpoint follows the repository's existing `page` and `pageSize` convention. Default page size is 20 and the DTO enforces a bounded maximum. Optional `role` accepts only `student` or `instructor`. Optional `search` matches display name, the relevant student/employee code, and non-null email, case-insensitively.

The response contains `items`, `page`, `pageSize`, and `total`. Each item contains only:

- `id`
- `displayName`
- `role`
- `studentCode` or `employeeCode`
- `gradeLevel`
- `email`
- `accountState`

An item does not expose guardian email, membership IDs, creation timestamps, or nested organization records. The query uses a stable order and one bounded database read for items/count metadata where practical.

### Classrooms and roster

The classroom list remains a lightweight organization-scoped summary containing the fields required by the Classroom UI, membership counts, and current Robot allocation summary.

Classroom roster is a separate read loaded only after a classroom is selected. Selecting another classroom changes the classroom-scoped query key and cannot reuse another classroom's roster.

### Member candidates

The member-candidate endpoint follows the same bounded `page`/`pageSize` convention and supports server-side search. It includes only active organization members whose organization roles are `student` or `instructor`.

Each candidate contains:

- `userId`
- `displayName`
- `organizationRole`
- `schoolCode`
- `accountState`
- `alreadyMember`

`alreadyMember` is derived against the requested classroom. The mutation continues to accept only `userId`; the backend continues to derive `student → student` and `instructor → teacher`, and rejects unsupported roles.

### Offerings and Robot resources

Course offerings are requested only when Create Classroom is opened.

The existing eligible Robot endpoint and allocation mutation retain their business semantics. Eligible Robot resources are requested only when the Allocate/Replace Robot dialog opens. The current Robot allocation summary remains available through the classroom read model.

## Frontend cache and UX

TanStack Query will be added as the shared server-state cache. Query keys are hierarchical and scoped by organization and, where applicable, classroom and filters:

- `schoolOverview(organizationId)`
- `schoolPeople(organizationId, filters)`
- `schoolClassrooms(organizationId)`
- `classroomMembers(organizationId, classroomId)`
- `classroomMemberCandidates(organizationId, classroomId, filters)`
- `schoolOfferings(organizationId)`
- `eligibleRobots(organizationId, classroomId)`

There is no monolithic `schoolAdminData` query.

Queries use a short non-zero stale period and retain cached data long enough for normal School Admin navigation. A first load displays a local skeleton. Returning to cached People data renders it immediately; a stale query may refresh without blanking the table. Small refresh feedback may be shown without blocking the screen.

Data is loaded only when required:

- Overview enables only its aggregate query.
- People enables only its paginated People query.
- Classrooms enables the classroom list; roster waits for a selected classroom.
- Create Classroom opening enables offerings.
- Add Member opening enables member candidates.
- Allocate/Replace Robot opening enables eligible Robot resources.

## Mutation invalidation

Invalidation is scoped to the data a mutation can change:

- Import Users invalidates People and Overview.
- Add Member invalidates the selected classroom roster, its candidates, and classroom summaries.
- Create Classroom invalidates Classrooms and Overview.
- Allocate/Replace Robot invalidates classroom summaries and the selected classroom's Robot-related queries. It does not invalidate People or offerings.

Mutation responses are not presented as successful before the Education API confirms persistence.

## Bulk provisioning

The import command will prefetch existing profile codes for the submitted organization and import kind once. Rows whose normalized school code already exists return `unchanged` without calling Supabase or opening a write transaction.

New rows retain the existing row-level behavior:

- A no-email student creates a domain user, active organization membership with role `student`, school profile, and `account_setup_pending` state in its row transaction.
- A student with email uses the server-side Supabase invitation flow, then creates/links the domain records.
- A teacher requires email, uses the server-side invitation flow, receives organization role `instructor`, and receives a school profile with employee code.
- One row failure does not roll back successful rows.
- Infrastructure diagnostics remain server-only; the browser receives classified safe messages.

Processing remains bounded and conservative. Email invitations are not parallelized blindly because provider delivery and rate limits are external constraints. Reimporting the same successful files returns `unchanged` and creates no duplicate Auth identity, public user, membership, profile, student code, or employee code.

The final verification dataset contains approximately 20 students with a useful grade mix and approximately five teachers. No-email students use no fake email, password, or Supabase identity. Teacher live verification requires real, authorized deliverable addresses supplied by the host operator. If those addresses are unavailable, teacher live provisioning is reported as `HOST VERIFICATION REQUIRED` rather than simulated.

## Error and security behavior

Organization scope comes exclusively from the authenticated user's permitted memberships and the path validated by the backend. The client cannot select an unauthorized organization or submit a classroom role.

The Supabase service-role key remains server-only and is never returned or bundled into `VITE_*` configuration. Raw Prisma, PostgreSQL, Supabase, SMTP, tokens, passwords, and service-role values never appear in browser responses or logs intended for users.

Frontend cache entries are organization- and classroom-scoped. Session changes clear the active query cache so one identity cannot see another identity's cached School Admin data.

## Testing and measurement

Implementation follows test-first development. Automated coverage includes:

- Overview aggregate and organization authorization.
- People pagination, stable ordering, search, and role filtering.
- Member-candidate search, pagination, organization scoping, and `alreadyMember`.
- Query-key organization/classroom scoping.
- Scoped mutation invalidation.
- Lazy offerings, candidates, roster, and eligible Robot requests.
- Removal of duplicate membership requests.
- Bulk student and teacher idempotency.
- No-email pending students and safe invitation failure.
- Classroom role derivation and role-forgery regression.
- Robot Allocation regression.

After implementation, the same authenticated request harness used for the baseline will measure initial School Admin requests, SchoolManagement requests, People → Classroom → People requests, cold and warm timing, People/Classroom API timing, and practical DB-query counts. Measurements that cannot be reproduced are reported as `NOT MEASURED`; no value is inferred or manufactured.

The required quality gates are Education API build/tests, Web build/tests, Prisma validation, and `git diff --check`.

The final report separates code verification, live verification, and host-required verification. WF-01 is `DEMO READY` only if the required live provisioning, persistence, membership, authorization, Robot Allocation regression, and performance flows pass.
