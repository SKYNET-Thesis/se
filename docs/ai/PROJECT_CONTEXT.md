# VISTA project context

Last reviewed: 2026-11-11. This is a compact orientation document, not proof
that a feature is deployed or accepted. For progress and evidence, use
[`CURRENT_STATUS.md`](CURRENT_STATUS.md), then verify relevant claims against
the current checkout and the linked source/operational records.

## Project identity and purpose

**Official project title:** *VISTA: Vision-Language-Action System for Tabletop
Manipulation with Dual Robot Arms.* Repository and handoff documents also use
“VISTA — Robotics & AI Education Platform.” The project is an FPT University
SEP490 capstone (FA26SE183 / GFA26SE94, as recorded in the dated project
handoff).

VISTA's documented product goal is a robotics learning environment in which
school learners progress from concepts and guided activities to authoring a
robot program, proving that exact program in an authoritative task simulation,
and—when the required authorization and hardware safety gates are met—running
that qualified program on a physical robot. The platform is intended for
students (the handoff targets THCS–THPT), teachers/instructors, school and
system administrators, and supervised robot operators. The education system
owns learning, identity/scope authorization, evaluation, progression, and
evidence. The separate local robot-control boundary owns device readiness,
physical motion, and emergency stopping.

The expected product outcome described by the project documents is a working
education platform and a demonstrated robotics learning loop, supported by
source code, tests, architecture/operations documentation, and project/demo
evidence. This is the documented product direction; this repository does not
establish a complete contractual deliverable checklist or prove final
acceptance.

## Product objectives and course direction

- Make robotics concepts teachable through structured courses and classroom
  delivery, with learning activities connected to programming and experiments.
- Keep assessment and course progression authoritative on the server so a
  browser cannot invent grades, PASS results, completion, or robot permission.
- Preserve program/version provenance and evidence across simulation and any
  later physical experiment.
- Provide a path from Course 1 fundamentals toward robot programming and
  intelligent robotics. Courses 2 and 3, including VLA experiences, are roadmap
  direction and must not be described as complete because their curriculum is
  documented.

The dated handoff describes Course 1 as Robotics Fundamentals: meet the robot,
movement, gripper/object interaction, 3D pick-and-place, and a physical robot
lab. Its intended vertical slice is authentication → course/lesson → program
authoring → immutable ProgramVersion → authoritative simulation result →
qualification → robot entitlement/allocation and safety checks → physical
execution → evidence → teacher review. See [the product rules](../education/VISTA_PRODUCT_RULES.md)
and [robot safety boundary](../education/robot-safety-boundary.md).

## Functional scope and present implementation boundaries

| Area | Intended responsibility and boundary |
| --- | --- |
| Education Platform | Role-aware student, teacher, school-admin, and system-admin learning workflows. NestJS API is authoritative for identity mapping, permissions, resource scope, grading, and progression. |
| Course Builder | System-admin course catalog and canonical Course → Lesson → Section → Activity authoring, ordering, prerequisites, preview, and publishing. Source and tests exist; role-route and end-to-end acceptance remain open. |
| Reading and Video | Reading/video activities are learning content. Media bytes belong in private object storage; metadata and associations belong in PostgreSQL. A video preview or activity record alone does not prove a complete secured media workflow. |
| Question Bank and Quiz Engine | Reusable canonical questions/versions feed knowledge checks. Attempts use immutable public/grading snapshots; grading is server-side. Keep a knowledge check distinct from larger course assessment and teacher-graded work. |
| Classroom Delivery | Published courses are selected through school-scoped offerings/classrooms; teachers deliver assignments/quizzes to authorized classrooms. Membership and tenant scope are checked server-side. |
| Student Learning | Enrollment-scoped course learning, activity progress, quizzes, and assignment workflows. The UI presents server state; it must not fabricate completion or scores. |
| Learning Media | Education API authorizes upload/download and records metadata; object bytes are in a private S3 Learning Media bucket with scoped, time-limited access. The local S3-compatible integration is separate from AWS Production. |
| Robot Teleoperation | Existing `web/checkIk` control/teleoperation code is a hardware-control subsystem. It remains subject to CHECKIK's ownership, readiness, stop, calibration, and safety behavior; it is not the Education API or browser learning simulator. |
| Digital Twin | The repository has a browser SO-101 viewer and a Python read-only telemetry service with mock/physical-input boundaries. A visual model or mock stream is not a calibrated synchronized physical twin. Physical correspondence requires reviewed calibration and fresh measured telemetry. |
| SO-101 Robot Runtime | Private Python R1 runtime validates a narrow canonical command set, fails closed by default, and exposes run/status/cancel/stop contracts. Hardware is disabled by default; an explicit fake-follower path exists. Physical commissioning values and hardware verification are separate gates. |
| AI/VLA integration | The project direction includes camera/visual observation + text prompt → VLA model → robot action. Students are not expected to train foundation models in the core learning flow. Current `services/ai-integration/src/main.py` is only a startup placeholder; no completed inference pipeline is established by that file. |

## Intended hardware

The intended manipulation setup is **two leader arms and two follower arms**
(two leader–follower pairs), with cameras and local control/safety components as
required by the selected setup. This states the intended hardware architecture
from the project brief; it does not confirm that four arms are present,
commissioned, simultaneously controlled, or integrated with the current
runtime. The repository's R1 runtime and runbooks describe bounded per-arm
commissioning. Verify physical asset inventory and calibration with the
operator before making hardware claims.

## Verified technology map

These technologies are evidenced by the current repository manifests and
source. Their presence does not establish a deployed Production service.

- **Web learning platform:** React 18, TypeScript, Vite, React Router, TanStack
  Query, Tailwind CSS, Blockly, Three.js, and `urdf-loader` (`web/robot-edu`).
- **Education API:** Node.js/TypeScript, NestJS, Prisma Client, and Jest
  (`services/education-api`).
- **Identity and data:** Supabase Auth JWTs and PostgreSQL (Supabase in the
  documented production target). Prisma is the application model/client, not
  the Production DDL release mechanism.
- **Schema release:** repository-owned Python SQL migration runner and
  immutable SQL/manifest workflow under `database/migrations/`.
- **Learning Media / IoT integrations:** AWS SDK clients for S3, IoT Data Plane,
  and SQS are dependencies in the Education API; the repo also contains
  Terraform roots and local integration configuration. This is not evidence
  that the corresponding Production resources are deployed.
- **Robot runtime:** Python 3, private HTTP service, checked runtime contract,
  and optional AWS IoT MQTT/TLS bridge (`services/robot-runtime`).
- **Digital Twin telemetry:** Python 3.12, FastAPI, Pydantic, Uvicorn, and
  WebSockets (`services/digital-twin`); browser visualization uses React/Three.js.
- **AI integration:** a Python service directory exists, but the inspected
  entry point is a placeholder; model/provider dependencies and live VLA
  behavior are not established.
- **Other repository scope:** Expo/React Native mobile code, a Python
  CHECKIK/teleoperation subsystem, and other legacy/research components exist.
  Read their local README and architecture before treating them as part of the
  Education Platform runtime.

## System responsibilities and data boundaries

```text
Student / Teacher / Admin browser
             │ HTTPS + Supabase JWT
             ▼
NestJS Education API ─────── PostgreSQL / Supabase
       │                     identity-linked business data,
       │                     curriculum, authorization, attempts,
       │                     progress and evidence metadata
       ├─────────────────── Private S3 Learning Media
       │                     object bytes; scoped temporary access
       │
       └── authorized run request / status
                    ▼
             Private Robot Runtime ─── CHECKIK ─── SO-101 hardware
                    │                         readiness, calibration,
                    └── AWS IoT bridge       exclusive control, Stop/E-stop

Physical-owner telemetry ───► read-only Digital Twin service ───► viewer
```

- **Frontend:** renders authoring/learning interfaces and visual previews. It
  must not decide authoritative grades, bypass API authorization, or issue raw
  hardware commands.
- **Education API:** authenticates Supabase JWTs; resolves VISTA identity and
  active organization/classroom scope; owns business authorization, quiz
  grading, curriculum/progression, and orchestration/evidence records.
- **Database:** PostgreSQL stores relational business state and media metadata.
  The checked-in product rules say API service authorization is authoritative
  today: the Prisma role has owner/BYPASSRLS privileges and Learning-table RLS
  has no policies. Do not claim RLS currently enforces tenant isolation for
  those Prisma calls; do not disable RLS or add permissive policies as a bypass.
- **Learning Media storage:** one private S3 bucket is the intended storage
  boundary for learning files. PostgreSQL stores metadata, not file bytes.
- **Robot Runtime and CHECKIK:** runtime accepts only bounded canonical R1
  actions; CHECKIK owns low-level device access, readiness, calibration,
  exclusive hardware ownership, Stop/E-stop, and cleanup. The API owns learner
  authorization; it does not move hardware itself.
- **Digital Twin:** separates mock/simulation frames from physical measured
  telemetry. Physical frames come from the existing owner and need identity,
  scope, freshness, units, and reviewed calibration. A preview is not
  simulation; simulation is not physical execution.
- **Infrastructure:** AWS IoT Core/MQTT/TLS, SQS feedback, EC2/container
  deployment, and related Terraform describe controlled deployment paths.
  Diagrams/runbooks are not proof of live Production state.

The canonical education-platform container view is
[C4 Level 2](../diagrams/architecture/c4-2-container.md). The older
[container architecture](../architecture/container-architecture.md) explicitly
describes a legacy teleoperation/runtime view.

## Project and engineering constraints

- Preserve Course → Lesson → Section → Activity and the canonical Question
  Bank. Keep assignment/delivery, attempt, submission, and activity concepts
  distinct.
- Keep quiz and program snapshots immutable; never rewrite historical attempts
  or ProgramVersions to reflect current source content.
- Enforce RBAC plus database-derived organization/classroom scope at the API.
  Never trust client-supplied user or organization identity.
- Production DDL goes through the repository SQL migration runner. Never use
  Prisma `db push`/Prisma Migrate against Production, edit released migrations,
  fabricate ledger entries, or apply migrations without explicit approval for
  the exact target and scope.
- Never write Production data, mutate AWS, apply/destroy Terraform, deploy, or
  perform physical robot actions without the required explicit approval.
- Inspect Git status first; preserve all unrelated work. Never reset, clean,
  stash, discard, commit, push, or overwrite another agent's changes without
  explicit authorization.
- Fail closed for missing authorization/readiness/feedback, stale or malformed
  telemetry, uncertain cleanup, or unsafe robot state. Stop/E-stop is not
  bypassed or automatically unlocked by VISTA.
- Treat status reports, plans, test files, and diagrams according to their
  evidence level. Code presence is not a passing test, a successful build, a
  live deployment, a commissioned robot, or end-to-end acceptance.

## Source map

- Progress and evidence: [`CURRENT_STATUS.md`](CURRENT_STATUS.md).
- Agent workflow and task contract: [`WORKFLOW_RULES.md`](WORKFLOW_RULES.md).
- Product/access rules: [`../education/VISTA_PRODUCT_RULES.md`](../education/VISTA_PRODUCT_RULES.md).
- Robot safety: [`../education/robot-safety-boundary.md`](../education/robot-safety-boundary.md).
- Production SQL: [`../operations/production-migration-ownership.md`](../operations/production-migration-ownership.md).
- Phase 2.4.3 acceptance and isolated services: [`../operations/phase-2-4-3-local-acceptance.md`](../operations/phase-2-4-3-local-acceptance.md).
- AWS IoT/SO-101 rollout: [`../operations/aws-iot-so101.md`](../operations/aws-iot-so101.md).
- Detailed C1/course and hardware direction (dated, not current evidence): [`../../VISTA_MASTER_CONTEXT_UPDATED_2026-11-07.md`](../../VISTA_MASTER_CONTEXT_UPDATED_2026-11-07.md).
