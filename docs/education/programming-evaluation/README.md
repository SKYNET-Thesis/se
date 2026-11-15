# Programming Assignment, Schematic Experiment & Evaluation — Hồ sơ domain (L01–L03)

> **Domain owner:** Phạm Viết Lợi · **Reviewer:** Lê Nguyễn Quang Đức · **Ngày:** 15/11/2026 · **Mã nguồn:** `develop` @ `a8bcae5` (audit trên `main` @ `b8ac12f`, kiểm chứng lại trên `develop`)
>
> Thư mục này là sản phẩm bàn giao cho 3 task L01, L02, L03 trong sheet phân công: tài liệu flow, API contract, ánh xạ dữ liệu,
> danh sách gap và bằng chứng test. Viết để (1) Đức review, (2) cả nhóm dùng khi trình bày trước hội đồng.

## 1. Nội dung

| Task | Tài liệu | Output yêu cầu trong sheet | Trạng thái |
| --- | --- | --- | --- |
| **L01** Blockly Programming & Validation | [L01-blockly-programming-validation.md](L01-blockly-programming-validation.md) | Flow diagram + API/schema mapping + test/demo | Flow ✔ · API/schema ✔ · test ✔ · 1 lỗi đã sửa · **video: chưa** |
| **L02** Schematic Experiment & Symbolic Evaluation | [L02-schematic-experiment-symbolic-evaluation.md](L02-schematic-experiment-symbolic-evaluation.md) | Sequence/activity flow + evaluation test logs + demo | Sequence ✔ · test log ✔ · 1 lỗi đã sửa · 3 lỗi tái hiện được, chờ quyết định · **video: chưa** |
| **L03** Programming Assignment & Assessment Flow | [L03-programming-assignment-flow.md](L03-programming-assignment-flow.md) | Flow E2E + API contract + gap list + test/demo | Flow + state machine ✔ · API contract ✔ · gap list ✔ · test ✔ · **E2E trình duyệt + video: chưa** |
| Chung | [GAP-LIST.md](GAP-LIST.md) · [evidence/2026-11-15-test-evidence.md](evidence/2026-11-15-test-evidence.md) | | |

Ranh giới: **không** đụng MQTT, IoT, MuJoCo, Digital Twin, Physical Execution, grading hay Quiz Engine (của Đức). Mọi điểm chạm tới các phần đó chỉ được ghi nhận trong gap list.

## 2. Kết quả chính

- **Test** (trên `develop` @ `a8bcae5` + PR này): API 935/960 PASS, 0 FAIL (25 skip có chủ đích), gồm các suite chạy trên PostgreSQL thật. Web 552/552 PASS.
  Riêng domain L01–L03 có **195 test API + 82 test web**, tất cả PASS. Build API và web PASS; lint web 0 error.
- **2 lỗi đã sửa** (có test hồi quy): `versionNumber` sai sau khi chấm (GAP-L02-01), và toạ độ thập phân làm mất nháp (GAP-L01-01).
- **1 lỗi mới phát hiện khi đối chiếu với `develop`:** bài giáo viên tự tạo, nộp trước rồi chấm PASS thì bị 409 + rollback (GAP-L02-09). Cách sửa theo đúng mẫu `0c818bb` của Đức.
- **4 vấn đề mức Cao cần nhóm quyết định:**
  - Chưa có API giao bài lập trình xuống lớp (GAP-L03-01).
  - Chưa có API/UI soạn rule chấm, nên Course 1 phụ thuộc vào seed (GAP-L03-02).
  - Chương trình L4 không chạy được trên Robot Runtime (GAP-L03-04, thuộc Đức).
  - Production cần migration J (GAP-L03-07, thuộc Đức).
- **2 lỗi chấm điểm đã tái hiện được:** L3/L4 PASS được bằng tay phải dù bài yêu cầu tay trái, và vùng đích bị hardcode. Cách sửa cần tăng evaluator version (GAP-L02-02, -03), nên chờ Đức duyệt.

## 3. Thay đổi code trong đợt này

Tất cả nằm trong nhánh `loi/l01-l03-programming-evaluation` (PR vào `develop`) để Đức review. Không thay đổi DB schema, API contract, runtime hay grading.

| File | Thay đổi |
| --- | --- |
| `services/education-api/src/modules/learning/symbolic-rules/symbolic-evaluation-preparation.service.ts` | SELECT `pv.version_number`; trả về `versionNumber` |
| `services/education-api/src/modules/learning/symbolic-rules/symbolic-evaluation.service.ts` | Dùng `prepared.versionNumber` thay cho `(prepared as any).versionNumber ?? 1` |
| `services/education-api/src/modules/learning/symbolic-rules/symbolic-evaluation-preparation.service.spec.ts` | +1 test: version number được truy vấn và trả về |
| `services/education-api/src/modules/learning/symbolic-rules/symbolic-evaluation.service.spec.ts` | +1 test: version number đúng trong response và trong `result_snapshot` được lưu |
| `web/robot-edu/src/components/studio/blocklyConfig.ts` | X/Y/Z của `robot_move_to`: `precision: 1` + min/max theo khung `learning_preview_v1` |
| `web/robot-edu/src/utils/robotProgram/toCanonicalNest.ts` | Từ chối toạ độ không nguyên, báo lỗi gắn với khối |
| `web/robot-edu/src/utils/robotProgram/toCanonicalNest.spec.ts` | +1 test |
| `docs/education/programming-evaluation/**` | Tài liệu này |

PR được tách thành 3 commit để review riêng từng phần:
1. `fix(education-api): report and persist the evaluated ProgramVersion number`
2. `fix(web): keep learning-preview coordinates whole millimetres in Blockly`
3. `docs(education): L01–L03 programming and evaluation domain audit`

## 4. Kịch bản demo (quay video)

Cần chuẩn bị: một **project Supabase dev** (hỏi Đức; không dùng production), DB test như trong [evidence §1](evidence/2026-11-15-test-evidence.md#1-môi-trường),
và các biến `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `VISTA_DEMO_*_PASSWORD`.
Seed theo thứ tự: `npm run seed:demo-identities` → `npm run seed:course1` → `npm run seed:course1-demo-delivery`.

| # | Thao tác (tài khoản học sinh demo) | Cần thấy trên màn hình | Task |
| --- | --- | --- | --- |
| 1 | My Learning → Course 1 → C1-L3 → bắt đầu làm | Toolbox chỉ có các khối của L3 | L01 |
| 2 | Kéo khối, nhập X = `240.5` | Ô số tự làm tròn; không có lỗi lưu (sau bản sửa) | L01 |
| 3 | Save version | "Immutable ProgramVersion 1 saved" | L01 |
| 4 | Run simulation với chương trình **sai** (đóng kẹp xa vật) | FAIL, mã `GRASP_NOT_ESTABLISHED`, lời nhắc tiếng Anh | L02 |
| 5 | Sửa → Save version (v2) → Run | PASS, hiện đúng **Version 2** (sau bản sửa), có evidence | L02 |
| 6 | Reload trang | Kết quả và lịch sử vẫn còn | L02 |
| 7 | Submit assignment → xác nhận | Attempt bị khoá; bài L4 được mở khoá | L03 |
| 8 | Đăng nhập giáo viên → lớp → bài nộp | Thấy version, evaluation, ghi chú; chấm → release | L03 |
| 9 | Học sinh xem điểm | Chỉ thấy điểm sau khi giáo viên release | L03 |
| 10 | Thử gọi API của học sinh khác (Swagger `/docs`) | 404 | L03 |

## 5. Ý chính khi trình bày trước hội đồng

1. **Server-authoritative:** trình duyệt chỉ gửi chương trình; rule, mô phỏng và verdict đều nằm ở server. Có test chứng minh verdict giả bị bỏ qua.
2. **Bất biến và truy vết được:** ProgramVersion không sửa được; mỗi lần chấm lưu hash của chương trình, output và bộ rule; fingerprint duy nhất nên chấm lại không tạo trùng.
3. **Run ≠ Submit:** chạy thử không khoá bài và không tính điểm; nộp bài là hành động cuối, mỗi attempt chỉ có một bài nộp (ràng buộc DB).
4. **Mô phỏng là symbolic, không phải vật lý:** nói rõ giới hạn (không va chạm, không IK, một vật/challenge).
5. **Trung thực về gap:** Course 1 dựa vào seed cho rule và việc giao bài; chưa chạy robot thật; chưa có E2E trình duyệt.

## 6. Việc cần trao đổi với Đức

- [ ] Review và merge PR (2 bản sửa ở §3 + tài liệu).
- [ ] GAP-L02-09: đồng ý để Lợi sửa theo mẫu `0c818bb` trong một PR tiếp theo?
- [ ] Quyết định GAP-L02-02/-03: tăng evaluator lên `vista-symbolic-evaluator-2` để áp dụng tham số `arm`/`minZ`/`zoneId`?
- [ ] GAP-L03-01/-02: ai làm API giao template lập trình và chọn challenge trong Course Builder; có cần cho lần bảo vệ này không?
- [ ] GAP-L03-04: kế hoạch cho `preview.move_xyz` trên runtime (thuộc Đức).
- [ ] Cấp project Supabase dev để quay video E2E (GAP-L03-06).
- [ ] Cập nhật hạn mới cho L01–L03 trong sheet (hạn cũ là 14/11).
