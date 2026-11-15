# L02 — Schematic Experiment & Symbolic Evaluation

> Domain owner: Phạm Viết Lợi · Audit ngày 15/11/2026 trên `develop` @ `a8bcae5` (audit trên `main` @ `b8ac12f`, kiểm chứng lại trên `develop`) · Trạng thái: **Audit xong, 1 lỗi đã sửa, chờ Đức review**
>
> Phạm vi: học sinh bấm **Run simulation** trên một ProgramVersion → server chạy mô phỏng → server chấm theo rule → trả PASS/FAIL
> kèm bằng chứng (evidence) → lưu lịch sử. Không gồm robot thật, MQTT, MuJoCo, Digital Twin (Đức phụ trách).

## 1. Tóm tắt một phút (dùng khi trình bày)

- **"Schematic" là bộ thông dịch tất định, không phải mô phỏng vật lý.** Nó chạy từng bước của RobotProgram, theo dõi tay nào đang
  chọn, vị trí đầu kẹp, trạng thái kẹp và một vật thể. Nó không có trọng lực, va chạm, IK hay động học. Cùng một chương trình luôn
  cho ra cùng một kết quả.
- **Server là nơi duy nhất quyết định PASS/FAIL.** Rule chấm được đọc từ DB (`learning_challenge_conditions`) và kết quả mô phỏng do
  server tự tính. Trình duyệt không gửi được rule, trạng thái vật hay verdict. Đã có test chứng minh rằng verdict giả từ trình duyệt bị bỏ qua.
- **Mỗi lần chấm để lại bằng chứng bất biến** (`learning_symbolic_evaluations`): hash của chương trình, hash của output mô phỏng,
  hash của bộ rule, phiên bản engine/evaluator và kết quả từng rule. Chấm lại cùng một thứ thì trả về đúng bản ghi cũ, nhờ `fingerprint` là duy nhất.
- **"Run" khác "Submit".** Run chỉ ghi kết quả vào attempt đang mở (bản nộp vẫn ở trạng thái `draft`). Chỉ **Submit** (L03) mới
  khoá attempt và mở khoá bài tiếp theo.

## 2. Luồng xử lý (3 lời gọi API cho mỗi lần Run)

```mermaid
sequenceDiagram
  autonumber
  actor S as Học sinh
  participant W as Web: Practice.tsx (runSimulation)
  participant E as ExperimentService
  participant G as SchematicEngineService
  participant V as SymbolicEvaluation(+Preparation) Service
  participant D as PostgreSQL
  S->>W: Run simulation (đã có ProgramVersion, không có sửa đổi chưa lưu)
  W->>E: POST /me/attempts/:attemptId/experiments {programVersionId, executionMode:"schematic"}
  E->>D: Kiểm tra Stage 2 · attempt của mình · version thuộc program của attempt · enrollment active
  E->>D: Tìm/ tạo submission DRAFT của attempt, trỏ tới version này
  E->>D: Khoá advisory (attempt:version) · dùng lại experiment pending/running/succeeded nếu đã có
  E->>D: Nếu chưa có: INSERT learning_experiments(status=pending) + event #0 "created"
  E-->>W: {id, status}
  alt status = pending
    W->>E: POST /me/experiments/:id/run-schematic
    E->>D: Đọc robot_program của version + vật thể/vùng đích của challenge
    E->>G: render(program, versionId, {objects, zones})
    G-->>E: SchematicArtifact (timeline + finalState)
    E->>D: pending→running (event #1) → succeeded + output_snapshot (event #2), trong 1 transaction
  end
  W->>V: POST /me/experiments/:id/evaluate-symbolic
  V->>D: Đọc lại toàn bộ chuỗi experiment→submission→attempt→assignment→challenge (chỉ của mình, enrollment active)
  V->>V: Compile rule từ DB → evaluate(ruleSet, output đã lưu) → fingerprint
  V->>D: INSERT learning_symbolic_evaluations ON CONFLICT (fingerprint) DO NOTHING
  alt Submission còn là draft (đang làm bài)
    V->>D: UPDATE attempts.result_snapshot (attempt phải in_progress) — KHÔNG hoàn thành bài
  else Submission đã nộp (submitted)
    V->>D: attempt → evaluated; nếu PASS → hoàn thành bài + mở khoá bài sau (projectSymbolicPass — xem GAP-L02-09 với bài giáo viên tự tạo)
  end
  V-->>W: {verdict, ruleResults, metrics, feedback, objectState, evidence, progression}
```

Code: [experiment.controller.ts](../../../services/education-api/src/modules/learning/experiment.controller.ts) ·
[experiment.service.ts](../../../services/education-api/src/modules/learning/experiment.service.ts) ·
[schematic-engine.service.ts](../../../services/education-api/src/modules/learning/schematic-engine.service.ts) ·
[symbolic-rules/](../../../services/education-api/src/modules/learning/symbolic-rules/) ·
web [Practice.tsx](../../../web/robot-edu/src/pages/Practice.tsx) (`runSimulation`) và [SimulationResult.tsx](../../../web/robot-edu/src/pages/SimulationResult.tsx).

## 3. API contract

| Method & path | Ý nghĩa | Lỗi chính |
| --- | --- | --- |
| `POST /me/attempts/:attemptId/experiments` `{programVersionId: uuid, executionMode: "schematic"}` | Tạo (hoặc dùng lại) experiment cho version | 503 nếu DB chưa có migration Stage 2 (J) · 404 nếu thiếu quyền `learning.experiment.execute`, version không thuộc attempt, hoặc attempt đã nộp mà chạy version khác · 409 attempt đóng/hết hạn |
| `POST /me/experiments/:id/run-schematic` | Chạy engine, lưu output | 409 `Only pending schematic experiments can run.` · 400 provenance sai / chương trình không hợp lệ cho engine · 404 không phải của mình hoặc mất enrollment |
| `POST /me/experiments/:id/evaluate-symbolic` | Chấm theo rule, lưu evidence | 400 experiment chưa `succeeded`, **assignment không có challenge**, rule trong DB sai cấu hình · 409 attempt không còn mở · 403 tài khoản không active |
| `GET /me/symbolic-evaluations?attemptId=` · `GET /me/symbolic-evaluations/:id` | Lịch sử chấm và chi tiết (dùng cho trang kết quả) | 404 nếu không phải của mình |
| `GET /me/experiments` · `/me/experiments/:id` · `/result` · `/events` · `/artifacts` | Đọc experiment | 404 |
| `POST /me/experiments/:id/cancel` | Huỷ experiment đang `pending` | 409 |
| `POST /me/experiment-comparisons` `{title, experimentIds[≥2], conclusion?}` | Lưu so sánh nhiều lần chạy | 400 trùng id · 404 id không phải của mình |

## 4. Engine mô phỏng — quy tắc tất định

Trạng thái ban đầu: hai tay ở `(0,0,0)`, kẹp mở; vật mặc định `cube-red` tại `(120,150,0)`; vùng đích mặc định `A = (60,280,120×90)`.
Nếu challenge có `learning_challenge_objects` thì dùng vật và vùng của challenge.

| Bước | Hiệu ứng |
| --- | --- |
| `arm.select` | Chọn tay hiện hành |
| `home` | Đưa tay (`arm` hoặc tay đang chọn) về `(0,0,0)` |
| `preview.move_xyz` | Đặt đầu kẹp của tay đó tới `(x,y,z)`. Nếu đang cầm vật thì vật đi theo (`z-20`). Nếu `z ≥ liftMinZ` (mặc định 70) thì ghi nhận **đã nâng** |
| `gripper.close` | Cần tay đã chọn. **Gắp được** khi khoảng cách ngang tới vật ≤ `graspRadius` (30) **và** `z ≤ graspMaxZ` (50); nếu không thì ghi nhận gắp trượt |
| `gripper.open` | Nếu đang cầm thì **thả** vật xuống `z=0`, ghi vị trí thả, xác định vật có nằm trong vùng đích không (chỉ xét x, y) |
| `wait` | Cộng thời gian logic `durationMs` |

Kết quả `SchematicArtifact` gồm `timeline` (mỗi bước một sự kiện) và `finalState` (tay, kẹp, vị trí preview cuối, `objectState`, `manipulation`, `targetZones`).

## 5. Bộ rule (13 loại) và mã kết quả

| Rule (`rule_key`) | Đạt khi | Mã PASS / FAIL |
| --- | --- | --- |
| `action_present` / `action_absent` | Có / không có hành động | `ACTION_PRESENT` / `ACTION_MISSING`, `ACTION_ABSENT` / `DISALLOWED_ACTION_FOUND` |
| `action_count` | Số lần so với `eq/gte/lte` | `ACTION_COUNT_MATCH` / `ACTION_COUNT_MISMATCH` |
| `ordered_actions` | Các hành động xuất hiện đúng thứ tự (subsequence, cho phép xen bước khác) | `ORDERED_ACTIONS_MATCH` / `ORDERED_ACTIONS_INCOMPLETE`, `SEQUENCE_INCOMPLETE` |
| `arm_selected` | Có chọn đúng tay | `ARM_SELECTED` / `ARM_NOT_SELECTED` |
| `final_gripper_state` | Kẹp của tay kết thúc ở trạng thái yêu cầu | `GRIPPER_STATE_MATCH` / `GRIPPER_FINAL_STATE_INVALID` |
| `home_action_present` | Có `home` cho tay | `HOME_ACTION_PRESENT` / `HOME_ACTION_MISSING` |
| `symbolic_duration` | Tổng thời gian `wait` so với ngưỡng | `WAIT_DURATION_MATCH` / `WAIT_DURATION_MISMATCH` |
| `preview_target_match` | Vị trí preview **cuối cùng** trùng **chính xác** toạ độ đích (đúng tay, đúng khung) | `PREVIEW_TARGET_MATCH` / `PREVIEW_TARGET_MISMATCH` |
| `object_grasped` | Vật đã được gắp | `OBJECT_GRASPED` / `GRASP_NOT_ESTABLISHED` (đã đóng kẹp nhưng trượt), `OBJECT_NOT_APPROACHED` (chưa từng đóng kẹp) |
| `object_lifted` | Vật đã được nâng | `OBJECT_LIFTED` / `OBJECT_NOT_LIFTED`, `OBJECT_NOT_GRASPED` (chưa gắp được nên không thể nâng) |
| `object_released` | Vật đã được thả | `OBJECT_RELEASED` / `OBJECT_NOT_RELEASED` |
| `object_in_target_zone` | Vị trí thả nằm trong vùng đích | `OBJECT_PLACED_IN_TARGET_ZONE` / `OBJECT_NEVER_GRASPED`, `OBJECT_NOT_LIFTED`, `OBJECT_NOT_RELEASED`, `OBJECT_RELEASED_OUTSIDE_TARGET` (kèm khoảng cách tới vùng) |

Compiler (`SymbolicRuleCompilerService`) **từ chối** rule sai thay vì đoán: `UNKNOWN_RULE_KEY`, `UNKNOWN_CONFIG_PROPERTY`, `INVALID_ACTION`,
`INVALID_ARM`, `INVALID_COMPARATOR`, `INVALID_COUNT`, `EMPTY_SEQUENCE`, `DUPLICATE_ORDINAL`, `INVALID_RULE_CONFIG`.

**Verdict = `passed` khi và chỉ khi mọi rule đều đạt.**

### Bộ rule của Course 1 (seed)

| Bài | Khối được phép | Rule |
| --- | --- | --- |
| C1-L2 Reach Target A | `arm.select, home, preview.move_xyz, wait` | `ordered_actions [home, preview.move_xyz, wait]` · `preview_target_match` left `(240,220,120)` |
| C1-L3 Grab & Release | `arm.select, preview.move_xyz, gripper.open, wait, gripper.close` | `ordered_actions [move, close, move, open]` · `object_grasped {arm:left}` · `object_lifted {minZ:70}` · `object_released` · `final_gripper_state left=open` |
| C1-L4 Pick & Place | như L3 + `home` | như L3 + `object_in_target_zone {objectId:cube-red, zoneId:A}` |

## 6. Bằng chứng (evidence), tính bất biến và idempotency

- `fingerprint = sha256(experimentId, programHash, outputSnapshotHash, schematicSchemaVersion, engineVersion, evaluatorVersion, ruleSetSchemaVersion, ruleSetHash)`.
  Cột `fingerprint` là `UNIQUE`, nên chấm lại cùng experiment sẽ trả về bản ghi đã có, không tạo trùng.
- Nếu giáo viên sửa rule thì `ruleSetHash` đổi, fingerprint đổi, và lần chấm mới tạo bản ghi mới. Bản ghi cũ giữ nguyên.
- `result_snapshot` trên attempt lưu `{evaluationId, programVersionId, verdict, ruleResults, metrics, status, taskState, robotState, objectState, feedback, evidence}`.
  Lúc nộp bài (L03), server dùng `evaluationId` + `programVersionId` trong đó để biết version nộp đã được chấm hay chưa.
- Experiment chỉ có 3 sự kiện cố định: `created` (#0), `schematic_started` (#1), `schematic_succeeded` (#2), cộng `cancelled` nếu huỷ.

Trạng thái experiment: `pending → running → succeeded` (hoặc `pending → cancelled`). Engine lỗi (chương trình không hợp lệ)
thì experiment **vẫn ở `pending`**, xem GAP-L02-04.

## 7. Phân quyền

| Kiểm tra | Ở đâu |
| --- | --- |
| Có quyền `learning.experiment.execute` (role học sinh) | `requireCapability`, thiếu thì trả 404 |
| Experiment / version / attempt phải của chính mình | Mọi truy vấn lọc theo `learner_user_id`; người khác trả 404 |
| Enrollment active, lớp active, offering active | `assertStudentClassroomAccess(..., {requireActiveEnrollment:true})` ở create, run và evaluate |
| Tài khoản active | `prepareForOwnExperiment` (403) |
| Provenance: version của experiment = version của submission = version trong output mô phỏng | `runSchematic` và `prepareForOwnExperiment` (400) |

## 8. Bằng chứng kiểm thử

| Suite | Kết quả | Chứng minh |
| --- | --- | --- |
| `c1-l2-task-simulation.spec.ts` | 16/16 | Đúng PASS; sai đích/thiếu bước/sai thứ tự FAIL; chỉ version bất biến được chấm; người khác/attempt khác/challenge khác bị từ chối; **verdict từ trình duyệt không ép được PASS**; lỗi transaction không tạo hoàn thành giả |
| `c1-l3-object-simulation.spec.ts` | 23/23 | Gắp/nâng/thả tất định; trạng thái vật do client gửi bị bỏ qua; PASS mở L4, FAIL không mở |
| `c1-l4-pick-place-simulation.spec.ts` | 15/15 | Pick & place đúng PASS; các kiểu sai đều FAIL kèm mã; L4 PASS mở L5 nhưng **không** hoàn thành L5 |
| `symbolic-rule-compiler / -evaluation / -evaluation-preparation` | 6 + 9 + 11 | Rule chuẩn hoá ổn định; rule sai bị từ chối; evidence nguyên tử, rollback đúng; **versionNumber đúng (test mới)** |
| `experiment.service.spec.ts` + `experiment-run.db.spec.ts` (PostgreSQL thật) | 17 + 6 | Vòng đời experiment; enrollment bị thu hồi / lớp archive / offering đổi đều chặn chạy |
| `schematic-engine.service.spec.ts` | 3/3 | Tất định; IR sai bị từ chối |
| `p08-simulation-result-handoff.spec.ts` | 19/19 | Lịch sử FAIL vẫn đọc được; xác định đúng version qualified cho L5 |

Chi tiết: [evidence/2026-11-15-test-evidence.md](evidence/2026-11-15-test-evidence.md).

## 9. Thay đổi đã thực hiện trong đợt này (chưa commit, chờ review)

| File | Thay đổi | Lý do |
| --- | --- | --- |
| `symbolic-rules/symbolic-evaluation-preparation.service.ts` | Truy vấn thêm `pv.version_number`, trả về `versionNumber` | Trước đây response của `POST /evaluate-symbolic` **và `result_snapshot` lưu trong DB** luôn ghi `versionNumber = 1`, dù học sinh đang ở version 2, 3… (GAP-L02-01) |
| `symbolic-rules/symbolic-evaluation.service.ts` | Bỏ `(prepared as any).versionNumber ?? 1` | Có kiểu rõ ràng, không còn giá trị mặc định sai |
| 2 file spec tương ứng | +2 test hồi quy | Chứng minh số version được trả về và được lưu đúng |

Các vấn đề còn lại của L02: xem [GAP-LIST.md](GAP-LIST.md) (GAP-L02-*). Đáng chú ý nhất là evaluator chưa áp dụng tham số `arm`, `minZ`, `zoneId` của rule
(đã tái hiện được, xem log trong evidence).
