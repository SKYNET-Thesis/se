# L01 — Blockly Programming & Validation

> Domain owner: Phạm Viết Lợi · Audit ngày 15/11/2026 trên `develop` @ `a8bcae5` (audit trên `main` @ `b8ac12f`, kiểm chứng lại trên `develop`) · Trạng thái: **Audit xong, chờ Đức review**
>
> Phạm vi: học sinh mở bài thực hành → kéo thả Blockly → hệ thống kiểm tra → lưu bản nháp → tạo **ProgramVersion bất biến**.
> Không gồm: chạy mô phỏng/chấm điểm (xem [L02](L02-schematic-experiment-symbolic-evaluation.md)), nộp bài và chấm tay (xem [L03](L03-programming-assignment-flow.md)), robot thật/MQTT/MuJoCo (Đức phụ trách).

## 1. Tóm tắt một phút (dùng khi trình bày)

- Học sinh **không bao giờ gửi điểm hay kết quả**; trình duyệt chỉ gửi 2 thứ: `workspaceJson` (trạng thái Blockly để mở lại) và
  `robotProgram` (chương trình chuẩn hoá, gọi là *canonical RobotProgram IR v1*).
- Có **3 tầng dữ liệu**: `learning_programs` = bản nháp sửa được · `learning_program_versions` = bản chụp bất biến (v1, v2, …) ·
  `learning_submissions` = bài nộp cuối (L03). Mô phỏng và chấm điểm **chỉ chạy trên ProgramVersion**, không bao giờ chạy trên nháp.
- Kiểm tra theo **6 lớp**, từ trình duyệt đến server. Server là nơi quyết định; kiểm tra ở trình duyệt chỉ để báo lỗi sớm và rõ.
- Mỗi bài (assignment) tự quy định **bảng khối lệnh được phép** (`allowed_blocks`). Server từ chối mọi lệnh ngoài bảng đó.

## 2. Luồng xử lý

```mermaid
sequenceDiagram
  autonumber
  actor S as Học sinh
  participant W as Web: Practice.tsx
  participant A as API: ProgrammingController / ProgrammingService
  participant D as PostgreSQL
  S->>W: Mở /practice/:attemptId
  W->>A: GET /me/attempts/:attemptId/program
  alt Chưa có program (404)
    W->>A: POST /me/attempts/:attemptId/program {title, workspaceJson rỗng, robotProgram rỗng}
    A->>D: INSERT learning_programs; UPDATE attempts.program_id
  end
  W->>W: Dựng toolbox từ allowed_blocks (buildCurriculumToolbox)
  loop Mỗi lần kéo thả (debounce 700 ms)
    W->>W: generateProgram → validateWorkspaceBlockTypes → toCanonicalNestRobotProgram
    W->>A: PATCH /me/programs/:programId {workspaceJson, robotProgram nếu hợp lệ}
    A->>D: UPDATE learning_programs (validation_result ghi lại workspaceIssues)
  end
  S->>W: Bấm "Save version"
  W->>A: PATCH program (lưu lần cuối) rồi POST /me/programs/:programId/versions {changeSummary}
  A->>D: SELECT … FOR UPDATE; INSERT learning_program_versions(version_number = max+1)
  A-->>W: {id, version_number, …} → hiển thị "Immutable ProgramVersion N saved"
```

Code tương ứng:
[programming.controller.ts](../../../services/education-api/src/modules/learning/programming.controller.ts) ·
[programming.service.ts](../../../services/education-api/src/modules/learning/programming.service.ts) ·
[Practice.tsx](../../../web/robot-edu/src/pages/Practice.tsx) (`persistWorkspace`, `saveCurriculumVersion`) ·
[curriculumToolbox.ts](../../../web/robot-edu/src/components/studio/curriculumToolbox.ts) ·
[toCanonicalNest.ts](../../../web/robot-edu/src/utils/robotProgram/toCanonicalNest.ts).

## 3. API contract

Tất cả endpoint nằm dưới `/api/v1`, yêu cầu `Authorization: Bearer <Supabase JWT>` (qua `SupabaseAuthGuard`).

| Method & path | Body | Thành công | Lỗi chính |
| --- | --- | --- | --- |
| `GET /me/attempts/:attemptId/program` | — | 200 `ProgramRow` | 404 `Program was not found.` (chưa có program, hoặc không phải attempt của mình) |
| `POST /me/attempts/:attemptId/program` | `{ title?: string≤200, workspaceJson: object, robotProgram: object }` | 201 `ProgramRow` | 409 `This attempt already has a program.` · 400 lỗi IR/allowed-blocks · 409 `ATTEMPT_NOT_IN_PROGRESS` / `ASSIGNMENT_NOT_AVAILABLE` / `ASSIGNMENT_CLOSED` · 404 `Assignment was not found.` (không còn enrollment active) |
| `PATCH /me/programs/:programId` | `{ title?, workspaceJson?, robotProgram? }` | 200 **mảng** `[ProgramRow]` (xem GAP-L01-03) | như trên |
| `GET /me/programs/:programId/versions` | — | 200 `ProgramVersion[]` (mới nhất trước) | 404 |
| `POST /me/programs/:programId/versions` | `{ changeSummary?: string≤500 }` | 201 `ProgramVersion` | 400 workspace chứa khối không được phép · các lỗi như trên |

`ProgramRow = { id, owner_user_id, assignment_id, title, schema_version, workspace_json, robot_program, validation_result }`
`ProgramVersion = { id, program_id, version_number, workspace_json, robot_program, validation_result, change_summary, created_by, created_at }`

Ví dụ `robotProgram` hợp lệ của C1-L2:

```json
{ "kind": "robot_program", "schemaVersion": 1, "steps": [
  { "type": "arm.select", "arm": "left" },
  { "type": "home", "arm": "left" },
  { "type": "preview.move_xyz", "mode": "learning_preview", "frame": "learning_preview_v1", "arm": "left", "position": { "x": 240, "y": 220, "z": 120 } },
  { "type": "wait", "durationMs": 500 }
] }
```

## 4. Ánh xạ khối Blockly ↔ RobotProgram ↔ quyền trong bài

| Khối Blockly (`workspace_json`) | Lệnh trung gian (generator) | Bước canonical (`robot_program.steps[].type`) | Capability id trong `allowed_blocks` |
| --- | --- | --- | --- |
| `robot_start` | — (điểm bắt đầu) | — | luôn được phép |
| `robot_select_arm` | `arm_select` | `arm.select` (`arm: left/right`) | `arm.select` |
| `robot_move_home` (một tay) | `move_home` | `home` (`arm`) | `home` |
| `robot_move_to` | `move_to` | `preview.move_xyz` (toạ độ nguyên, khung `learning_preview_v1`) | `preview.move_xyz` |
| `robot_wait` (giây) | `wait` | `wait` (`durationMs = round(giây × 1000)`) | `wait` |
| `robot_gripper_open` / `_close` | `gripper` | `gripper.open` / `gripper.close` (dùng tay đang chọn) | `gripper.open` / `gripper.close` |
| `robot_move_joint`, home hai tay, `move_both`, `sync`, `repeat`, `if` | có | **không có** — bị từ chối với thông báo rõ ràng | — |

Bảng ánh xạ này hiện được khai báo ở **2 nơi**: `CURRICULUM_BLOCK_REGISTRY` (web) và `mapping` trong `curriculumWorkspaceIssues` (API). Xem GAP-L01-04.

## 5. Sáu lớp kiểm tra (validation)

| # | Nơi | Kiểm tra gì | Khi sai |
| --- | --- | --- | --- |
| 1 | Web — `generator.ts` + `validator.ts` | Toạ độ trong bàn (x 0–600, y 0–400, z 10–300), tay với tới được (IK), tốc độ 10–100%, wait 0.1–30 s, cần chọn tay | Báo lỗi trên khối, không cho tạo version |
| 2 | Web — `validateWorkspaceBlockTypes` | Workspace chỉ chứa khối có trong toolbox của bài | Báo lỗi, vẫn lưu nháp |
| 3 | Web — `toCanonicalNestRobotProgram` | Chỉ nhận tập lệnh server hiểu; gripper/move cần ngữ cảnh tay; **toạ độ phải là số nguyên** (bổ sung 15/11) | Nháp vẫn lưu `workspaceJson` nhưng **không gửi** `robotProgram` |
| 4 | API — DTO (`class-validator`, `whitelist + forbidNonWhitelisted`) | Kiểu dữ liệu, độ dài, không có field lạ | 400 |
| 5 | API — `assertRobotProgramBounds` + `validateRobotProgram` | ≤ 1000 bước, ≤ 1 MB; `kind/schemaVersion`; 6 loại bước; wait nguyên 0–60000 ms; `arm.select` left/right; `preview.move_xyz` đủ `mode/frame/arm`, toạ độ nguyên trong khung; chỉ cho `preview.move_xyz` nếu bài cho phép | 400 với thông báo cụ thể |
| 6 | API — `validateCurriculumProgram` + `curriculumWorkspaceIssues` (chỉ khi `constraints.kind = "symbolic_program"`) | `allowed_blocks` chỉ chứa capability được hỗ trợ (nếu không → **fail closed**); mỗi bước thuộc `allowed_blocks`; khối trong workspace thuộc bảng ánh xạ | Lưu nháp: ghi vào `validation_result.workspaceIssues` (giữ bài làm). Tạo version / nộp bài: 400 |

`validation_result` được lưu cùng program/version: `{ valid, schemaVersion, actionCount, workspaceIssues, validatedAt }`.

## 6. Dữ liệu (database)

| Bảng | Cột chính | Ràng buộc quan trọng |
| --- | --- | --- |
| `learning_programs` | `owner_user_id`, `assignment_id`, `title`, `schema_version`, `workspace_json`, `robot_program`, `validation_result` | Một program cho mỗi attempt (`learning_assignment_attempts.program_id`); chỉ chủ sở hữu đọc/ghi được |
| `learning_program_versions` | `program_id`, `version_number`, `workspace_json`, `robot_program`, `validation_result`, `change_summary`, `created_by` | `UNIQUE(program_id, version_number)`; **không có API sửa/xoá** → bất biến |
| `learning_assignments` | `allowed_blocks` (text[]), `constraints` (jsonb, `kind`) | Do admin/giáo viên cấu hình (Course Builder → Programming Assignment) |

## 7. Phân quyền và trạng thái

- **Chỉ chủ sở hữu**: mọi truy vấn lọc theo `owner_user_id = user.vistaUserId` / `learner_user_id`; attempt của người khác trả **404** (không tiết lộ là có tồn tại).
- **Đọc** (`GET`): chỉ cần còn là thành viên lớp, nên lịch sử bài làm vẫn xem được sau khi bị thu hồi quyền.
- **Ghi** (`POST`/`PATCH`): bắt buộc `requireActiveEnrollment` — lớp `active`, offering `active`, enrollment `active`.
- **Attempt phải đang mở** (`assertAttemptOpen`): attempt `in_progress`, bài giao `published`, đã tới `available_from`, chưa qua `close_at`.
  Quá hạn nộp (`due_at`) **không** chặn; chỉ `close_at` mới chặn.
- **Chống ghi đè đồng thời**: `createVersion` khoá hàng program (`FOR UPDATE`) rồi mới cấp `version_number`.

## 8. Bằng chứng kiểm thử

Toàn bộ test liên quan đều đạt; chi tiết từng test xem [evidence/2026-11-15-test-evidence.md](evidence/2026-11-15-test-evidence.md).

| Suite | Kết quả | Nội dung chứng minh |
| --- | --- | --- |
| `programming.service.spec.ts` | 18/18 | Lệnh lạ bị từ chối; chỉ chủ sở hữu tạo program; version của program khác bị từ chối khi nộp; enrollment bị thu hồi không ghi được nhưng vẫn đọc được; allowed-blocks; workspace sai bị chặn ở version; version bất biến khi sửa nháp |
| `programming-assignment-authoring.db.spec.ts` (PostgreSQL thật) | 10/10 | Cấu hình bài lập trình được lưu và đọc lại đúng; khoá sửa sau khi đã giao |
| `robot-program-limits.spec.ts` | 3/3 | Giới hạn số bước và dung lượng |
| `toCanonicalNest.spec.ts`, `curriculumToolbox.spec.ts` (web) | 18 + 5 | Ánh xạ khối → IR; toolbox theo `allowed_blocks`; **toạ độ nguyên trong khung được chấp nhận (kể cả biên 0/600, 0/400, 10/300); toạ độ lẻ và ngoài khung bị từ chối kèm thông điệp gắn với khối** |
| `blocklyConfig.spec.ts` (web, mới) | 7/7 | Ô X/Y/Z của `robot_move_to` **thực sự** làm tròn về số nguyên mm và kẹp vào `x 0–600, y 0–400, z 10–300` (khối Blockly thật, không giả lập) |
| `programming-evaluation-regression.db.spec.ts` (PostgreSQL thật, mới) | 28/28 | Version `1,2,3` liên tiếp; số version được chấm = số version trong DB = `result_snapshot` = `GET /me/symbolic-evaluations/:id` = danh sách; lịch sử version nhất quán và bất biến; submission đóng băng đúng version; server nhận toạ độ nguyên (gồm 2 biên) và từ chối toạ độ lẻ / ngoài khung ở từng trục bằng 400; các kiểm tra khác (lệnh lạ, schema sai, khối ngoài bài, wait âm) không bị yếu đi |

## 9. Thay đổi trong PR #147

| File | Thay đổi | Lý do |
| --- | --- | --- |
| `web/robot-edu/src/components/studio/blocklyConfig.ts` | Ô X/Y/Z của `robot_move_to` có `precision: 1` và min/max theo khung `learning_preview_v1` | Trước đây học sinh nhập được 240.5 hoặc 900; server từ chối cả request tự động lưu → **mất bản nháp** (GAP-L01-01) |
| `web/robot-edu/src/utils/robotProgram/toCanonicalNest.ts` (+ test) | Từ chối toạ độ không nguyên **và ngoài khung** (cùng quy tắc với `ProgrammingService`), báo lỗi gắn với đúng khối | Phòng thủ cho workspace cũ đã lưu số lẻ/ngoài khung; nháp vẫn được lưu |
| `web/robot-edu/src/components/studio/blocklyConfig.spec.ts` | Test mới cho hành vi thật của ô số | Trước đây chưa có test cho phần này |

Các vấn đề còn lại của L01: xem [GAP-LIST.md](GAP-LIST.md) (GAP-L01-*).
