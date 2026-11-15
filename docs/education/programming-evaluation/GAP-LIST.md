# Gap list — Programming, Schematic Evaluation & Assignment Flow (L01–L03)

> Lập ngày 15/11/2026 bởi domain owner Phạm Viết Lợi, trên `develop` @ `a8bcae5` (audit trên `main` @ `b8ac12f`, kiểm chứng lại trên `develop`). Mỗi mục đều được xác minh bằng đọc code, test, hoặc script tái hiện.
> Mức độ: **Cao** = chặn demo/sai nghiệp vụ · **Trung bình** = sai dữ liệu/kết quả trong tình huống cụ thể · **Thấp** = khó bảo trì, tình huống biên.
> Trạng thái: **Đã sửa (PR #147)** = đã có code + test hồi quy, nằm trong PR #147 · **Đề xuất** = cần Đức/nhóm quyết định trước khi sửa · **Theo dõi** = biết rõ, chưa có kế hoạch sửa.
> Cập nhật sau đợt fix sprint: GAP-L02-02, -03, -09 đã được chủ dự án giao sửa và đã sửa trong cùng PR.

## Tổng hợp

| ID | Mức độ | Tóm tắt | Owner đề xuất | Trạng thái |
| --- | --- | --- | --- | --- |
| [GAP-L03-01](#gap-l03-01) | Cao | Không có API giao template lập trình (allowed_blocks) xuống lớp; chỉ seed làm được | Đức + Lợi | Đề xuất |
| [GAP-L03-02](#gap-l03-02) | Cao | Không có API/UI soạn challenge và rule chấm; bài từ Course Builder không chấm tự động được | Đức + Lợi | Đề xuất |
| [GAP-L03-04](#gap-l03-04) | Cao | Chương trình L4 (`preview.move_xyz`) không chạy được trên Robot Runtime | **Đức** | Đề xuất |
| [GAP-L03-07](#gap-l03-07) | Cao (production) | Production cần migration J, nếu không nộp bài/chạy thử trả 503 | **Đức** | Theo dõi |
| [GAP-L02-01](#gap-l02-01) | Trung bình | `versionNumber` luôn = 1 trong response chấm và trong `result_snapshot` | Lợi | **Đã sửa (PR #147)** |
| [GAP-L01-01](#gap-l01-01) | Trung bình | Nhập toạ độ thập phân làm hỏng autosave và mất nháp workspace | Lợi | **Đã sửa (PR #147)** |
| [GAP-L02-02](#gap-l02-02) | Trung bình | Evaluator bỏ qua `arm` / `minZ` / `objectId` của rule; L3/L4 PASS bằng tay phải | Lợi (cần Đức duyệt) | **Đã sửa (PR #147)** |
| [GAP-L02-03](#gap-l02-03) | Trung bình | `object_in_target_zone` chấm theo vùng hardcode, bỏ qua vùng đích thật của challenge | Lợi (cần Đức duyệt) | **Đã sửa (PR #147)** |
| [GAP-L02-09](#gap-l02-09) | Trung bình | Bài giáo viên tự tạo: nộp trước rồi mới chấm PASS thì 409 + rollback, attempt không bao giờ `evaluated` | Lợi (theo mẫu `0c818bb`) | **Đã sửa (PR #147)** |
| [GAP-L01-02](#gap-l01-02) | Thấp–TB | Lưu version không kiểm tra ngữ cảnh tay; lỗi chỉ lộ ra khi chạy thử | Lợi | Đề xuất |
| [GAP-L02-10](#gap-l02-10) | Trung bình | Kết quả PASS cũ do evaluator `-1` (kể cả PASS bằng tay sai) không bị chấm lại và vẫn được tính cho qualification L5 | Chủ dự án quyết định | Theo dõi |
| [GAP-L02-11](#gap-l02-11) | Thấp | Engine chỉ mô phỏng một vật; `final_gripper_state` của tay không dùng luôn là `open` | Lợi | Theo dõi |
| [GAP-L02-04](#gap-l02-04) | Thấp | Engine lỗi thì experiment kẹt ở `pending`, không có trạng thái `failed` | Lợi | Đề xuất |
| [GAP-L02-05](#gap-l02-05) | Thấp | Toạ độ vật không nguyên bị thay âm thầm bằng mặc định; chỉ dùng vật đầu tiên | Lợi | Đề xuất |
| [GAP-L02-06](#gap-l02-06) | Thấp | `home` khi đang cầm vật không di chuyển vật theo | Lợi | Đề xuất |
| [GAP-L02-07](#gap-l02-07) | Thấp | Nội dung L4 yêu cầu kết thúc bằng `home` nhưng rule không kiểm tra | Nhóm nội dung | Đề xuất |
| [GAP-L03-05](#gap-l03-05) | Thấp | Đổi bài tiên quyết sau khi bắt đầu attempt làm hỏng lần nộp PASS | Đức | Đề xuất |
| [GAP-L03-03](#gap-l03-03) | Thấp (tiềm ẩn) | Trạng thái `reviewed` đã khai báo nhưng mọi truy vấn qualification chỉ nhận `submitted` | Đức | Theo dõi |
| [GAP-L01-03](#gap-l01-03) | Thấp | `PATCH /me/programs/:id` trả về mảng, không chạy trong transaction | Lợi | Đề xuất |
| [GAP-L01-04](#gap-l01-04) | Thấp | Danh sách lệnh/khối được khai báo lặp ở 5 nơi | Lợi | Đề xuất |
| [GAP-L02-08](#gap-l02-08) | Thấp | `experiment.service.ts` viết dồn một dòng, khó review | Lợi | Đề xuất |
| [GAP-T-01](#gap-t-01) | Thấp | `npm test` trên máy không có DB báo 9 suite FAIL (không phải lỗi logic) | Đức | Đề xuất |
| [GAP-L03-06](#gap-l03-06) | Quy trình | Chưa có E2E trên trình duyệt với Supabase Auth thật, chưa có video | Lợi | Cần làm |

---

## Cao

### GAP-L03-01
**Không có API giao template lập trình xuống lớp.**
- Course Builder lưu template `constraints.kind = "symbolic_program"` + `allowed_blocks` (`PUT /author/activities/:id/programming-assignment`).
- Nhưng chỉ có 2 đường tạo `learning_classroom_assignments`:
  `createQuizDelivery` (chỉ nhận `knowledge_check`) và `createAssignment`. Hàm sau **luôn tạo assignment mới với `constraints = {}`, không có `allowed_blocks`**,
  nên học sinh nhận toolbox đầy đủ, gồm cả khối server không hỗ trợ (`repeat`, `if`, `move_joint`…).
- Course 1 chạy được chỉ vì `src/scripts/course1-demo-delivery.ts` dùng `prisma.learning_classroom_assignments.upsert` trực tiếp.
- **Bằng chứng:** `grep "INSERT INTO public.learning_classroom_assignments"` chỉ ra 2 chỗ, `learning.service.ts:499` và `:537`.
- **Đề xuất:** thêm endpoint giao template lập trình, tương tự `createQuizDelivery`, nhận `canonicalAssignmentId` có `kind = symbolic_program`
  và tái sử dụng chính assignment đó (không copy). Đổi API Education Core nên cần Đức duyệt contract.

### GAP-L03-02
**Không có API/UI soạn challenge và rule chấm.**
- `learning_challenges`, `learning_challenge_objects`, `learning_challenge_conditions` chỉ được tạo trong `seed-course1.ts` và `seed-demo-delivery.ts`.
- Template từ Course Builder không có `challenge_id`, nên `POST /me/experiments/:id/evaluate-symbolic` trả **400 "The experiment assignment has no challenge."**.
  Học sinh vẫn nộp được, nhưng bài **không bao giờ hoàn thành tự động** (không có PASS).
- **Đề xuất:** (a) cho Course Builder chọn một challenge đã `published` khi soạn programming assignment, tối thiểu là vậy;
  (b) về sau làm editor rule dùng chính `SymbolicRuleCompilerService` để validate (compiler đã từ chối rule sai, rất phù hợp làm validator).
  Khi trình bày cần nói rõ: **rule của Course 1 đang được seed**.

### GAP-L03-04
**Bàn giao L4 → L5 bị gãy ở runtime** (thuộc Đức, Lợi chỉ ghi nhận).
- Rule `ordered_actions` của L4 bắt buộc `preview.move_xyz`, trong khi `services/robot-runtime/src/runtime.py` `ALLOWED_STEPS = {arm.select, home, gripper.open, gripper.close, wait}`
  và adapter CHECKIK (`wf03_command_adapter.py`) cũng từ chối. Chưa có phép đổi khung `learning_preview_v1` (mm trên bàn 600×400) sang toạ độ robot.
- **Hệ quả:** bản qualified của L4 sẽ bị runtime trả `program_step_not_allowed`.

### GAP-L03-07
**Production cần migration J (D03 Stage 2).** Theo `docs/operations/d03-stage2-release-readiness.md`, khi chưa release J thì
`POST /me/attempts/:id/submission` và `POST /me/attempts/:id/experiments` trả 503 (do `SchemaCompatibilityService.requireStage2`). Đức đang xử lý.

---

## Trung bình

### GAP-L02-01
**`versionNumber` luôn bằng 1 sau khi chấm.** — **Đã sửa (PR #147)**
- `symbolic-evaluation.service.ts` dùng `(prepared as any).versionNumber ?? 1`, trong khi `SymbolicEvaluationPreparationService` không hề truy vấn số version.
  Kết quả là response của `POST /evaluate-symbolic` **và `learning_assignment_attempts.result_snapshot.evidence.versionNumber` (lưu DB)** luôn = 1.
  Đường `GET /me/symbolic-evaluations/:id` thì đúng, vì nó tự JOIN `version_number`.
- **Sửa:** preparation SELECT `pv.version_number` và trả về `versionNumber`; evaluation dùng giá trị có kiểu rõ ràng. +2 test hồi quy.
- **Lưu ý dữ liệu cũ:** các `result_snapshot` đã ghi trước khi sửa vẫn mang `versionNumber: 1`. Không cần migration vì nguồn sự thật là `learning_program_versions`.

### GAP-L01-01
**Toạ độ thập phân làm hỏng autosave.** — **Đã sửa (PR #147)**
- Ô X/Y/Z của khối `robot_move_to` không có `precision`/`min`/`max`. Validator ở web chỉ kiểm tra phạm vi, **không kiểm tra số nguyên**,
  trong khi server bắt buộc số nguyên. Nhập `240.5` thì `PATCH` tự động lưu bị 400 **cả request**, nên `workspaceJson` cũng không được lưu.
- **Sửa:** `precision: 1` + min/max theo khung (x 0–600, y 0–400, z 10–300). `toCanonicalNestRobotProgram` từ chối toạ độ lẻ và báo lỗi
  gắn đúng khối, nên autosave vẫn lưu workspace. +1 test.

### GAP-L02-02
> **Đã sửa trong PR #147.** `object_grasped` yêu cầu lần gắp thành công do đúng tay `arm` thực hiện (`OBJECT_GRASPED_BY_OTHER_ARM`); `object_lifted` đối chiếu `minZ` với độ cao dụng cụ lớn nhất khi tay đang giữ vật (`LIFT_HEIGHT_INSUFFICIENT`); `objectId` phải là vật engine thực sự mô phỏng (`OBJECT_NOT_FOUND`). `SYMBOLIC_EVALUATOR_VERSION` = `vista-symbolic-evaluator-2`. Kết quả chấm cũ **không** bị chấm lại (xem GAP-L02-10). Test: `symbolic-rule-evaluator.service.spec.ts` (32) và `programming-evaluation-regression.db.spec.ts`.
**Evaluator không áp dụng tham số `arm`, `minZ`, `objectId` của rule `object_grasped` / `object_lifted` / `object_released`.**
- Các giá trị này chỉ được in ra trong `expected`; kết quả đạt chỉ dựa vào `manipulation.wasGrasped/wasLifted/wasReleased`.
- **Tái hiện** (script chạy trên bản build `dist/`, log trong evidence):
  - Làm L3 bằng **tay phải** (rule `object_grasped {arm:"left"}`, `final_gripper_state {arm:"left", open}`) → **verdict passed**.
  - Rule `object_lifted {minZ:200}`, vật chỉ nâng tới z=100 → **passed**.
- **Đề xuất:** áp dụng tham số (`graspedBy === arm`, max z của vật ≥ minZ, đúng `objectId`). Đây là **thay đổi ngữ nghĩa chấm**,
  nên phải tăng `SYMBOLIC_EVALUATOR_VERSION` lên `vista-symbolic-evaluator-2`. Fingerprint sẽ đổi, evidence cũ giữ nguyên. Cần Đức duyệt.

### GAP-L02-03
> **Đã sửa trong PR #147.** Hình học vùng lấy từ `bounds` của rule, nếu không có thì từ vùng `zoneId` trong `finalState.targetZones` của output; vùng không tồn tại FAIL `TARGET_ZONE_UNKNOWN`. Output lịch sử không có `targetZones` vẫn chấm được vùng `A`.
**`object_in_target_zone` chấm theo vùng hardcode.**
- Khi rule có `zoneId` mà không có `bounds`, evaluator dùng `{x:60, y:280, w:120, h:90}` (vùng A mặc định) và **bỏ qua** `finalState.targetZones`
  cùng `manipulation.placedInZoneId` mà engine đã tính từ challenge.
- **Tái hiện:** challenge có vùng B ở `x 400–520`, thả vật **trong** vùng B → `OBJECT_RELEASED_OUTSIDE_TARGET`, **verdict failed**.
- Course 1 **không bị ảnh hưởng** vì vùng A của seed trùng giá trị mặc định. Sẽ sai với bất kỳ challenge mới nào.
- **Đề xuất:** tra `zoneId` trong `output.finalState.targetZones` trước, rồi mới dùng mặc định. Gộp chung lần tăng evaluator version với GAP-L02-02.

### GAP-L02-09
> **Đã sửa trong PR #147.** `SymbolicEvaluationService` chỉ gọi `projectSymbolicPass` khi `constraints.kind = symbolic_program` (cùng quy tắc với `submit()`). Chấm PASS sau khi nộp bài giáo viên tự tạo nay ghi evidence, đưa attempt sang `evaluated` và không hoàn thành lesson; không đổi bài nộp/điểm. Đã tái hiện trên PostgreSQL thật trước và sau khi sửa; UI vốn đã khoá Run sau khi nộp nên lỗi chỉ gặp khi gọi API trực tiếp.
**Chấm sau khi nộp làm hỏng bài giáo viên tự tạo.**
- Commit `0c818bb` (develop) đã sửa `ProgrammingService.submit()`: chỉ chiếu PASS sang tiến độ khi bài có `constraints.kind = "symbolic_program"`.
- Nhưng nhánh "submission đã nộp" trong `SymbolicEvaluationService.evaluateOwnExperiment` **vẫn luôn gọi** `projectSymbolicPass`. Hàm đó chỉ nhận bài có
  `la.constraints->>'kind'='symbolic_program'` (`progression.service.ts`), nên với bài giáo viên tự tạo sẽ ném 409
  `Symbolic PASS provenance could not be verified for progression.`, và rollback cả evidence lẫn việc chuyển attempt sang `evaluated`.
- **Kịch bản:** bài giáo viên tạo có challenge → học sinh nộp một version chưa chạy thử (attempt `submitted`) → chạy thử đúng version đó → PASS → **409**.
  Attempt kẹt ở `submitted`.
- **Đề xuất:** áp dụng đúng mẫu của `0c818bb`, chỉ gọi `projectSymbolicPass` khi bài là `symbolic_program`, và thêm test hồi quy. Không đổi ngữ nghĩa chấm, nên không cần tăng evaluator version.

---

## Thấp

### GAP-L01-02
`validateRobotProgram` không kiểm tra `gripper.*` có `arm.select` đứng trước, hay `home` có `arm`. Gọi API trực tiếp vẫn tạo được version, nhưng khi chạy thử
engine trả 400 `gripper.close requires a preceding arm.select.` (đã tái hiện). UI không mắc lỗi này vì `toCanonicalNest` đã chặn.
**Đề xuất:** thêm kiểm tra ngữ cảnh tay ở server, dùng đúng quy tắc của engine.

### GAP-L02-10
**Evidence lịch sử không bị chấm lại sau khi tăng evaluator version.**
- Sau khi tăng lên `vista-symbolic-evaluator-2`, các dòng `learning_symbolic_evaluations` cũ giữ nguyên (`evaluator_version = vista-symbolic-evaluator-1`), được đọc lại đúng, và **không** có migration hay chấm lại hàng loạt (đã có test trên PostgreSQL thật).
- Hệ quả: một học sinh từng PASS L3/L4 bằng tay phải vẫn giữ PASS đó, kể cả qualification L4 → L5 (`resolveQualifiedL4ProgramVersion`).
- Chấm lại một experiment cũ (học sinh gọi lại evaluate) tạo thêm dòng `-2` và cập nhật `result_snapshot` của attempt theo kết quả mới.
- **Cần chủ dự án quyết định:** có cần rà soát/thu hồi các PASS cũ hay không. Chưa thực hiện thao tác dữ liệu nào.

### GAP-L02-11
**Giới hạn của engine/evaluator (không đổi trong đợt này).** Engine chỉ mô phỏng vật đầu tiên của challenge, nên rule trỏ tới vật thứ hai luôn FAIL `OBJECT_NOT_FOUND`.
`final_gripper_state` chỉ so sánh kẹp cuối của tay được nêu; tay không dùng mặc định là `open`, nên rule này một mình không chứng minh đúng tay.

### GAP-L02-04
Engine ném lỗi thì `runSchematic` không đổi trạng thái, experiment **ở mãi `pending`**, và mỗi lần chạy lại đều nhận 400 giống nhau.
**Đề xuất:** ghi `status='failed'` + sự kiện `schematic_rejected` kèm lý do, để giáo viên thấy được lần chạy lỗi.

### GAP-L02-05
`runSchematic`: toạ độ vật không phải số nguyên (ví dụ `120.5`) bị **thay âm thầm** bằng `(120,150,0)`. Thuộc tính vùng không phải số thì dùng mặc định.
Engine chỉ dùng **vật đầu tiên**. **Đề xuất:** từ chối cấu hình challenge sai thay vì dùng mặc định, và ghi rõ giới hạn "1 vật/challenge".

### GAP-L02-06
`home` đưa tay về `(0,0,0)` nhưng vật đang cầm **không đi theo**; nếu sau đó mở kẹp thì vật được thả ở vị trí cũ. Ngữ nghĩa không nhất quán với `preview.move_xyz`.

### GAP-L02-07
Nội dung bài L4 (seed) ghi *"Approach → Grasp → Lift → Transfer → Release → Home"* và *"End the sequence with a home command"*, nhưng bộ rule không có
`home_action_present`. Hoặc sửa nội dung, hoặc thêm rule (thêm rule sẽ đổi `ruleSetHash` và kết quả chấm).

### GAP-L03-05
Trong `submit()`, với bài giáo trình (`kind = symbolic_program`), `projectSymbolicPass` gọi `assertPrerequisites` **bên trong transaction nộp bài**.
Nếu admin thêm bài tiên quyết sau khi học sinh đã bắt đầu attempt, lần nộp PASS ném 409 `PREREQUISITE_NOT_COMPLETED` và **rollback toàn bộ bài nộp**.
Tình huống hiếm, nhưng học sinh sẽ không nộp được. Cùng nguyên nhân: khi chấm sau khi nộp một bài giáo trình, xung đột tiên quyết cũng rollback evidence (đã có test mô tả hành vi hiện tại). (Commit `0c818bb` trên `develop` đã sửa trường hợp tương tự cho bài giáo viên tự tạo, bằng cách bỏ qua
bước chiếu tiến độ; riêng trường hợp tiên quyết của bài giáo trình thì chưa.)

### GAP-L03-03
Trigger của migration J cho phép `submitted → reviewed`, nhưng hiện chưa code nào đặt `reviewed`. Trong khi đó `resolveQualifiedL4ProgramVersion`, `projectSymbolicPass`
và `PhysicalExecutionService.resolveScope` chỉ nhận `status='submitted'`. Nếu sau này chấm bài chuyển sang `reviewed` thì học sinh **mất qualification L5**.

### GAP-L01-03
`PATCH /me/programs/:id` trả về `ProgramRow[]` (mảng, kết quả `$queryRaw`) trong khi `POST` trả về object. Hàm này không chạy trong transaction và không khoá attempt.
Test hiện có (`programming.service.spec.ts`) đang khẳng định dạng mảng (`updated[0]`), nên sửa sẽ thay đổi contract. Web hiện bỏ qua giá trị trả về.

### GAP-L01-04
Danh sách lệnh/khối được khai báo ở 5 nơi: `SYMBOLIC_ACTIONS` (compiler), tập `allowed`/`supported`/`mapping` trong `programming.service.ts`,
`CURRICULUM_BLOCK_REGISTRY` (web), và `ALLOWED_STEPS` (runtime). **Đề xuất:** dùng `SYMBOLIC_ACTIONS` cho mọi chỗ ở API, và đưa bảng ánh xạ khối vào `packages/contracts`.

### GAP-L02-08
`experiment.service.ts` viết dồn trên các dòng rất dài (> 400 ký tự), khó review và khó diff. **Đề xuất:** chỉ format lại (Prettier), không đổi logic, làm trong một PR riêng.

### GAP-T-01
Các suite `*.db.spec.ts` gọi `new PrismaClient(...)` ngay trong `describe`, nên khi máy không có `DATABASE_URL` thì Jest báo
"Test suite failed to run" cho 9 suite, kể cả khi suite đó đáng lẽ được skip. Đặt một URL giả hoặc chạy với DB test thì không còn lỗi.
**Đề xuất:** tạo client trong `beforeAll`.

### GAP-L03-06
Đợt này mới kiểm chứng ở mức service và DB thật (Jest + PostgreSQL 17), **chưa** có E2E trên trình duyệt với Supabase Auth thật, và **chưa** quay video.
Kịch bản demo nằm trong [README §4](README.md#4-kịch-bản-demo-quay-video).
