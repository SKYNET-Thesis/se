# Bằng chứng kiểm thử L01–L03 — 15/11/2026

> Người chạy: Phạm Viết Lợi (máy Windows 11, có hỗ trợ của AI agent) · Mã nguồn: `develop` @ `a8bcae5` (audit trên `main` @ `b8ac12f`, kiểm chứng lại trên `develop`) + các thay đổi liệt kê trong [README](../README.md#3-thay-đổi-code-trong-đợt-này).
> **Không có lần nào kết nối Supabase/Production.** DB dùng cho test là PostgreSQL 17 dùng xong bỏ, chỉ nghe trên loopback `127.0.0.1:55432`.

## 1. Môi trường

| Thành phần | Giá trị |
| --- | --- |
| Node.js | v24.11.1 (`npm ci` theo lockfile) |
| PostgreSQL test | 17.12, container `vista-dev-pg`, DB `vista_test_course_builder`, user `vista_test` |
| Schema | Baseline production 09/11 (SHA-256 `5b140ce7…`) + 7 migration trong manifest: D, E, F, G, H, I, **J** (`ledger_rows: 7`, `rerun_pending: []`) |
| Schema fingerprint | `ef3d41b73fbb8ba4c32fd5a8f3978244de1014e0c6d34411732ce2a8350b5170` |

Cách dựng DB trên Windows: chạy `scripts/bootstrap_dev_database.py` **bên trong một container** clone repo từ `.git`, để file `.sql` giữ line ending LF.
Trên Windows, checkout với `core.autocrlf=true` làm sai checksum. Lệnh dùng:

```bash
docker run -d --name vista-dev-pg -e POSTGRES_USER=vista_test -e POSTGRES_PASSWORD=change-me-local \
  -e POSTGRES_DB=vista_test_course_builder -p 127.0.0.1:55432:5432 postgres:17
MSYS_NO_PATHCONV=1 docker run --rm --network container:vista-dev-pg -v "D:/capstone/se/.git:/repo.git:ro" postgres:17 bash -c '
  apt-get update -qq && apt-get install -y -qq python3 git && git config --global --add safe.directory "*" &&
  git clone -q /repo.git /work && cd /work &&
  VISTA_DEV_DATABASE_URL=postgresql://vista_test:change-me-local@127.0.0.1:5432/vista_test_course_builder \
  VISTA_DATABASE_PROJECT_REF=vista-course-builder-test python3 scripts/bootstrap_dev_database.py --confirm-local-bootstrap'
```

Chạy test API có DB thật:

```bash
cd services/education-api
export DATABASE_URL='postgresql://vista_test:change-me-local@127.0.0.1:55432/vista_test_course_builder?schema=public'
export DIRECT_URL="$DATABASE_URL" VISTA_DATABASE_PROJECT_REF=vista-course-builder-test RUN_POSTGRES_INTEGRATION=1
unset SUPABASE_URL
npx jest --runInBand
```

## 2. Kết quả tổng hợp (sau khi áp dụng các sửa đổi)

| Bộ test | Lệnh | Kết quả |
| --- | --- | --- |
Chạy trên nhánh `loi/l01-l03-programming-evaluation` = `develop` @ `a8bcae5` + các thay đổi của PR này.

| Bộ test | Lệnh | Kết quả |
| --- | --- | --- |
| **API — toàn bộ** (unit + PostgreSQL thật) | `npx jest --runInBand` | **89/91 suite, 935/960 test PASS, 0 FAIL**. 25 test skip có chủ đích: `iot-feedback.repository.int.spec.ts` cần DB IoT riêng, `learning-media.storage.s3.int.spec.ts` cần S3 |
| **API — domain L01–L03** | `--testPathPatterns 'programming\|robot-program-limits\|attempt-\|experiment\|schematic\|symbolic\|c1-l[234]\|p08-simulation'` | **16/16 suite, 195/195 test PASS** (gồm 2 test hồi quy mới) |
| API — build | `npm run build` (`tsc -p tsconfig.json`) | PASS |
| **Web — toàn bộ** | `npx vitest run` | **80/80 file, 552/552 test PASS** |
| Web — domain L01–L03 | `npx vitest run src/components/studio src/utils/robotProgram src/pages/Practice.spec.tsx src/pages/SimulationResult.spec.tsx src/lib/c1EvidenceOrchestrator.spec.ts src/components/submission src/lib/robotExecution.spec.ts` | **82/82 test PASS** (gồm 1 test hồi quy mới) |
| Web — lint | `npm run lint` | 0 error (194 warning có sẵn từ trước, không thuộc file đã sửa) |
| Web — build | `npm run build` | PASS |

Lần chạy đầu trên `main` @ `b8ac12f`: API 919/944 PASS (DB suite 110/110), Web 512/512 PASS. Đường cơ sở trước khi sửa: API unit 807/807, DB suite 110/110.
Sau khi sửa không có test nào chuyển sang FAIL. Lưu ý: khi chạy Jest của API và Vitest **song song**, test `CourseContentEditor › Add Quiz flow` (không thuộc domain này)
có lúc bị timeout 5 s vì máy quá tải. Chạy riêng thì đạt 29/29, và chạy lại toàn bộ web một mình thì đạt 552/552.

## 3. Tái hiện các lỗi của evaluator (GAP-L02-02, -03, GAP-L01-02)

Script chạy trực tiếp các class thật (`SchematicEngineService`, `SymbolicRuleCompilerService`, `SymbolicRuleEvaluatorService`) từ bản build `services/education-api/dist`,
với bộ rule L3 lấy nguyên từ `seed-course1.ts`. Log gốc:

```text
=== GAP A — L3 solved with the RIGHT arm although rules say arm=left
verdict: passed
  [PASS] ordered_actions expected={"actions":["preview.move_xyz","gripper.close","preview.move_xyz","gripper.open"],"matching":"subsequence"} code=ORDERED_ACTIONS_MATCH
  [PASS] object_grasped expected={"arm":"left","objectId":"cube-red"} code=OBJECT_GRASPED
  [PASS] object_lifted expected={"minZ":70,"objectId":"cube-red"} code=OBJECT_LIFTED
  [PASS] object_released expected={"state":"released","objectId":"cube-red"} code=OBJECT_RELEASED
  [PASS] final_gripper_state expected={"arm":"left","state":"open"} code=GRIPPER_STATE_MATCH

=== GAP B — rule object_lifted minZ=200 but the object is only lifted to z=100
verdict: passed
  [PASS] object_lifted expected={"minZ":200,"objectId":"cube-red"} code=OBJECT_LIFTED

=== GAP C — challenge zone B is at x=400..520; object released INSIDE zone B; rule has zoneId "B" without bounds
verdict: failed
  [FAIL] object_in_target_zone expected={"zoneId":"B","bounds":{"x":60,"y":280,"w":120,"h":90},"objectId":"cube-red"} code=OBJECT_RELEASED_OUTSIDE_TARGET

=== GAP D — engine rejects at run time: gripper.close requires a preceding arm.select.
```

## 4. Phần **chưa** được kiểm chứng

- E2E trên trình duyệt với Supabase Auth thật (đăng nhập → Practice → Run → Submit → giáo viên chấm). Cần project Supabase dev và cần quay video.
- Chạy trên robot SO-101 thật: **không có**. Không claim bất kỳ kết quả phần cứng nào.
- Production: không truy cập.

## 5. Danh sách từng test — API (domain L01–L03)

Kết quả API: 16/16 file, 195/195 test PASS, 0 FAIL, 0 skipped

#### `src/modules/learning/attempt-lifecycle.spec.ts` (18 test)

- ✅ accepts an in-progress attempt of a published, available, open delivery
- ✅ rejects an attempt that is submitted (invalid transition / repeated final submission)
- ✅ rejects an attempt that is evaluated (invalid transition / repeated final submission)
- ✅ rejects an attempt that is abandoned (invalid transition / repeated final submission)
- ✅ rejects a draft delivery
- ✅ rejects a closed delivery
- ✅ rejects a archived delivery
- ✅ rejects work before available_from and after close_at, but not merely after due date
- ✅ {"kind":"symbolic_program","attachments":{"enabled":true}} -> true
- ✅ {"attachments":{"enabled":true}} -> true
- ✅ {"kind":"symbolic_program"} -> false
- ✅ {} -> false
- ✅ null -> false
- ✅ {"attachments":true} -> false
- ✅ {"attachments":{"enabled":false}} -> false
- ✅ {"kind":"knowledge_check","attachments":{"enabled":true}} -> false
- ✅ {"kind":"physical_lab","attachments":{"enabled":true}} -> false
- ✅ returns only the caller's attempt and hides every other attempt as not found

#### `src/modules/learning/attempt-retry-regression.db.spec.ts` (9 test)

- ✅ a simulation run never finalizes, locks or consumes the attempt, and is invisible as a submission
- ✅ Submit assignment is the one explicit final action: it promotes the draft, locks the attempt and finalizes an evaluated version
- ✅ a submit without a matching evaluation finalizes as submitted, and a failed run never completes the lesson
- ✅ attempt 2 (runs, edits, retry) leaves attempt 1's evidence and completed lesson untouched
- ✅ symbolic-evaluation-preparation resolves each experiment to ITS OWN attempt, submission and version after a retry
- ✅ demonstration-lesson resolves the submission of the requested attempt, never the latest one, and ignores drafts
- ✅ physical-execution eligibility follows each attempt's own passed evidence; a retry neither inherits nor removes it
- ✅ the schema capability probe sees both D03 stages on this database
- ✅ student insights count only final submissions: a run changes nothing, the final submit does

#### `src/modules/learning/attempt-submissions.db.spec.ts` (10 test)

- ✅ keeps the first attempt's submission, program version and snapshot unchanged after a second attempt
- ✅ rejects a repeated final submission, edits after submission and a second DB row for the same attempt
- ✅ grades and gives feedback to each attempt independently, and the correct attempt is reviewed
- ✅ shows students nothing of their grading until the attempt is released, and only that attempt afterwards
- ✅ never lets another student read, list or download a student's attempt, grading or files
- ✅ blocks every student write after enrollment revocation but keeps the preserved history readable
- ✅ enforces the delivery window on submission and uploads (closed deliveries accept nothing)
- ✅ attaches approved files per attempt, freezes them at submission and keeps them out of other attempts
- ✅ keeps the attachment limit at 5 files per attempt
- ✅ does not regress previously completed program evidence when the learner retries (attempt 2 leaves attempt 1's pass intact)

#### `src/modules/learning/c1-l2-task-simulation.spec.ts` (16 test)

- ✅ 7. Valid L2 sequence reaching target PASSes with PREVIEW_TARGET_MATCH and ORDERED_ACTIONS_MATCH
- ✅ 8. Missing required target movement FAILs with PREVIEW_TARGET_MISMATCH
- ✅ 9. Wrong target FAILs with coordinate mismatch feedback
- ✅ 10. Required sequence violation (out of order actions) FAILs
- ✅ 11. Required Wait missing FAILs ordered_actions rule
- ✅ Provenance, Persistence, Security, and Progression Integration › 1. Exact owned ProgramVersion can be evaluated
- ✅ Provenance, Persistence, Security, and Progression Integration › 2. Mutable draft is not evaluated; only immutable ProgramVersion is evaluated
- ✅ Provenance, Persistence, Security, and Progression Integration › 3. Another learner's ProgramVersion/experiment is rejected
- ✅ Provenance, Persistence, Security, and Progression Integration › 4. Wrong attempt is rejected
- ✅ Provenance, Persistence, Security, and Progression Integration › 5. Wrong assignment/challenge is rejected
- ✅ Provenance, Persistence, Security, and Progression Integration › 6. Disallowed program IR is rejected before evaluation
- ✅ Provenance, Persistence, Security, and Progression Integration › 12 & 14 & 16 & 17. PASS persists evidence with exact ProgramVersion provenance and completes C1-L2, unlocking C1-L3
- ✅ Provenance, Persistence, Security, and Progression Integration › 13 & 15 & 18 & 19. FAIL persists evidence with provenance but does NOT complete C1-L2 and does NOT unlock C1-L3
- ✅ Provenance, Persistence, Security, and Progression Integration › 20. Repeated PASS is progression-idempotent
- ✅ Provenance, Persistence, Security, and Progression Integration › 21. Evaluator transaction failure does not leave false completion
- ✅ Provenance, Persistence, Security, and Progression Integration › 22. Browser-supplied verdict cannot force PASS

#### `src/modules/learning/c1-l3-object-simulation.spec.ts` (23 test)

- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 7. gripper.close away from object does NOT establish grasp
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 8. valid approach + close establishes grasp
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 9. grasped object follows deterministic arm movement
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 10. opening gripper releases object
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 11. valid grasp → lift → release PASSes all authoritative L3 conditions
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 12. close without grasp FAILs with GRASP_NOT_ESTABLISHED
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 13. grasp without lift FAILs if lift required (OBJECT_NOT_LIFTED)
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 14. grasp/lift without release FAILs with OBJECT_NOT_RELEASED and SEQUENCE_INCOMPLETE
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 15. final gripper requirement enforced if configured (GRIPPER_FINAL_STATE_INVALID)
- ✅ Deterministic Grasp, Carry, and Release Engine Rules › 16. disallowed action rejected
- ✅ Provenance, Persistence, Security, and Progression Integration › 1. Owned immutable L3 ProgramVersion accepted
- ✅ Provenance, Persistence, Security, and Progression Integration › 2. Another learner version rejected
- ✅ Provenance, Persistence, Security, and Progression Integration › 3. Wrong attempt rejected
- ✅ Provenance, Persistence, Security, and Progression Integration › 4. Wrong challenge rejected
- ✅ Provenance, Persistence, Security, and Progression Integration › 5 & 6. Forged client object state and grasp state ignored (derived server-side)
- ✅ Provenance, Persistence, Security, and Progression Integration › 17. PASS evidence contains exact ProgramVersion
- ✅ Provenance, Persistence, Security, and Progression Integration › 18. PASS evidence contains object state
- ✅ Provenance, Persistence, Security, and Progression Integration › 19. FAIL evidence persists
- ✅ Provenance, Persistence, Security, and Progression Integration › 20 & 21. PASS completes L3 and unlocks L4
- ✅ Provenance, Persistence, Security, and Progression Integration › 22. FAIL leaves L4 locked
- ✅ Provenance, Persistence, Security, and Progression Integration › 23. repeated PASS remains progression-idempotent
- ✅ Provenance, Persistence, Security, and Progression Integration › 24. transaction failure cannot create false completion
- ✅ Provenance, Persistence, Security, and Progression Integration › 25. L2 P0.5 evaluator remains unchanged and passing

#### `src/modules/learning/c1-l4-pick-place-simulation.spec.ts` (15 test)

- ✅ Deterministic Pick, Transport, and Target-Zone Evaluation › evaluates valid pick -> lift -> transport -> release inside target zone as PASS
- ✅ Deterministic Pick, Transport, and Target-Zone Evaluation › FAILs when tool enters target zone without object (never grasped)
- ✅ Deterministic Pick, Transport, and Target-Zone Evaluation › FAILs when object is grasped but not lifted
- ✅ Deterministic Pick, Transport, and Target-Zone Evaluation › FAILs when object is carried into zone but not released
- ✅ Deterministic Pick, Transport, and Target-Zone Evaluation › FAILs when object is released outside target zone with near-miss distance
- ✅ Deterministic Pick, Transport, and Target-Zone Evaluation › ignores client-supplied object state, zone membership, and verdict
- ✅ SymbolicEvaluationService & Progression Integration › completes C1-L4 and unlocks C1-L5 on authoritative PASS
- ✅ SymbolicEvaluationService & Progression Integration › leaves C1-L5 locked when simulation FAILs
- ✅ SymbolicEvaluationService & Progression Integration › rejects evaluation request from another learner
- ✅ SymbolicEvaluationService & Progression Integration › is progression-idempotent on repeated PASS submissions
- ✅ SymbolicEvaluationService & Progression Integration › rejects wrong attempt
- ✅ SymbolicEvaluationService & Progression Integration › rejects wrong challenge
- ✅ SymbolicEvaluationService & Progression Integration › does not complete L5 when L4 passes
- ✅ SymbolicEvaluationService & Progression Integration › ensures transaction failure cannot produce false/phantom completion
- ✅ SymbolicEvaluationService & Progression Integration › resolves the latest qualified L4 ProgramVersion when student passed multiple times

#### `src/modules/learning/experiment-run.db.spec.ts` (6 test)

- ✅ runs a pending experiment for an actively enrolled owner
- ✅ denies direct invocation after the enrollment is revoked and leaves the experiment pending
- ✅ denies after the classroom is archived
- ✅ denies when the offering is no longer active or the classroom moved to another offering (stale enrollment)
- ✅ denies another student, including one in the same classroom or another organization, and never runs the victim's experiment
- ✅ assertAttemptWritable (VR / demonstration) follows the same enrollment, archive, stale-offering and ownership rules

#### `src/modules/learning/experiment.service.spec.ts` (17 test)

- ✅ reuses evidence only for the same attempt and program version
- ✅ creates only an own authorized version as a pending schematic experiment
- ✅ denies another student's version or unrelated classroom without disclosure
- ✅ rejects unsupported simulation, offline replay, and real-robot modes
- ✅ denies suspended membership or missing experiment capability
- ✅ denies invalid lifecycle transitions
- ✅ does not disclose artifacts outside experiment ownership
- ✅ persists the small schematic result in output_snapshot without creating an external artifact row
- ✅ does not claim a run when another request already changed pending lifecycle
- ✅ rejects malformed canonical input before it claims the pending experiment
- ✅ cannot publish terminal success when the transactional output write fails
- ✅ ExperimentService.runSchematic enrollment enforcement › checks the experiment's own classroom with the enrollment-aware guard before any run work
- ✅ ExperimentService.runSchematic enrollment enforcement › scopes the lookup to the caller and resolves the classroom from attempt provenance
- ✅ ExperimentService.runSchematic enrollment enforcement › denies a caller without the execute capability
- ✅ ExperimentService.compare ownership › only compares experiments the caller owns, and a foreign or unknown id is indistinguishable from a missing one
- ✅ ExperimentService.compare ownership › rejects duplicate ids and callers without the execute capability before touching the database
- ✅ ExperimentService.compare ownership › stores only the caller's identity and returns no classroom, organization or other learner data; historical comparison stays possible after revocation

#### `src/modules/learning/p08-simulation-result-handoff.spec.ts` (19 test)

- ✅ Required Qualification Tests (TEST A - TEST L) › TEST A: C1-L4 PASS resolves exact ProgramVersion
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST B: failed ProgramVersion does not qualify
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST C: FAIL → PASS resolves PASS version
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST D: PASS → later FAIL still resolves most recent successful PASS
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST E: PASS v1 → PASS v2 resolves deterministic latest successful version
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST F: another learner cannot resolve/access qualification
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST G: wrong course does not resolve qualification
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST H: wrong challenge/lesson provenance cannot qualify
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST I: qualification survives fresh service/query reconstruction
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST J: C1-L4 PASS completes L4
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST K: L4 PASS unlocks L5
- ✅ Required Qualification Tests (TEST A - TEST L) › TEST L: L4 PASS does NOT complete L5
- ✅ Evidence and Provenance Inspection › fetches own evaluation result with exact immutable evidence
- ✅ Evidence and Provenance Inspection › rejects another learner's result (404/authorization boundary)
- ✅ Evidence and Provenance Inspection › resolves exact Experiment ID attached to the evaluation
- ✅ Evidence and Provenance Inspection › returns persisted rule evidence and metrics
- ✅ Evidence and Provenance Inspection › historical FAIL remains retrievable with full failure evidence
- ✅ Evidence and Provenance Inspection › L5 lesson detail includes qualification summary from latest passing L4 version
- ✅ Evidence and Provenance Inspection › listSymbolicEvaluations supports filtering by attemptId

#### `src/modules/learning/programming-assignment-authoring.db.spec.ts` (10 test)

- ✅ creates a non-quiz template in the activity lesson and links it to the guided_practice activity
- ✅ edits the same template in place and keeps the configuration after a reload
- ✅ publishes a guided_practice activity backed by a valid programming template
- ✅ rejects a quiz assignment on a guided_practice activity (link and publish)
- ✅ rejects a programming assignment on a knowledge_check activity and a type change that would mismatch
- ✅ keeps the quiz link working for knowledge_check activities
- ✅ rejects an assignment that belongs to another course or lesson
- ✅ rejects unauthorized authoring (no permission, other organization, anonymous-like)
- ✅ validates the configuration and the activity type
- ✅ refuses to edit a template that was already delivered to a classroom, and a frozen archived course

#### `src/modules/learning/programming.service.spec.ts` (20 test)

- ✅ rejects unsupported RobotProgram actions before persistence
- ✅ creates a program only for the current learner's scoped attempt
- ✅ rejects a submission version that belongs to a different program
- ✅ revoked enrollment › cannot create a program
- ✅ revoked enrollment › cannot submit an attempt
- ✅ revoked enrollment › cannot save a new program version
- ✅ revoked enrollment › cannot update a program
- ✅ revoked enrollment › can still read the preserved program and its versions
- ✅ does not reveal another learner's attempt as a program
- ✅ rejects a curriculum action that is not allowed by the assignment
- ✅ accepts only canonical actions explicitly allowed for a curriculum assignment
- ✅ does not apply curriculum restrictions to legacy assignment contracts
- ✅ preserves a saved disallowed workspace but blocks it from immutable version evidence
- ✅ fails closed when a curriculum allowed-block contract contains an unknown capability
- ✅ rejects a disallowed canonical action through the public update flow
- ✅ rejects a version with a mismatched/disallowed workspace through public submit
- ✅ submit after a passing simulation run › still submits a teacher-created assignment (no curriculum contract) and projects no lesson progression
- ✅ submit after a passing simulation run › keeps projecting progression for curriculum programming assignments
- ✅ creating ProgramVersion inserts a new immutable version without mutating previous versions
- ✅ editing draft after version creation leaves immutable version unchanged

#### `src/modules/learning/robot-program-limits.spec.ts` (3 test)

- ✅ accepts a normal Course 1 sized program
- ✅ rejects programs above the configured step limit
- ✅ rejects oversized persisted programs before symbolic rendering

#### `src/modules/learning/schematic-engine.service.spec.ts` (3 test)

- ✅ renders deterministic symbolic left/right state and wait ordering
- ✅ rejects malformed or unsupported IR rather than guessing physics semantics
- ✅ records a preview coordinate declaration without treating it as physical motion

#### `src/modules/learning/symbolic-rules/symbolic-evaluation-preparation.service.spec.ts` (11 test)

- ✅ loads only an own successful schematic chain and creates deterministic immutable preparation
- ✅ carries the evaluated ProgramVersion number from the persisted chain
- ✅ does not disclose another learner experiment
- ✅ rejects inactive users before querying
- ✅ rejects a missing execution capability or inactive classroom scope without compiling rules
- ✅ rejects a chain without a persisted assignment challenge
- ✅ rejects malformed or unknown persisted challenge conditions
- ✅ rejects mismatched submitted ProgramVersion provenance
- ✅ rejects persisted output that does not belong to the submitted ProgramVersion
- ✅ rejects non-succeeded or non-schematic experiments
- ✅ changes semantic hash and fingerprint after mutable conditions change without relying on old conditions

#### `src/modules/learning/symbolic-rules/symbolic-evaluation.service.spec.ts` (9 test)

- ✅ persists evidence, marks its attempt evaluated, and projects PASS atomically
- ✅ does not mark the attempt when evidence persistence fails
- ✅ converges duplicate evidence before marking evaluated
- ✅ rolls back when the owning attempt cannot transition
- ✅ persists a failed verdict without completing progression
- ✅ rolls back evidence when progression persistence fails
- ✅ reports and persists the evaluated ProgramVersion number, not a fixed version 1
- ✅ returns only owned evaluation evidence
- ✅ lists only owned evidence

#### `src/modules/learning/symbolic-rules/symbolic-rule-compiler.service.spec.ts` (6 test)

- ✅ compiles every approved v1 rule into canonical semantic JSON
- ✅ is stable across database retrieval order but reacts to changed semantics
- ✅ rejects ambiguous/unknown authoring instead of inferring intent
- ✅ uses ordered subsequence semantics and deterministic symbolic wait milliseconds
- ✅ does not accept physics, Vision, VLA, or non-integer duration rules
- ✅ derives preview-target evidence from server-authored rule configuration

## 6. Danh sách từng test — Web (domain L01–L03)

Kết quả Web: 25/25 file, 82/82 test PASS, 0 FAIL, 0 skipped

#### `src/components/studio/curriculumToolbox.spec.ts` (5 test)

- ✅ curriculum toolbox › maps L2 canonical capabilities to the existing Blockly block types
- ✅ curriculum toolbox › adds gripper blocks only when the server permits them
- ✅ curriculum toolbox › keeps L3/L4 limited to movement and gripper capabilities
- ✅ curriculum toolbox › fails closed for an unknown server capability
- ✅ curriculum toolbox › reports disallowed saved blocks without rewriting the workspace

#### `src/components/submission/submission-ui.spec.tsx` (17 test)

- ✅ D03 submission UI › GradingFeedbackPanel › shows only an awaiting-review notice before release (no score, rubric or feedback)
- ✅ D03 submission UI › GradingFeedbackPanel › shows the grade, rubric rows and feedback once released
- ✅ D03 submission UI › GradingFeedbackPanel › does not even request grading for an attempt that is not submitted
- ✅ D03 submission UI › GradingFeedbackPanel › surfaces a load failure instead of an empty grade
- ✅ D03 submission UI › AttachmentUploader › lists files with download and remove while the attempt is open
- ✅ D03 submission UI › AttachmentUploader › is read-only for a submitted attempt: download only, no upload or remove controls
- ✅ D03 submission UI › AttachmentUploader › rejects an unapproved file type before contacting the server
- ✅ D03 submission UI › AttachmentUploader › uploads with a signed post, then asks the server to verify the file
- ✅ D03 submission UI › AttachmentUploader › removes the pending record when the browser upload fails
- ✅ D03 submission UI › StudentAssignmentDetail › shows type, window, attempts used and every attempt with its own state
- ✅ D03 submission UI › StudentAssignmentDetail › resumes an open attempt instead of starting another
- ✅ D03 submission UI › StudentAssignmentDetail › starts a new attempt and opens the existing practice workspace
- ✅ D03 submission UI › StudentAssignmentDetail › blocks starting when the maximum attempts are used or the delivery is closed
- ✅ D03 submission UI › StudentAssignmentDetail › labels a closed assignment and never offers a start button
- ✅ D03 submission UI › StudentAssignmentDetail › marks a reconstructed historical attempt
- ✅ D03 submission UI › StudentAssignmentDetail › shows an unavailable state instead of crashing when the assignment cannot be loaded
- ✅ D03 submission UI › StudentAssignmentDetail › reveals read-only attachments and the grading panel when a finished attempt is expanded

#### `src/components/submission/submissionState.spec.ts` (6 test)

- ✅ assignmentKind / acceptsAttachments › classifies assignments by their constraints
- ✅ assignmentKind / acceptsAttachments › offers attachments only when explicitly enabled and never for quizzes or physical labs
- ✅ windowState › derives availability, due and closed states
- ✅ nextAction › resumes the open attempt, starts a new one, or explains why not
- ✅ attemptPresentation › never shows a grade before release and labels quizzes by their auto-graded result
- ✅ formatting › formats sizes and totals scores

#### `src/lib/c1EvidenceOrchestrator.spec.ts` (6 test)

- ✅ C1 evidence orchestration › persists each stage in order and returns only backend evaluation evidence
- ✅ C1 evidence orchestration › reports submission persisted when evaluation fails and never fabricates pass
- ✅ C1 evidence orchestration › reuses a succeeded experiment without attempting an invalid second run
- ✅ C1 evidence orchestration › restores an evaluation only when it matches the submitted ProgramVersion
- ✅ C1 evidence orchestration › does not fall back to old evidence when the latest version is incomplete
- ✅ C1 evidence orchestration › does not rerun an experiment already running

#### `src/lib/robotExecution.spec.ts` (3 test)

- ✅ physical execution boundary › rejects learning preview coordinates before any physical client is called
- ✅ physical execution boundary › keeps the existing C1 canonical subset eligible at this browser boundary
- ✅ physical execution boundary › uses only Education API attempt/execution identities and never sends commands

#### `src/pages/Practice.spec.tsx` (30 test)

- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 1 & 2. renders the existing Blockly and SO-101 preview with server-driven L2 blocks
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 3. Existing preview controls still render and function
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 4. fails closed when the server sends an unknown allowed block
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 5. Save Version still works and creates immutable version
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 6. Run Simulation requires immutable version and is disabled when none exists
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 7 & 8. Unsaved changes prevent stale simulation and show student warning
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › reload: an unedited recovered version keeps Run simulation enabled (UI events and re-serialization are not edits)
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 9 & 10 & 13. Valid saved version can Run Simulation, displays loading state, PASS result, and invalidates queries
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 11 & 14 & 15. Failed simulation displays FAIL card with specific feedback and does NOT show L3 unlocked
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0. Run simulation may be repeated without finalizing; Submit assignment is a separate, confirmed, one-time final action that locks the attempt
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 12. TASK FAIL and SYSTEM ERROR are visually/semantically distinct
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 16. Editing after failed result allows new version creation and re-simulation
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 17. Existing workspace remains intact after evaluation
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 18. keeps L1 as a lesson knowledge check and does not render Blockly
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 19. exposes gripper capabilities for L3 while keeping advanced blocks excluded
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › 19b. exposes full Pick & Place capabilities for L4 without Course 2/advanced blocks
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › preserves existing workspace containing disallowed blocks without deletion, warns learner and blocks version creation
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › renders recoverable error state with retry button when attempt loading fails
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.6 — C1-L3 Grab & Release Simulation UX › evaluates L3 with Run Simulation, displays PASS card and unlocks Pick & Place (C1-L4)
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.6 — C1-L3 Grab & Release Simulation UX › evaluates L3 with Run Simulation, displays grasp failure feedback without unlocking L4
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.6 — C1-L3 Grab & Release Simulation UX › evaluates L3 with Run Simulation, displays lift failure feedback
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.6 — C1-L3 Grab & Release Simulation UX › evaluates L3 with Run Simulation, displays release failure feedback
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.6 — C1-L3 Grab & Release Simulation UX › distinguishes SYSTEM ERROR from TASK FAIL on L3 simulation failure
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.7 — C1-L4 Pick & Place Simulation UX › renders L4 task context, Blockly workspace, SO-101 3D preview, challenge object, and target zone
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.7 — C1-L4 Pick & Place Simulation UX › evaluates L4 with Run Simulation, displays PASS card unlocking Physical Robot Lab (C1-L5), does NOT show physical run button, and invalidates progression queries
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.7 — C1-L4 Pick & Place Simulation UX › evaluates L4 with Run Simulation, displays outside-target FAIL feedback with near-miss distance and guidance
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.7 — C1-L4 Pick & Place Simulation UX › evaluates L4 with Run Simulation, displays no-grasp FAIL feedback
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.7 — C1-L4 Pick & Place Simulation UX › evaluates L4 with Run Simulation, displays no-lift FAIL feedback
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.7 — C1-L4 Pick & Place Simulation UX › evaluates L4 with Run Simulation, displays no-release FAIL feedback
- ✅ Course 1 Practice integration & L2 Authoritative Task Simulation › P0.7 — C1-L4 Pick & Place Simulation UX › distinguishes SYSTEM ERROR from TASK FAIL on L4 simulation failure

#### `src/pages/SimulationResult.spec.tsx` (10 test)

- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 1. loads PASS result from persisted API evidence without needing transient Practice state
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 2. displays exact immutable ProgramVersion provenance prominently
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 3. renders all passed rule checks with check icons and messages
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 4. loads FAIL result with specific near-miss feedback and direction on what to fix
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 5. FAIL result Try Again returns to the same practice attempt
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 6. L4 PASS Continue Learning navigates to C1-L5 Physical Robot Lab detail
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 7. L4 PASS does NOT display course completed (shows Course 1 simulation challenge complete, unlocks L5)
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 8. renders compact simulation attempt history allowing navigation to prior immutable versions
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 9. expands technical evidence details on toggle
- ✅ SimulationResult — P0.8 Authoritative Evidence & Handoff Screen › 10. handles authorization failure / non-existent evaluation safely with empty state

#### `src/utils/robotProgram/toCanonicalNest.spec.ts` (5 test)

- ✅ toCanonicalNestRobotProgram › deterministically preserves the supported selected-arm subset
- ✅ toCanonicalNestRobotProgram › rejects unsupported movement instead of silently dropping it
- ✅ toCanonicalNestRobotProgram › permits Move XYZ only when the C2 learning-preview profile is explicit
- ✅ toCanonicalNestRobotProgram › rejects fractional learning-preview coordinates with a block-level message instead of letting the server refuse the save
- ✅ toCanonicalNestRobotProgram › rejects a gripper command without an explicit selected-arm context
