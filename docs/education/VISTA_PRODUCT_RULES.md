# VISTA Product Rules

## Purpose and authority

This is the long-lived engineering rulebook for VISTA. It records product,
business, security, and safety invariants; it is not a progress report. When
documents conflict, use this order: live schema and applied migrations, actual
repository implementation, this rulebook, roadmap, AI handoff, then legacy
documents.

## Product loop and actors

VISTA is an educational VLA robotics platform with the learning loop:
`Learn → Predict → Build → Experiment → Reflect → Assess`.

The supported actors are student, instructor, organization administrator, and
system administrator. Classroom roles are relationship data used for resource
scope; they never replace RBAC.

## Identity and session rules

- Supabase Auth owns authentication and sessions. NestJS consumes Supabase
  access JWTs; it must not create a second login/session system.
- Request identity is only `JWT sub → auth.users.id →
  public.users.auth_user_id → public.users.id`.
- Email is never normal request-time identity resolution.
- A disabled `public.users` account is denied every protected VISTA API.
- Memberships can be multiple. Only active memberships grant organization
  scope; suspended and revoked memberships grant none.

## Authorization rules

- A permission is necessary but not sufficient. Every protected resource must
  have an independently verified database-derived scope.
- Never trust client-supplied `userId`, `learnerUserId`, or `organizationId` as
  authority. Derive subject from `CurrentUser` and organization from the target
  resource.
- Cross-organization access is denied. Return 404 for inaccessible resource
  lookups where revealing existence would be harmful.
- Use permission codes and active membership data; do not spread role-name
  checks through controllers. A system administrator uses authoritative
  system-level RBAC only.
- `membership.manage` is organization-scoped, `role.assign` is only
  system-role administration, and `learning.experiment.execute` never grants
  `robot.control`.

## Application and database boundary

The MVP application boundary is:
`Frontend → Supabase JWT → NestJS guards/services → Prisma → PostgreSQL`.

The current Prisma role is PostgreSQL owner `postgres` with `BYPASSRLS`; JWT
claims are not propagated into PostgreSQL. Thus NestJS authorization is the
authoritative API boundary today. Learning-table RLS stays enabled but has no
policies, must not be described as protecting Prisma calls, and is deferred
hardening. Direct browser Supabase access/writes to `learning_*` are forbidden;
do not disable RLS or add permissive temporary policies.

## Existing learning domain

Keep these distinct:
`Course → Course Offering → Classroom` and
`Lesson/Challenge → Assignment → Classroom Assignment → Attempt → Work`.

An instructor needs both `learning.delivery.manage` and an active teacher or
teaching-assistant relationship to the target classroom. A student may see or
create only work reachable through an active own classroom relationship and
active organization membership.

## Programming and submission model

- Program belongs to a learner and may be associated with an assignment.
- AssignmentAttempt points to the selected Program through
  `learning_assignment_attempts.program_id`; do not add a redundant
  `learning_programs.attempt_id`.
- Program has immutable, ordered ProgramVersions. A historical version is never
  edited.
- Submission retains `program_id` and must additionally reference the exact
  submitted ProgramVersion through nullable
  `learning_submissions.program_version_id`.
- NestJS transaction and tests enforce that a submitted version belongs to the
  submitted program and that program is authorized for the student’s attempt.
  Foreign keys alone cannot express this complete cross-table invariant.
- Blockly is input/workspace representation only. RobotProgram is a versioned,
  deterministic, structurally validated IR. Never execute arbitrary Blockly or
  JavaScript, invent physical coordinates, or claim robot execution.

## Truthful terminology and execution

- A schematic preview is visual and deterministic only; it is not simulation.
- Simulation requires a real simulator/runtime. Digital twin requires meaningful
  calibrated/synchronized physical correspondence.
- Experiment creation does not authorize a robot. Only expose modes that exist;
  never fabricate successful execution.
- NestJS owns authorization, business state, persistence, and orchestration.
  Python Robot Runtime owns hardware, calibration, motion, camera operations,
  safety behavior, and E-stop.
- The physical boundary is `NestJS → Robot Runtime Adapter → Python Runtime →
  Robot Hardware`. Do not port Python hardware code into NestJS.
- Physical motion requires `learning.experiment.execute` + `robot.control`, an
  authorized robot/control session, readiness, valid calibration, and safety
  authorization. E-stop is independent of ordinary business authorization.

## Reuse and persistence

Reuse the existing schema before creating concepts: demonstration episodes and
annotations, dataset versions/episodes, training runs/models/checkpoints,
learning VLA interactions/action steps, assessment/feedback/reflection/
competency records. Store large artifacts in appropriate object storage, not
blindly in relational rows. Database state must truthfully reflect workers and
providers; `not_configured`, `unavailable`, or `queued` is preferable to a
fabricated result.

## Offering enrollment rules (owner decision, 2026-11-23)

An Offering may carry an enrollment window (`enrollment_open_at`, `enrollment_close_at`) and a student cap (`max_students`).

- **Self-enrollment** (a student enrolling through the catalog) is allowed only while the window is open (`[open, close)`, database clock) and
  while the offering has fewer students than its cap. The cap counts distinct students with an active student membership in an active
  classroom of the offering, across all of its classrooms. The classroom's own capacity and `self_enrollment_open` flag still apply.
- Self-enrollment locks the offering row, then the classroom row, so concurrent students cannot exceed the cap. A refused request is `409`
  `ENROLLMENT_NOT_ELIGIBLE` with `reasons` (readable) and `reasonCodes` (`ENROLLMENT_NOT_OPEN`, `ENROLLMENT_CLOSED`, `OFFERING_FULL`,
  `CLASSROOM_FULL`, `ALREADY_ENROLLED`, `PREREQUISITE_NOT_MET`).
- **Authorized administrative enrollment** (a School Admin adds a member, imports students, or publishes a course) is an override: it is not
  blocked by the window or the cap, as before. The school sees the effect: the offerings list reports `enrolledStudents`.
- Offering dates must be orderable (end after start; enrollment closes after it opens and not after the offering ends).

## AI model and dataset registry visibility (owner decision, 2026-11-23; SRS UC-08 / FR-08)

The registry is read-only metadata. It never runs a model.

- **System Administrators** and holders of `model.use` keep the existing full view (public models plus the private models they own or are
  entitled to, with owner references).
- **Students and Teachers (active `student` / `instructor` membership)** may read the metadata of **public** models without `model.use`:
  model card, versions (stored metrics, Hugging Face source), and training-data lineage. Public visibility does not grant `model.use`, never
  reveals private or entitled-private models, owner references, artifact locations, dataset provenance or unreleased datasets.
- Lineage (`GET /model-checkpoints/:id/training-data`) returns a dataset's name, version, source and frozen state; a public-only reader sees it
  only for **frozen** (released) dataset versions. Datasets have no visibility flag, so there is no separate public dataset list: a student's
  own dataset versions, training runs and evaluation runs stay owner-scoped (`/me/...`).
- School Admins, Teaching Assistants and people without an active membership get no registry access (the API answers 404).
- No migration is needed: the access decision is made in the API (`modelAccess`), not in a database permission.

## Assessment rules

Do not collapse machine evaluation, instructor assessment, feedback, student
reflection, and competency progress into one generic score. The intended path
is `Submission → Machine Evaluation → Instructor Review → Rubric Assessment →
Feedback → Reflection → Competency Progress`, using actual schema relations.

## Schema and migration discipline

- The 72 existing public-domain tables are the baseline. Inspect Prisma and the
  live database before every schema change.
- Prove the business gap, choose the smallest additive change, preserve rows,
  make it idempotent where practical, verify it after application, and update
  the handoff.
- Autonomous work may include normal code, tests, docs, safe refactors,
  justified indexes, and the approved nullable M2C
  `learning_submissions.program_version_id` FK/index migration.
- Never recreate/reset the schema, drop domain data, silently perform a
  destructive migration, duplicate an existing concept, weaken authorization,
  alter identity/RBAC/cardinality/program ownership/safety boundaries, enable
  direct learning writes, or apply incomplete RLS.
- At a stop-rule boundary, report: architecture checkpoint, current state,
  problem, options, recommendation, data impact, security impact, and files.

## Quality and documentation

Every vertical slice needs meaningful layered tests: service/scope tests,
HTTP/guard/DTO tests, and real Supabase verification for critical release/demo
security when practical. A successful build alone is not done. After every
milestone, update `AI_HANDOFF.md` and scan it for contradictory claims about
implemented endpoints, applied migrations, or permissions.

