# VISTA — MASTER CONTEXT / CHAT HANDOFF

> Snapshot: 2026-11-03. Context is assembled from VISTA_HANDOFF.docx, the user-provided discussion log, BM04 template and the uploaded planned AWS architecture diagram. This is a working handoff, not proof of live deployment.

## LATEST ARCHITECTURE DECISION — 2026-11-03: Learning files, instructor videos and AWS diagram
**Decision:** Keep the existing VISTA Full Demo AWS architecture topology. It already includes S3 Static Web/SPA, S3 Learning Media, S3 Robot Recordings and S3 Dataset Artifacts. **No additional S3 service/bucket is required solely for instructor documents or videos**. Update the diagram annotations and deployment specification; do not mistake depicted components for provisioned resources.

### Media responsibilities and storage separation
- **S3 Static Web/SPA**: deployable frontend build, delivered via CloudFront.
- **S3 Learning Media**: teacher/instructor-uploaded PDF, DOCX, PPTX, PNG/JPG/WebP, MP4 and other approved lesson/course/assignment attachments. Suggested display label: `Learning Materials & Videos (documents / images / video)`.
- **S3 Robot Recordings**: physical execution video/images/experiment evidence, subject to authorized upload and retention.
- **S3 Dataset Artifacts**: optional/future data/AI pipeline, not required for core Review 2 demonstration. SQS/Lambda episode processing likewise optional/future unless implemented and verified.
- Distinct buckets are a reasonable deployment choice for static web, learning media and robot evidence because access and lifecycle policies differ. One bucket per file type is **not** necessary. Exact bucket names and prefixes are implementation decisions, not verified deployed resources.

### Instructor upload and learner download contract (proposed, not implemented evidence)
1. Teacher signs in to VISTA; browser requests an upload authorization from NestJS Education API.
2. API validates Supabase JWT, instructor/classroom/course permissions, allowed MIME/extension, size limits and storage quota; issues a short-lived, narrowly scoped S3 presigned upload URL (or equivalent controlled upload mechanism).
3. Browser uploads directly to **private** S3 Learning Media; API confirms object existence/size/type, applies content validation or malware scanning where required, and records the authoritative metadata and Course/Lesson/Activity/Assignment association in Supabase PostgreSQL. An issued presigned URL alone must not mark an asset ready.
4. Student requests a resource; Education API checks enrollment/entitlement and returns a short-lived authorized delivery path. Serve private objects via CloudFront with Origin Access Control and signed URLs/cookies, or an equivalent gated download design. Do **not** make Learning Media publicly readable just because static web assets are served via CloudFront.
5. For initial demo, approved MP4 can be delivered over HTTPS/CloudFront with range requests; HLS transcoding/MediaConvert is an optional future scaling decision. Keep S3 upload and media delivery separate from IoT Core MQTT (no continuous video over MQTT).
6. Suggested metadata: asset ID, owner/uploader, course/lesson/activity association, original filename, object key, MIME type, byte size, status, timestamps and access scope. DB stores **metadata**, S3 stores bytes.

### Small diagram edits recommended before freezing SDD
- Rename `Robot Backend + CHECKIK` to `Robot Runtime + CHECKIK`, ideally as distinct Runtime and CHECKIK boxes.
- Annotate AWS IoT Core as **authorized high-level job/run commands and status/telemetry/events over MQTT/TLS only; no servo commands or media streaming**.
- Make Local Safety / E-stop's independent reject/stop authority visually explicit.
- Label Device Shadow as **desired/reported state**, not an execution command queue.
- Label Learning Media `Documents / Images / Videos`; add the teacher browser → presigned S3 upload path and learner → authorized CloudFront/S3 media read path. This is a clarification of existing services, **not** a new infrastructure tier.
- Mark SQS/Lambda episode pipeline and Dataset Artifacts `Future / Optional` where they are not part of the committed demo.
- Preserve `PLANNED — not deployed`; confirm actual network design (private EC2 outbound/NAT or alternative), TLS/DB pooler, IAM, DNS/certificates, CloudFront OAC, S3 CORS/policies, IoT certificates, budget controls and deployment verification before calling the design deployment-ready.

### Readiness gates and evidence still needed
| Item | Target | Verification required |
|---|---|---|
| Web build | CloudFront + private S3 web origin | deployed URL, TLS, cache/invalidation test |
| NestJS API | ALB + EC2 (2 AZ/ASG optional for full demo) | health checks, auth, connectivity, logs |
| Learning Media | private S3 + authorized upload/download | teacher upload, enrollment denial, student playback, deletion/retention |
| Robot bridge | IoT Core + Edge Agent | device identity, authorized job, status/telemetry, offline handling |
| Physical safety | local Runtime + CHECKIK + E-stop | independent stop, readiness, session conflict tests |
| Physical evidence | Robot Recordings S3 + DB provenance | L5 terminal succeeded only after real execution evidence |
| Observability/cost | CloudWatch/IAM/CloudTrail/Budgets | alerts, least privilege, spend thresholds |

**Status:** This is a design decision and deployment checklist, not proof that the features or AWS resources are currently deployed. The original diagram is retained as an architectural reference; its labels should be revised before it is presented as the final SDD diagram.

## 0. How a new assistant should use this file
- Preserve distinction between **Review 2 BM04 WF-01..04** and **17 detailed implementation workflows**; identical IDs do NOT mean identical workflows.
- Never claim AWS resources are deployed, physical E2E is verified, reviewer approval exists, or CI passes now without new evidence.
- Keep authoritative grading/progression in Education API and physical safety/motion in local Robot Runtime/CHECKIK.
- Treat the final Student IA and commit 19b075e6 as later than the original Nov 1 handoff.
- BM04 form: preserve the original editable Word tables and signature cells; no unrequested addendum; do not fabricate missing student IDs, signatures, reviewer decisions.

## 1. Project identity and people
- Project: VISTA — Robotics & AI Education Platform; FPT University capstone SEP490; code FA26SE183; group GFA26SE94 (SKYNET-Thesis).
- Leader: Lê Nguyễn Quang Đức (SE192066), **Team Leader / Full-Stack Developer & DevOps**; primary coding across Web App, Desktop App, Backend, AWS deployment.
- Vũ Anh Tuấn (SE190510): **Backend & Database Developer**.
- Trần Tiến Đạt (SE180773): **Frontend & Desktop Application Developer**.
- Phạm Viết Lợi (student ID not confirmed): **Backend & Desktop Application Developer**; earlier responsibility also includes Robot Runtime/CHECKIK/physical SO-101; do not silently drop that workstream.
- Supervisor: Lâm Hữu Khánh Phương (phuonglk@fpt.edu.vn).
- Review 2: 2026-10-28, council HD8432, slot 3 12:30–14:45, room NVH.415; Reviewer 1 HoangNT20, Reviewer 2 TamPM. Final decision/approval not independently confirmed.

## 2. Newest verified-by-report checkpoint (not independently re-run)
- Student IA commit: `19b075e603e287bfbd584f8fbfc423816823fb0e` (`feat(learning): separate assignments from my learning`).
- Reported frontend tests: 29 files, 174 tests PASS. Reported backend tests: 36 suites, 340 tests PASS. Combined 514 PASS as reported in discussion, **not independently re-executed here**.
- Backend `GET /me/quizzes` added via ProgressionService.myQuizzes; use authoritative knowledge-check status/scores.
- Student sidebar: Dashboard, Courses, My Learning, Assignments, Build → Programming Studio, Robot Lab.
- `/my-learning`: In Progress / Completed / Quizzes; curriculum progression and quizzes only.
- `/assignments`: In Progress / Completed; classroom assignments only. `assigned`, `in_progress`, `submitted` remain In Progress; `submitted` displays Awaiting Evaluation; only `evaluated` appears Completed.
- Cards show course, lesson, challenge/classroom, due date, state, actions; authoritative score and teacher feedback only when available.
- Frontend must not manufacture PASS, grades, completion, teacher feedback or trusted evaluation.
- Next recommended checkpoint: real visual QA for My Learning and Assignments before proceeding with P0.11.

## 3. Course / Lesson / Activity / Assignment distinctions
- Course contains lessons; lesson contains activities; teacher assignment is a separate task linked to course/lesson/challenge, not a required activity for every lesson.
- Course 1 Robotics Fundamentals: L1 Meet Your Robot → L2 Move the Robot → L3 Grab & Release → L4 Pick & Place (3D) → L5 Physical Robot Lab.
- L1 reading/demo/knowledge check (80% threshold in discussion); L2 Blockly movement + 3D evaluation; L3 gripper/object simulation; L4 immutable ProgramVersion + authoritative 3D PASS; L5 executes the **same qualified immutable L4 ProgramVersion** on physical SO-101.
- L4 PASS only unlocks L5. L5/course complete only after actual physical Experiment `succeeded` with provenance/evidence.
- Before L5: authenticate, RBAC, classroom membership, robot entitlement/allocation, online/ready/calibrated, safety, no conflicting session, explicit confirmation.
- Browser renders simulation; Education API owns progression, authorization and symbolic evaluation; local Runtime/CHECKIK owns physical motion and E-stop.

## 4. Planned AWS Full Demo diagram — 2026-11-03
- Image supplied: `VISTA_AWS_Architecture(1)-01 FULL DEMO - PLANNED.drawio.png`. Title states **PLANNED**, ap-southeast-1, 2 AZ / ALB / Auto Scaling / IoT Core / Supabase external. No deployment proof.
- Web: S3 static SPA → CloudFront; API via ALB → NestJS Education API on EC2 in private subnets, across AZs in target architecture.
- External SaaS: Supabase Auth JWT + Supabase PostgreSQL; GitHub Actions CI/CD.
- Cloud-edge: AWS IoT Core MQTT/TLS → Ubuntu Robot Edge Agent → **Robot Runtime + CHECKIK** → local safety/E-stop → SO-101 arms/cameras. Diagram currently labels Robot Backend + CHECKIK; recommended rename to Robot Runtime + CHECKIK.
- MQTT should carry authorized high-level jobs/commands, status, telemetry, events; **no direct servo commands or continuous video over MQTT**. Device Shadow = desired/reported state, not a motor command queue.
- Physical safety/E-stop is locally authoritative and can reject/stop independently of AWS.
- Camera recordings → Local Episode Recorder → approved upload → S3 Robot Recordings; learning media and dataset S3 also drawn.
- Ops/security/optional: CloudWatch, SNS, CloudTrail, IAM, Secrets Manager, Budgets, ECR, Lambda, SQS, IoT Rules/Shadow. Mark SQS/Lambda episode pipeline and dataset/AI artifacts as future/optional unless actually deployed.
- Private EC2 egress requires NAT gateway or proxy; budget-sensitive choice remains open.
- Recommended phases: (1) minimal web/API/DB + local robot, (2) IoT secure bridge, (3) 2-AZ/Auto Scaling/observability/security/recording hardening.

## 5. BM04 commitment boundary
- Original Word template is `SWP490_R2_BM04_Review2_Commitment_1.docx` and visually contains tables. The prior PDF-to-Word text extraction destroyed table formatting; edit the original DOCX template only.
- Four BM04 high-level workflows: WF-01 School Administration & Robot Allocation (Đức); WF-02 Learning & Assignment (Đạt); WF-03 Schematic Experiment & Evaluation (Tuấn); WF-04 Assessment & Reflection (Lợi).
- Prior BM04 committed totals: 43 tests, 24 automated; 4 main + 4 exception demo scenarios; 9 mandatory features. These are **commitments**, not observed CI status.
- Reviewer verification, conclusion, signatures and dates must remain blank unless explicitly supplied. Team leader name in section 11: Lê Nguyễn Quang Đức.
- Missing: Lợi student ID, final Review 2 decision, Registration v1.2 approval, verified D-IDs, actual current deployment and physical E2E evidence.

## 6. Original Nov 1 handoff (preserved below)

---

VISTA
Robotics & AI Education Platform
PROJECT MIGRATION & HANDOFF DOCUMENT
Snapshot date: 01 November 2026
Purpose: migrate the project to another ChatGPT/Codex session without losing architecture, decisions, implementation state, or remaining work.
Repository: /home/quangduc/Code/vista/se
GitHub: https://github.com/SKYNET-Thesis/se.git
## 1. Executive Handoff

VISTA is a Robotics & AI Education Platform for school learners, centered on an executable learning loop rather than a generic LMS. The product direction after Review 2 is: students learn robotics concepts, build robot programs with Blockly, validate the exact immutable program through authoritative 3D task simulation, then—when qualified and authorized—execute that same program on a physical robot and preserve evidence for teacher review.
Primary Defense vertical slice: Auth → Course/Lesson → Blockly → immutable ProgramVersion → authoritative Simulation PASS/FAIL → qualification → robot entitlement/allocation → safety/control session → physical execution → evidence → teacher review.
Target learner positioning: THCS–THPT / competency-based course progression. Course 1 is the P0 product slice.
Do not describe VISTA as merely 'LMS + robot'. Position it as a robotics learning environment where each lesson leads toward an executable robot program.
The project currently has substantial Course 1 backend/frontend implementation and automated tests, but several milestones are still NOT LIVE E2E VERIFIED and real physical robot execution remains unfinished/unverified.
## 2. Identity, Team, Repository and Conventions

Official Review 2 PDF naming convention: SEP490_FA26SE183_R2_<document-name>.pdf. Do not regress to FA26S183 or other variants.
## 3. Frozen Product Architecture

Core responsibility split:
Frontend: learning UX, Blockly authoring, responsive visualization, course/progression presentation. The browser is never the authority for PASS/FAIL and never directly controls CHECKIK.
NestJS Education API: authentication/RBAC/business authorization, course/progression, ProgramVersion provenance, authoritative evaluation orchestration, evidence persistence, robot execution authorization.
Robot Runtime: local/edge execution orchestration, status, stop, result, integration with CHECKIK.
CHECKIK: low-level hardware/camera/calibration/motion/E-stop/safety/teleoperation. Do not port working Python robot control into NestJS.
Physical motion requires a separate execution gate. Database state or HTTP authorization alone must never move hardware.
Allocation is not the same as permission to move. Entitlement, allocation, readiness, safety, and ControlSession are distinct gates.
## 4. Target Deployment Architecture

Web target: CloudFront + S3.
Business API target: VPC + ALB + two EC2 NestJS instances for HA.
Device bridge target: AWS IoT Core → Device Shadow → IoT Rules.
Local Ubuntu edge: MQTT/sync agent → Robot Runtime → CHECKIK → local safety → SO-101/cameras/recorder.
External services: Supabase Auth/PostgreSQL; GitHub Actions CI/CD.
Production command path: Student Web → ALB → NestJS → IoT Core ⇄ MQTT/TLS ⇄ Edge → CHECKIK → Robot.
IoT is a secure command/status/telemetry bridge, not a motor controller. Continuous video should not be pushed through MQTT.
Per-device certificates/policies; no device keys committed to Git.
Important status: AWS target architecture is a target design, not proof that production AWS deployment has been completed.
## 5. Curriculum Baseline

### 5.1 Course 1 — Robotics Fundamentals (P0)

Core Course 1 outcome: learner can independently program Pick & Place, prove it in task simulation, and then execute the qualified exact program on a physical robot.
### 5.2 Course 2 — Robot Programming & Automation (P1)

C2-L1 Coordinate & Workspace
C2-L2 Repetition
C2-L3 Decision Logic
C2-L4 Multi-object Automation
C2-L5 Automation Challenge
Do not prioritize Course 2 before the Course 1 end-to-end vertical slice is working.
### 5.3 Course 3 — Intelligent Robotics (P1/P2)

C3-L1 Robot Vision
C3-L2 Object Detection
C3-L3 Vision-guided Pick & Place
C3-L4 Text Prompt Instruction
C3-L5 VLA Experience
Frozen VLA interpretation: Camera/Visual Observation + Text Prompt → VLA Model → Robot Action → Physical Robot. VLA language input is text prompt, not voice/speech. Students do not train foundation models in the core flow; pretrained models are prepared externally. Dataset/training/checkpoint management is advanced/future scope.
## 6. Standard Learning Contract

Objective
Concept
Demonstration
Guided Practice
3D Simulation
Challenge
Evaluation PASS/FAIL + reason
Physical Experiment where applicable
Reflection
Server validates completion and unlocks. The client cannot forge completion. Locked lessons remain visible with exact server lock reason; CTA is disabled. The product should always provide a clear Continue Learning path.
## 7. Simulation Authority and Program Provenance

Authoritative chain: ProgramVersion → Simulation/Experiment → RobotState + ObjectState + TaskState → Evaluation → PASS/FAIL → Evidence → Progression.
RobotState includes joints/pose/gripper/running/error as supported.
ObjectState includes position, graspedBy/released, target membership.
TaskState: not_started / in_progress / success / failed.
Browser simulator is responsive visualization; Education API is the sole PASS authority.
Server recomputes from immutable ProgramVersion.robot_program plus snapshotted challenge configuration.
Reuse learning_experiments, events, artifacts and learning_symbolic_evaluations. Do not create a disconnected SimulationRun model for P0.
A ProgramVersion that has passed and is used as evidence remains immutable.
## 8. Frozen Workflow Baseline — 17 Workflows

Post-Review2 implementation baseline is FROZEN at 17 detailed workflows. Correct wording: 'From the business flows and feedback at Review 2, the team decomposed and standardized them into 17 workflows as the post-Review2 implementation baseline.' Do NOT claim the reviewers explicitly required 17 workflows.
Totals: 12 P0 + 3 P1 + 1 P2 + 1 Future. Do NOT create WF-18 for password recovery, retry, disconnect, progression, etc.; those are subflows.
## 9. Critical Workflow Separation

This separation is the clean Defense story. Do not collapse simulation, submission, and physical execution into one ambiguous flow.
## 10. Authentication / WF-16 Frozen Decision

Student-facing login is School Code + Student Code + Password. Students are not required to own personal email accounts.
Supabase Auth remains the password/session authentication authority. Do not build a parallel custom JWT/password/session system.
VISTA resolves school/student business identifiers to a stable internal auth identity mapped to Supabase auth_user_id.
Internal auth identifier is separate from contact/recovery email and must not be presented as the student's personal email.
Stable identity must not depend solely on mutable school_code + student_code.
First login: provision → account_setup_pending → one-time Setup Code → verify School Code + Student Code + Setup Code → learner sets password → credential consumed → ACTIVE.
Recovery without email: School Admin verifies identity/scope → issues one-time Recovery Code → learner verifies → short-lived reset authorization → new password updates mapped Supabase identity → code consumed → session policy.
Recovery email is a verified recovery/contact channel, not automatically the Supabase login identity.
Setup/recovery codes: cryptographically random, hash-only persistence, TTL, one-time use, rate limits, failed-attempt limits, audit. Admin must never see/set the student's permanent password.
WF-16 subflows: staff login/logout; student login; provisioning; first login; recovery code; recovery email; password/session management; RBAC/scope; security audit/rate limiting.
Before implementing WF-16.2–16.7, audit existing Supabase Auth/session/user mapping/schema. Keep this work isolated so it does not unnecessarily block the Course 1 simulation→physical vertical slice.
## 11. Review 2 Baseline and Artifacts

Review 2 frozen SHA: 27c60b1cc6c314c2af70a354b014c07b050e60cd; tag: review-2. Do not move this tag.
Diagram baseline: 23 diagrams/pages — 3 C4, 4 workflow, 4 state, 12 ERD.
BM01 standardized to 6 A4 pages with 8 FR, 4 workflow, 8 demo scenarios and 82 proposed tests.
Registration proposed baseline: v1.2. BM03 must distinguish current v1.0/v1.1 versus proposed v1.2; handoff baseline is v1.2.
Review 2 documentation folder structure centered under docs/review-2; keep approved/proposed/change-record separation.
Weekly report and Project Tracking must be filled in the existing template tabs; do not create new tabs.
Review 2 artifact count and the later 17-workflow implementation baseline are not contradictory: Review 2 had 4 top-level workflow diagrams; later implementation decomposed the business into 17 detailed workflows.
## 12. P0 Roadmap and Implementation Status

## 13. Detailed Simulation Semantics Already Implemented

### 13.1 C1-L2

Target: {x:240, y:220, z:120}.
Ordered semantic sequence: home → preview.move_xyz → wait.
Canonical motion command is preview.move_xyz; do not present false manual joint control.
PASS completes L2 and unlocks L3.
### 13.2 C1-L3

Initial tool pose approximately (120,150,120); cube-red at (120,150,0).
graspRadius 30; graspMaxZ 50; liftMinZ 70.
Close alone does not establish grasp; geometry must satisfy grasp condition.
Carry follows tool; open releases object to z=0.
PASS requires grasp/lift/release and final gripper open; completes L3/unlocks L4.
### 13.3 C1-L4

Core PASS is object_grasped → object_lifted → object_released → object_in_target_zone. Return Home is allowed/recommended but is not a defining PASS condition.
Target zone A center approximately (120,325,0), bounds x=60, y=280, w=120, h=90.
Failure reasons include GRASP_NOT_ESTABLISHED, OBJECT_NOT_LIFTED, OBJECT_NOT_RELEASED, OBJECT_RELEASED_OUTSIDE_TARGET, OBJECT_NEVER_GRASPED.
Tool entering zone without the object does not pass.
Latest successful immutable L4 ProgramVersion is the current qualified candidate for L5; later failed evaluations do not replace the last successful qualification.
L4 PASS may place L5 in an available/in_progress state, but this must NEVER be interpreted as physical completion.
## 14. Recent Course 1 Learning Experience Frontend Work

Recent work moved beyond the earlier P0 screens into a Coursera-inspired learning workspace. These commits are important when continuing from the current branch.
Current branch reported during this work: feat/course1-learning-experience. Before new edits, run git status/log and verify HEAD because the final architecture-fix prompt below was not yet confirmed as implemented.
## 15. Current UI Problem to Finish Next

The latest screenshots still showed a mismatch with the intended learning architecture. This is the immediate task before moving on to Assessment UI.
Focused learning must hide the global VISTA sidebar completely and release its width. Dashboard/Courses/My Learning/Programming Studio/Robot Lab must not remain as a permanent column.
A hamburger may open global navigation only as a temporary overlay/drawer; Escape/outside click should close it.
The persistent left panel in focused learning is Course Material, not global navigation.
Course Material should represent the real course hierarchy: Course → lesson/module → section → activity; it should be independently scrollable and highlight the selected activity.
All real modules should be discoverable/expandable. Do not invent fake modules not returned by backend.
Course outline must contain concise navigation metadata only; long explanations do not belong there.
Course-wide What You Will Learn belongs to Course Info. Do not duplicate it inside lesson/module content.
For C1-L2, lesson-specific instructional content order is: Learn the Concepts → Robot Concept in Action → Safety Protocols → Your Practice Mission → How This Lesson Is Completed.
When switching lesson/activity, show keyed skeleton/loading rather than stale content from the previous lesson.
Fullscreen is application-level immersive mode; do not require the browser Fullscreen API.
## 16. Quiz, Practice Assignment, and Assessment Semantics

Do not conflate these concepts:
Practice Quiz: lightweight self-check during/between learning sections; student completes independently; can be server auto-graded. Existing L1 knowledge_check is the current authoritative implementation.
Practice/Guided Assignment: student does the exercise independently to practice. It is not automatically a teacher-graded classroom submission merely because it is called assignment.
Teacher Graded Assignment / Assessment: separate concept with submission/evidence and teacher grading/feedback where the product requires it.
User's intended product distinction: quizzes are lightweight checks between sections; Assessment is the larger end-of-course evaluation. Teacher-graded work must use the teacher assessment workflow, not the Practice Quiz UI.
Do not implement fake grading semantics on the client. Preserve server authority.
## 17. Physical Robot Lab — Required Final P0 Flow

C1-L5 must reuse the exact immutable C1-L4 ProgramVersion that has authoritative simulation PASS. The learner does not create a new version merely to run the robot.
L4 authoritative PASS exists for exact ProgramVersion.
L5 becomes available, but remains physically not completed.
Learner opens Physical Robot Lab and sees exact qualified ProgramVersion provenance.
Backend verifies auth, classroom/enrollment/challenge authorization.
Verify robot entitlement and classroom allocation.
Verify no conflicting ControlSession.
Verify robot online/ready/calibrated and local safety/E-stop state.
Require explicit learner confirmation before motion.
Education API authorizes execution; Robot Runtime executes; CHECKIK performs local hardware/safety control.
Persist Experiment start/end/status, robot/session provenance, events/timeline/result.
Only terminal Experiment status succeeded completes L5.
failed/cancelled/stopped/timed-out/preflight-failed do not complete L5.
Teacher can review the exact ProgramVersion + simulation evidence + physical evidence.
## 18. Defense Demo Story

Recommended seeded story:
Student Minh has passed C1-L1–L3.
At C1-L4 Pick & Place, Minh builds Blockly: open → move → close → move → open (with required safe sequence/capabilities).
First simulation FAILs because release is outside target; UI shows reason/evidence.
Minh fixes the program; authoritative simulation PASSes.
Backend stores exact immutable ProgramVersion/evidence, completes L4 and unlocks L5.
L5 shows Robot Lab Online/Ready; learner confirms safety.
Education API authorizes; Runtime/CHECKIK executes the exact qualified program.
Physical Pick & Place succeeds; Experiment/evidence is stored.
Teacher reviews exact ProgramVersion, simulation result and physical result.
## 19. Database Concepts to Reuse

Existing schema already contains many relevant concepts. Audit and reuse before adding tables:
learning_courses, levels, lessons, prerequisites, lesson_progress, objectives, competencies
offerings, classrooms, members, enrollments
assignments, classroom_assignments, assignment_attempts
programs, program_versions, submissions
challenges, challenge_objects, challenge_conditions
experiments, symbolic_evaluations
ControlSession
teacher feedback / assessment / reflection
AI metadata
Semantic boundaries: Course = what is learned; Offering = delivery instance; Classroom = group. Entitlement = organization can use robot; Allocation = classroom authorized resource; ControlSession = runtime lock. Allocation is not motion authorization.
## 20. Non-Negotiable Invariants

Frontend never decides PASS/FAIL.
Client must not send trusted passed/score/TaskState flags for authoritative evaluation.
Immutable ProgramVersion is the provenance anchor.
Passed ProgramVersion must not be silently mutated.
Browser never directly calls CHECKIK.
NestJS does not become a servo/motor-control layer.
Cloud authorization cannot force motion; local Runtime/CHECKIK may reject for safety.
L4 PASS unlocks L5 but does not complete L5.
Only successful physical Experiment completes L5.
Do not create disconnected duplicate simulation/evidence models without evidence that existing schema cannot support the requirement.
Do not add migrations merely for UI work.
Do not fake completion, video, physical result, robot readiness, or deployment state.
Do not claim LIVE E2E VERIFIED unless the real stack/browser/hardware path was actually exercised.
Do not move the frozen review-2 tag.
## 21. Definition of 'Finished' for the Core Product

For migration purposes, the project should not be called finished merely because the UI builds. The core Defense-ready product is complete when all of the following are true:
Course 1 curriculum/progression is authoritative and seeded.
My Learning/Course Path/Lesson/Activity UX is coherent, responsive, and uses real backend state.
Course Info, Course Material, lesson/activity reader, Practice Quiz, Guided Practice, Simulation and Result/Evidence are separated cleanly.
Focused learning architecture is complete: global nav hidden; overlay drawer; real course outline; no duplicate lesson explanations.
Blockly creates/saves immutable ProgramVersions with server-driven allowed capabilities.
C1-L2, L3 and L4 simulations are authoritative, reloadable and produce persistent evidence.
L4 qualification resolves the exact successful immutable ProgramVersion for L5.
Physical Robot Lab performs all auth/allocation/readiness/safety/session gates.
Runtime + CHECKIK execute the qualified program on the real robot or the officially accepted Defense hardware path.
Physical Experiment evidence is persisted and only succeeded completes L5.
Teacher can review student progress, exact program, simulation evidence, physical evidence, and provide feedback.
School Admin can manage users/classes/robot resources without becoming a PASS/FAIL authority or direct robot controller.
Student auth supports School Code + Student Code + Password with safe provisioning/recovery design.
Seeded Defense demo runs end-to-end and regression tests pass.
LIVE E2E verification is recorded honestly for browser/backend/runtime/hardware as applicable.
Official Review/Defense documents and diagrams are synchronized with the actual implementation.
## 22. Recommended Continuation Order

## 23. Immediate Codex Prompt After Migration

Use the following as the next-task summary for Codex:
Continue VISTA on the current repository state. First inspect git status/log and the current Course 1 learning-experience branch. Finish the Course Information Architecture + focused learning UI before starting Assessment.

Required result:
- Normal Courses view = concise Course → Lesson/Module → Section → Activity structure only.
- Course-wide What You Will Learn/About/etc. = Course Info only.
- C1-L2 lesson-specific content order = Learn the Concepts → Robot Concept in Action → Safety Protocols → Your Practice Mission → How This Lesson Is Completed.
- Focused activity route must remove the global VISTA sidebar from layout entirely (zero reserved width).
- Keep one hamburger that opens global VISTA navigation as an overlay/drawer; outside click/Escape closes it.
- Persistent focused left panel = Course Material, not global nav.
- Course Material must use real backend hierarchy, support independent module expand/collapse plus Expand All/Collapse All, selected/completed/locked states, and independent scrolling.
- Right workspace renders selected reading/demo/quiz/practice/simulation/result/physical-lab activity.
- No stale previous lesson content while loading; use identity-keyed skeleton/loading.
- Do not alter server-authoritative progression/PASS semantics, ProgramVersion immutability, simulation semantics, P0.9, database schema, Runtime or CHECKIK.
- Practice Quiz remains lightweight server-graded knowledge check. Do not implement teacher-graded Assessment in this task.
- Run relevant tests, lint, typecheck/build; do not claim live UI verification unless actually performed.
- Return commit SHA, files changed, exact UI behavior, tests, and unresolved issues.
## 24. First Commands for a New Session

cd /home/quangduc/Code/vista/se
git status
git branch --show-current
git log --oneline -20
git tag --list | grep review-2
git show --stat --oneline 61505ab349a38d7a4cb412bc80690c43ea036c22
Then inspect the current versions of AppShell, CourseLearningShell, LessonViewer, ActivityReader, course/lesson routes, learning API hooks, and progression contracts before editing. Do not assume the last reported commit is still HEAD.
## 25. Migration Notes / Known Verification Limits

Many milestones passed unit/integration/build checks, but several reports explicitly said LIVE UI VERIFIED: NOT VERIFIED.
Earlier P0.2–P0.7 reports also noted LIVE E2E not verified even when automated tests passed.
Real physical hardware execution for Course 1 L5 has not been established as complete in the current handoff.
AWS deployment is target architecture, not verified deployment.
The latest architecture-fix prompt for Course/Info/Fullscreen was prepared but no subsequent implementation report was supplied before this handoff. Treat that UI fix as the immediate next task.
Before changing schema/auth, inspect the actual current repository because the codebase may have advanced beyond older documents.
## 26. One-Paragraph Context for a New Assistant

VISTA is an FPT SEP490 capstone robotics education platform. The team has frozen a 17-workflow post-Review2 implementation baseline and is prioritizing a Defense-ready Course 1 vertical slice. The system uses React, NestJS, Supabase/PostgreSQL, a local Robot Runtime and CHECKIK; the browser and cloud business API never directly control motors. Course 1 already has authoritative progression, Blockly ProgramVersions, and server-side simulations for Move, Grab/Release and Pick/Place. Current frontend work is converting the course experience into an immersive Coursera-like learning workspace with Course Info separated from Course Material and focused activity routes. The immediate unfinished task is to finalize that information architecture/fullscreen UI, then finish persistent result/evidence handoff, physical robot execution, authorization/readiness/safety gates, teacher evidence, and a live seeded Defense E2E demo. Preserve server authority, immutable ProgramVersion provenance, local safety, and the frozen Review 2 baseline.

### Handoff source table 1

| Item | Current baseline |
| --- | --- |
| Project | VISTA — Robotics & AI Education Platform |
| Capstone | SEP490 (older materials may contain SWP490; normalize official outputs to SEP490 where required) |
| Subject code | FA26SE183 |
| Team | SKYNET-Thesis |
| Leader | Lê Nguyễn Quang Đức — SE192066 |
| Known member | Vũ Anh Tuấn — SE190510 |
| Supervisor | Lâm Hữu Khánh Phương — phuonglhk@fpt.edu.vn |
| Repository | /home/quangduc/Code/vista/se |
| GitHub | https://github.com/SKYNET-Thesis/se.git |
| Frontend | web/robot-edu |
| Education API | services/education-api |
| Robot Runtime | services/robot-runtime |
| Review 2 docs | docs/review-2 |
| Post-Review2 docs | docs/post-review2 |

### Handoff source table 2

| Lesson | Purpose | Authoritative completion |
| --- | --- | --- |
| C1-L1 Meet Your Robot | Components, joints, gripper, camera, workspace, safety | Server-graded knowledge check; target threshold 80%. Opening content does not complete lesson. |
| C1-L2 Move the Robot | Home, target-position movement, wait, deterministic sequence, Blockly | Authoritative target-pose simulation using exact immutable ProgramVersion. |
| C1-L3 Grab & Release | Approach, open/close, grasp, lift, release; cube semantics | Authoritative object/gripper simulation. |
| C1-L4 Pick & Place | Full manipulation into target zone | Authoritative simulation; grasp → lift → release → object inside target zone. |
| C1-L5 Physical Robot Lab | Execute qualified C1-L4 program on real robot | Only terminal physical Experiment status succeeded completes L5. |

### Handoff source table 3

| WF | Workflow | Priority |
| --- | --- | --- |
| WF-01 | School Administration & Classroom Management | P0 |
| WF-02 | Course & Curriculum Management | P0 |
| WF-03 | Course Offering & Classroom Enrollment | P0 |
| WF-04 | Assignment Creation & Publishing | P0 |
| WF-05 | Student Programming & Submission | P0 |
| WF-06 | Teacher Assessment & Student Feedback | P0 |
| WF-07 | Robot Registration & Configuration | P0 |
| WF-08 | Robot Entitlement & Classroom Allocation | P0 |
| WF-09 | Robot Session & Safety Management | P0 |
| WF-10 | Robot Experiment Execution & Evidence | P0 |
| WF-11 | Demonstration Data Collection | P1 |
| WF-12 | Dataset Management & Versioning | P2 |
| WF-13 | AI Model Registry & Eligibility | P1 |
| WF-14 | Model Training & Checkpoint Management | Future |
| WF-15 | Model Evaluation & Experiment Integration | P1 |
| WF-16 | Authentication, Authorization & Access Control | P0 |
| WF-17 | 3D Task Simulation & Server-side Evaluation | P0 |

### Handoff source table 4

| Workflow | Boundary |
| --- | --- |
| WF-05 | Blockly → Draft → Save → immutable ProgramVersion → Submission |
| WF-17 | ProgramVersion → Simulation → Evaluation → PASS/FAIL → Evidence → Progression |
| WF-10 | Qualified ProgramVersion → Physical Execution → Robot → Physical Evidence |

### Handoff source table 5

| Milestone | Status | Known commit / key result |
| --- | --- | --- |
| P0.1 Authoritative Course 1 curriculum/progression | PASS | 2c53c1f — ProgressionService, course path API, server knowledge check, seed C1, symbolic PASS projection. |
| P0.2 My Learning + Course Path | PASS | d61941fe… — server-driven My Learning/Course Path, strong types, locked buttons. |
| P0.3 Lesson Detail + guided practice | PASS | 6c1f0de… — lesson content, L1 quiz, L2/L3/L4/L5 lesson experience; live E2E not verified. |
| P0.4 Server-driven Blockly integration | PASS | fa9500f… — dynamic toolbox, canonical mappings, server-backed drafts, immutable versions. |
| P0.5 L2 authoritative simulation | PASS | d17cf8b — target pose simulation; exact immutable version; PASS unlocks L3. |
| P0.6 L3 object/gripper simulation | PASS | 767bf35102b834a49489e6fe2a2d05addd9f231a — grasp/lift/release semantics. |
| P0.7 L4 Pick & Place target-zone simulation | PASS | 711c4d7f50a058744bd365ab8bdbb2647358d937 — target-zone PASS, qualified L4 provenance, L5 unlocked but not completed. |
| P0.8 Result/Evidence/L5 handoff | Partially represented in later UI/result work; verify branch state before assuming complete | Original roadmap target: reloadable immutable evidence and exact qualified ProgramVersion handoff; no physical execution. |
| P0.9 Physical Robot Lab | NOT COMPLETE / next core backend-hardware slice | Must execute exact qualified L4 ProgramVersion; only physical Experiment succeeded completes L5. |
| P0.10 Robot authorization/readiness | NOT COMPLETE | Entitlement/allocation/readiness/safety/session gates. |
| P0.11 Student/teacher evidence/progress | NOT COMPLETE | Evidence review and teacher feedback. |
| P0.12 E2E/regression/demo seed | NOT COMPLETE | Defense-ready seeded story + live E2E. |

### Handoff source table 6

| Commit | Implemented |
| --- | --- |
| aea5e8c13381aa31e5f54ca3471cc60e999db483 | CourseLearningShell; 5 authoritative lessons; activity model; mobile drawer; L1 knowledge check; L2–L4 practice mapping; truthful L5 placeholder. |
| 76ef88bcff70b0b6bf59c7d9f19202430be27460 | Course Info route /courses/:courseId/info; course-wide About/What You Will Learn/Course Information/Course Structure; removed duplicated lesson header card. |
| 2cd5fa166f97757679a85ca036b64e275bbb4a90 | Focused activity route /courses/:courseId/lessons/:lessonId/activities/:activityId; deep-link/reload; activity reader; Previous/Next. |
| ae677ebb1a333b279c025ba7eecb4a14fd2d3300 | Activity rows no longer accordion; direct focused-route links; section headers remain expandable; hover/focus transitions. |
| 1d9737c1e19708815b9f5b6b0a8982d193d3be45 | Non-wrapping C1-L1…C1-L5 badge; focused routes hide normal desktop VISTA global chrome; focused shell width improvements. |
| 2aa93cc62bcd196266f495b17f6a38188ca307aa | Smooth section reveal/collapse via CSS grid 0fr↔1fr, ~200ms ease-out, reduced-motion support. |
| 1f418ab5f8b5faf0abc20521f330d2770f56a4f3 | Focused Course Material navigator expanded to viewport-height current-module activities; removed duplicated lesson-level What You Will Learn. |
| d3f598d7d7ab617d3b62a4e9ba764be17229ea1a | Focused navigator desktop collapse/restore with hamburger; selected activity/scroll state preserved; mobile drawer retained. |
| 61505ab349a38d7a4cb412bc80690c43ea036c22 | Practice Quiz landing/workspace for existing authoritative L1 knowledge_check; one question at a time; server grading; no teacher-graded assignment. |

### Handoff source table 7

| Order | Work |
| --- | --- |
| 1 | Finish current Course/Info/Fullscreen learning architecture fix and visually verify it. |
| 2 | Freeze that UX; then implement/normalize Practice Quiz vs Assessment/teacher-graded assignment UI semantics. |
| 3 | Verify P0.8 result/evidence persistence and exact L4→L5 qualification handoff in current HEAD; close any gaps. |
| 4 | Implement P0.9 Physical Robot Lab vertical slice. |
| 5 | Implement P0.10 entitlement/allocation/readiness/safety/ControlSession gates. |
| 6 | Implement P0.11 student/teacher evidence and feedback. |
| 7 | Implement P0.12 seeded E2E/regression/Defense demo and perform live verification. |
| 8 | Only then spend remaining time on P1 Course 2 / AI/VLA capabilities. Drop P2 before sacrificing Course 1 physical vertical slice. |

## 7. Follow-up decisions and work tracking
- **Known completed by reported commit:** Student IA refactor, `/me/quizzes`, 514 reported passing tests. Confirm in repository/CI if using as current evidence.
- **Not established:** physical live E2E; deployed AWS stack; full 17-workflow implementation; reviewer-approved BM04; complete D-ID inventory.
- **Next:** visually inspect Student My Learning + Assignments; complete remaining P0 gates; plan staged AWS deployment; execute end-to-end robot test with actual evidence.
- Keep source diagram under `docs/architecture/` and label as target/planned.

## 8. New assistant instruction
When answering new tasks, distinguish (a) user-confirmed design, (b) code/test report, (c) independently verified runtime, (d) planned architecture. Do not convert one category into another. Ask for missing source only when necessary; do not fabricate data.
