# VISTA — Robotics & AI Education Platform

> **SEP490 Capstone Project · FA26SE183 · SKYNET-Thesis**<br>
> Project snapshot: **November 1, 2026** · Status: **Active development / Defense preparation**

VISTA is a robotics and AI education platform designed for secondary and high-school learners. Rather than functioning as a conventional learning management system, VISTA connects **structured lessons**, **visual robot programming**, **authoritative 3D task simulation**, and **physical robot experiments** into one traceable learning experience.

The core learning journey is:

**Learn → Program with Blockly → Simulate → Receive server-verified results → Qualify → Execute on a physical robot → Review evidence.**

> **Implementation status notice:** This README reflects the November 1, 2026 project handoff, not a fresh audit of the repository or a live hardware test. Some features have passed reported automated checks but have **not** been verified through a complete live end-to-end flow.

## Table of contents

- [What VISTA provides](#what-vista-provides)
- [Applications and services](#applications-and-services)
- [System architecture](#system-architecture)
- [Course 1 learning journey](#course-1-learning-journey)
- [Web application](#web-application)
- [Desktop Robotics Lab](#desktop-robotics-lab)
- [Education API and data](#education-api-and-data)
- [Security and robot safety](#security-and-robot-safety)
- [Repository structure](#repository-structure)
- [Local development](#local-development)
- [Deployment strategy](#deployment-strategy)
- [Current implementation status](#current-implementation-status)
- [Project scope and roadmap](#project-scope-and-roadmap)
- [Team and academic context](#team-and-academic-context)

## What VISTA provides

VISTA is intended to support four connected experiences:

1. **Student learning:** Explore robotics concepts, progress through lessons, answer knowledge checks, build Blockly programs, and validate task outcomes.
2. **Teacher instruction:** Assign and assess learning activities, review student progress, inspect submitted programs and experiment evidence, and provide feedback.
3. **School administration:** Manage school users, classrooms, course offerings, enrollment, and robot resource allocation with role-based access control.
4. **Physical robotics:** Use an authorized local robotics workstation to verify readiness, execute a qualified program on an SO-101 robot, and record physical experiment outcomes.

The **Course 1 end-to-end experience** is the primary P0/Defense priority. More advanced AI, VLA, model training, and dataset-management capabilities are not prerequisites for the core demo.

## Applications and services

| Component | Technology / environment | Responsibility |
| --- | --- | --- |
| **VISTA Web** | React | Student/teacher/admin UI; course navigation, Blockly authoring, 3D visualization, progression and evidence views. |
| **VISTA Desktop Robotics Lab** | Local desktop/workstation application; implementation details to be confirmed from source | Local robot connection, status/readiness, physical execution interaction and result presentation. MVP remains in progress. |
| **Education API** | NestJS | Business authorization, RBAC, course progression, immutable program versions, authoritative simulation evaluation, physical execution authorization and evidence persistence. |
| **Database & authentication** | PostgreSQL, Prisma, Supabase Auth | Persistent education data and authenticated identities/sessions. |
| **Robot Runtime** | Local/edge service | Physical execution orchestration, robot status, stop handling and communication with CHECKIK. |
| **CHECKIK** | Existing Python-based robot-control stack | Low-level motion, camera/calibration, safety, E-stop and hardware control. |
| **Robot hardware** | SO-101 | Physical learning experiments, including Pick & Place. |

**Important boundary:** The Web and Desktop interfaces do not independently decide that a simulation has passed, and neither may bypass the physical safety gates. The Education API owns business decisions; Robot Runtime and CHECKIK own local execution and safety enforcement.

## System architecture

VISTA separates the student-facing Web application, the local Desktop Robotics Lab, the Education API, and the robot-control stack. The React Web app communicates with the NestJS Education API for learning, identity, evaluation, and authorization. The Desktop Robotics Lab supports local robot connectivity and execution workflows through Robot Runtime, while CHECKIK retains low-level motion and safety responsibility. PostgreSQL and Supabase provide persistent data and authentication. A secure cloud-to-edge device bridge is part of the target architecture; its live implementation must be verified separately.

### Critical learning and execution boundaries

- **WF-05 — Student Programming & Submission:** Blockly → Draft → Save → immutable `ProgramVersion` → Submission.
- **WF-17 — 3D Task Simulation & Server-side Evaluation:** `ProgramVersion` → authoritative simulation → PASS/FAIL → evidence → progression.
- **WF-10 — Robot Experiment Execution & Evidence:** qualified `ProgramVersion` → authorized physical execution → physical evidence.

These workflows must remain distinct even when they appear as a continuous student journey.

## Course 1 learning journey

**Course 1: Robotics Fundamentals** is the core demonstrable product slice.

| Lesson | Learning objective | Authoritative completion rule |
| --- | --- | --- |
| **C1-L1 — Meet Your Robot** | Learn robot components, joints, gripper, camera, workspace and safety. | Server-graded knowledge check; target score **≥ 80%**. |
| **C1-L2 — Move the Robot** | Build an ordered Blockly movement sequence. | Server-authoritative target-pose simulation using an immutable program version. |
| **C1-L3 — Grab & Release** | Understand approach, grasp, lift and release. | Server-authoritative object/gripper simulation. |
| **C1-L4 — Pick & Place** | Move an object into a target zone. | Authoritative simulation verifies grasp → lift → release → object in target zone. |
| **C1-L5 — Physical Robot Lab** | Execute the qualified L4 program on an SO-101 robot. | **Only a terminal, successful physical experiment** completes L5. |

### Exact-program provenance

The successful L4 simulation establishes a **qualified immutable `ProgramVersion`**. C1-L5 must execute **that exact version**; the student does not create a different program merely to run the robot.

For physical execution, the Education API must verify the learner's identity and permissions, robot entitlement and allocation, session conflicts, and robot readiness before authorizing a request. The local Robot Runtime and CHECKIK must independently enforce safety checks and may reject execution. The resulting experiment status and evidence are persisted by the Education API. **L4 PASS only unlocks L5; it never completes L5.**

The physical-execution sequence is the **required P0 behavior** and must not be interpreted as a verified live integration.

## Web application

The React Web application is the primary learning interface. Its intended capabilities include:

- **My Learning / Course Path:** Server-driven course and lesson availability, progress and lock reasons.
- **Course Information:** Course-wide overview, learning outcomes and structure.
- **Focused Learning Workspace:** Immersive lesson/activity reader with Course Material navigation, without a persistent global application sidebar.
- **Practice Quiz:** Lightweight knowledge checks, including the existing server-graded C1-L1 quiz.
- **Blockly Programming:** Server-driven allowed blocks, saved drafts and immutable program versions.
- **3D Simulation:** Responsive visualization of robot/object behavior; authoritative PASS/FAIL is computed by the Education API.
- **Results and Evidence:** Evaluation outcomes, reasons for failure and saved program/evidence references.
- **Physical Robot Lab entry point:** View qualified L4 program, robot readiness and physical experiment status when the integration is available.
- **Teacher and school administration:** Classroom, assignment, assessment, enrollment and robot-resource workflows, with implementation status varying by module.

The handoff identifies a remaining **Focused Learning information-architecture fix**: remove the persistent global sidebar in focused mode, make Course Material the dedicated navigator, use actual backend course hierarchy, and prevent stale lesson content while navigating.

## Desktop Robotics Lab

The **Desktop Robotics Lab** is the local workstation-facing part of VISTA's physical robotics experience. It complements the Web learning journey rather than replacing the Education API or the local robot-control stack.

### Intended MVP responsibilities

- Connect to or discover the configured local Robot Runtime.
- Display robot **online/offline**, readiness and calibration/safety status as reported by authoritative sources.
- Show the **exact qualified L4 `ProgramVersion`** selected for a physical experiment.
- Present execution preflight requirements and require an explicit user confirmation before motion.
- Display experiment lifecycle states, including starting, running, succeeded, failed, stopped, cancelled or timed out as supported by the backend/runtime contract.
- Expose safe stop interaction through the Runtime; **never** implement direct browser/desktop motor control that bypasses CHECKIK.
- Show real execution results and persisted evidence; never fabricate robot readiness, recordings or successful runs.

### Responsibility split

| Layer | Owns | Must not do |
| --- | --- | --- |
| **Desktop UI** | Local user interaction, connection/status display, execution confirmation and result presentation. | Grant its own robot authorization or bypass safety checks. |
| **Education API** | Identity, qualification, classroom/robot entitlement, allocation, execution authorization and persisted Experiment records. | Directly drive servos or override local E-stop. |
| **Robot Runtime** | Edge execution lifecycle, status, stop, hardware orchestration and CHECKIK integration. | Treat an unverified UI action as sufficient authority for motion. |
| **CHECKIK** | Low-level robot motion, calibration, E-stop and local safety. | Depend solely on cloud authorization to determine whether motion is safe. |

**Status:** The Desktop/Physical Robot Lab MVP and physical C1-L5 integration were **not complete** in the November 1 handoff. The handoff does **not** establish the Desktop framework, exact source directory, packaging commands or a completed desktop build; those details should be added only after inspecting the repository.

## Education API and data

The NestJS Education API is the business and evaluation authority for VISTA:

- Authentication integration and role-/scope-based authorization.
- Courses, lessons, prerequisites and progression.
- Classroom offerings, enrollment and assignments.
- Blockly drafts, submissions and immutable `ProgramVersion` provenance.
- Server-side deterministic simulation evaluation and PASS/FAIL reasons.
- Experiment lifecycle, events, artifacts and evidence persistence.
- Robot entitlement, classroom allocation, readiness checks and ControlSession rules.
- Teacher review and feedback.

Existing database concepts to inspect and reuse include `learning_courses`, `lessons`, `lesson_progress`, `offerings`, `classrooms`, `enrollments`, `assignments`, `programs`, `program_versions`, `submissions`, `challenges`, `experiments`, `symbolic_evaluations` and `ControlSession`. **Do not introduce duplicate simulation or evidence models without first auditing the current schema.**

### Authentication

The frozen student-facing login design is:

**School Code + Student Code + Password**

Staff use the appropriate staff authentication flow. **Supabase Auth** remains the password/session authority; VISTA maps school/student identifiers to a stable internal identity associated with the Supabase `auth_user_id`. Provisioning, one-time setup codes and recovery codes must use short expiry, one-time consumption, hashed storage, rate limits and audit trails.

## Security and robot safety

The following are non-negotiable:

1. The browser and Desktop UI cannot submit trusted `passed`, `score` or task-state flags to force completion.
2. The Education API recomputes authoritative simulation outcomes from the stored immutable program and challenge snapshot.
3. A successful L4 simulation **unlocks** L5 but does not complete it.
4. A physical experiment completes L5 **only** when its terminal status is `succeeded`.
5. Entitlement, allocation, session ownership, readiness, calibration, safety and explicit confirmation are separate requirements.
6. Cloud authorization alone cannot force physical motion; the local Runtime/CHECKIK safety layer may refuse execution.
7. Web clients must not directly call CHECKIK or control robot motors.
8. Device credentials, service-role secrets and database passwords must never be committed to Git.
9. Do not claim physical evidence, a successful robot run or live end-to-end verification unless observed and recorded.

## Repository structure

The confirmed repository root and key paths from the handoff are:

```text
se/
├── web/
│   └── robot-edu/              # React Web application
├── services/
│   ├── education-api/          # NestJS Education API
│   └── robot-runtime/          # Local/edge Robot Runtime
├── docs/
│   ├── review-2/               # Frozen Review 2 baseline
│   └── post-review2/           # Post-Review 2 implementation documents
└── ...                         # Other directories: verify from current Git tree
```

**Desktop source path:** Not confirmed by the handoff. Locate the actual Desktop app directory in the repository before documenting build/package commands. CHECKIK is an existing robot-control integration; its exact repository location is also not established by this handoff.

## Local development

### Prerequisites

- Git.
- Node.js and the package manager versions required by each application's manifest/lockfile.
- Access to the project's configured PostgreSQL database and Supabase Auth environment.
- Any required Prisma tooling and environment variables described by the Education API source.
- For physical experiments: a compatible local Ubuntu robotics workstation, Robot Runtime, CHECKIK and SO-101 hardware.

### Clone the repository

```bash
git clone https://github.com/SKYNET-Thesis/se.git
cd se
```

### Start the Web and Education API

The following commands navigate to the **confirmed directories**. Install/start commands are intentionally not asserted because the handoff does not specify package manager, script names or environment-file contracts.

```bash
# Terminal 1 — Web
cd web/robot-edu
# Inspect package.json and the lockfile, install dependencies,
# configure the required environment, then run the development script.

# Terminal 2 — Education API
cd services/education-api
# Inspect package.json, Prisma configuration and environment contracts,
# install dependencies, run required DB setup, then start the API.
```

Before testing integration, verify that the Web is configured to call the correct Education API endpoint and that authentication, CORS, database connectivity and seeded Course 1 data work together.

### Start the local robot stack

```bash
cd services/robot-runtime
# Follow the runtime-specific setup and startup instructions
# found in the current source repository.
```

**Do not attempt physical motion** until the correct robot, calibration, E-stop, safe workspace and authorized ControlSession have been verified locally. The Desktop startup/package command must be documented from its actual source once identified.

### Validation expectations

- Run the relevant test, lint, type-check and build scripts defined in each application.
- Verify the live browser → Education API → database path separately from unit/integration test results.
- Verify L2–L4 progression, immutable versions, persisted evidence and L4 → L5 qualification.
- For hardware claims, record the actual Runtime/CHECKIK/SO-101 test path and observed outcome.

## Deployment strategy

### Documented target architecture

The November 1 handoff defines the **target**, not an already completed deployment:

```text
React Web → Amazon S3 + CloudFront
Business API → VPC + ALB + 2 × EC2 (NestJS, high availability)
Device bridge → AWS IoT Core + Device Shadow + IoT Rules
Ubuntu edge → MQTT/TLS agent → Robot Runtime → CHECKIK → SO-101
External services → Supabase Auth/PostgreSQL
CI/CD → GitHub Actions
```

AWS IoT Core is a secure command/status/telemetry bridge, **not** a motor controller. Continuous video should not be streamed through MQTT.

### Proposed credit-conscious staging alternative

During development, the team is **considering** a lower-cost interim setup:

```text
React Web → S3 + CloudFront
NestJS Education API → API Gateway + AWS Lambda
Auth / DB → Supabase
Robot Runtime + CHECKIK → local edge workstation
```

This is a **deployment proposal**, not a verified deployed environment. Lambda compatibility, Prisma connection management, request timeouts, device messaging, environment secrets and logging must be validated before adoption. If the project later moves to EC2, keep the NestJS business modules independent of the Lambda-specific entry point.

**Do not present the proposed Lambda staging architecture or the two-EC2 target as deployed until deployment and smoke tests confirm it.**

## Current implementation status

The following reflects **reported handoff status** as of November 1, 2026:

| Milestone | Reported status | Notes |
| --- | --- | --- |
| P0.1 Course 1 curriculum/progression | **PASS** | Authoritative course path, L1 grading, progression. |
| P0.2 My Learning / Course Path | **PASS** | Server-driven navigation and locked states. |
| P0.3 Lesson Detail / Guided Practice | **PASS** | Live end-to-end UI not verified. |
| P0.4 Server-driven Blockly | **PASS** | Drafts and immutable program versions. |
| P0.5 L2 simulation | **PASS** | Server-authoritative target-pose task. |
| P0.6 L3 simulation | **PASS** | Grasp/lift/release semantics. |
| P0.7 L4 simulation | **PASS** | Pick & Place qualification; L5 unlocked, not completed. |
| P0.8 Result/Evidence / L4→L5 handoff | **Needs verification** | Inspect current branch and persistence/reload behavior. |
| P0.9 Physical Robot Lab | **Not complete** | Real qualified-program execution remains a core gap. |
| P0.10 Robot authorization/readiness | **Not complete** | Entitlement, allocation, safety and session gates. |
| P0.11 Student/teacher evidence | **Not complete** | Review and feedback. |
| P0.12 Seeded E2E / Defense demo | **Not complete** | Requires real-stack verification. |

The handoff additionally identifies a pending **Focused Learning UI architecture fix**. Check `git status`, current branch and recent commits before assuming that fix has or has not since been implemented.

## Project scope and roadmap

The post-Review 2 implementation baseline contains **17 workflows**: **12 P0, 3 P1, 1 P2 and 1 Future Work**. The first priority is the complete Course 1 learning-to-robot vertical slice.

### Immediate priorities

1. Finish and visually verify Course Information Architecture / immersive Focused Learning UI.
2. Keep Practice Quiz separate from teacher-graded Assessment semantics.
3. Verify persisted simulation results, evidence and exact L4→L5 qualified-program handoff.
4. Implement the Physical Robot Lab UI/backend/runtime integration.
5. Enforce entitlement, allocation, readiness, safety and ControlSession gates.
6. Implement teacher-facing evidence review and feedback.
7. Run and document the seeded, live end-to-end Defense demo.

### Deferred / later scope

- **Course 2:** Robot Programming & Automation.
- **Course 3:** Intelligent Robotics, including computer vision and text-prompt-driven VLA experiences.
- **Dataset management/versioning:** P2.
- **Model training/checkpoint management:** Future Work.

Do not sacrifice the Course 1 physical vertical slice to implement advanced AI features.

## Team and academic context

- **Project:** VISTA — Robotics & AI Education Platform
- **Capstone:** SEP490
- **Subject code:** FA26SE183
- **Team:** SKYNET-Thesis
- **Team leader:** Lê Nguyễn Quang Đức
- **Repository:** [SKYNET-Thesis/se](https://github.com/SKYNET-Thesis/se)
- **Supervisor:** Lâm Hữu Khánh Phương

### Development workstreams

| Workstream | Current team responsibility |
| --- | --- |
| Web / Desktop UI and integration | Lê Nguyễn Quang Đức |
| Blockly and 3D simulation | Trần Tiến Đạt |
| Robot Runtime, CHECKIK and SO-101 | Phạm Viết Lợi |
| Education API, database, authentication and authorization | Vũ Anh Tuấn |

These assignments reflect the team's working plan and can evolve as integration needs change.

## Documentation and project integrity

- Keep the frozen Review 2 tag (`review-2`) unchanged.
- Keep architecture documentation, test evidence and Defense documents consistent with what has **actually** been implemented and verified.
- Do not add database migrations merely to solve presentation-layer issues.
- Avoid duplicate simulation/evidence persistence models where existing schema already provides the required concepts.
- Do not report a successful physical experiment, live E2E result or cloud deployment without evidence.

---

**VISTA's success criterion:** A learner can build a Pick & Place program, receive an authoritative simulation PASS for an immutable version, execute **that same qualified version** on a safely authorized physical robot, and provide persistent evidence for teacher review.
