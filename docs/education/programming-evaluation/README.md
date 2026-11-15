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

- **Test** (trên `develop` @ `a8bcae5` + PR này, PostgreSQL 17 dùng xong bỏ): API **1001 PASS**, 1 skip (S3), và **24 FAIL đã biết** của `iot-feedback.repository.int.spec.ts` (suite cần DB IoT riêng; fail giống hệt trên `develop` khi không có PR).
  Web **572/572 PASS** (có 1 test lệch thời gian ở `CourseContentEditor.spec.tsx` khi chạy lần đầu lạnh; chạy lại 2 lần đều đạt). `tsc` API 0 lỗi, `eslint` web 0 error, `vite build` PASS.
  Số liệu chi tiết và lệnh: [evidence/2026-11-15-fix-sprint-evidence.md](evidence/2026-11-15-fix-sprint-evidence.md).
- **Đã sửa (có test hồi quy, chạy trên PostgreSQL thật):**
  - `versionNumber` sai sau khi chấm (GAP-L02-01); toạ độ thập phân/ngoài khung làm mất nháp (GAP-L01-01).
  - Bài giáo viên tự tạo: nộp trước rồi chấm PASS bị 409 + rollback (GAP-L02-09).
  - Evaluator bỏ qua `arm`, `minZ`, `objectId`, `zoneId` (GAP-L02-02, -03); evaluator lên `vista-symbolic-evaluator-2`, evidence cũ giữ nguyên.
- **Vấn đề mức Cao còn mở, cần nhóm quyết định:**
  - Chưa có API giao bài lập trình xuống lớp (GAP-L03-01).
  - Chưa có API/UI soạn rule chấm, nên Course 1 phụ thuộc vào seed (GAP-L03-02).
  - Chương trình L4 không chạy được trên Robot Runtime (GAP-L03-04, thuộc Đức).
  - Production cần migration J (GAP-L03-07, thuộc Đức).
- **Còn mở khác:** PASS lịch sử của evaluator `-1` không bị chấm lại (GAP-L02-10, cần quyết định chính sách); **chưa có E2E trình duyệt và chưa quay video demo** (GAP-L03-06).

## 3. Thay đổi code trong đợt này

Tất cả nằm trong nhánh `loi/l01-l03-programming-evaluation` (PR vào `develop`) để Đức review. Không thay đổi DB schema, migration, API contract, runtime/MQTT hay dữ liệu chấm đã lưu. Hành vi chấm của evaluator thay đổi (đã tăng version, xem L02 §5).

| File | Thay đổi |
| --- | --- |
| `symbolic-rules/symbolic-evaluation-preparation.service.ts` | SELECT `pv.version_number` và `la.constraints->>'kind'`; trả về `versionNumber`, `assignmentKind`; evaluator version `-2` |
| `symbolic-rules/symbolic-evaluation.service.ts` | Dùng `prepared.versionNumber`; chỉ chiếu PASS sang tiến độ cho bài `symbolic_program` |
| `symbolic-rules/symbolic-rule-evaluator.service.ts` | Áp dụng `arm`, `minZ`, `objectId`, `zoneId` cho 4 rule đối tượng |
| `symbolic-rules/*.spec.ts`, `c1-l2/l3/l4-*.spec.ts` | Test mới và bổ sung `assignmentKind` vào dữ liệu giả của bài giáo trình |
| `symbolic-rules/symbolic-rule-evaluator.service.spec.ts` (mới) | 32 test hành vi evaluator với engine/compiler/evaluator thật |
| `programming-evaluation-regression.db.spec.ts` (mới) | 28 test PostgreSQL thật: ProgramVersion, validation, chấm/nộp theo mọi thứ tự, quyền, điểm, rollback, evaluator lịch sử |
| `web/robot-edu/src/components/studio/blocklyConfig.ts` (+ `.spec.ts` mới) | X/Y/Z `robot_move_to`: số nguyên + giới hạn khung; test hành vi ô số |
| `web/robot-edu/src/utils/robotProgram/toCanonicalNest.ts` (+ spec) | Từ chối toạ độ không nguyên **và ngoài khung** |
| `docs/education/programming-evaluation/**` | Tài liệu này |

PR gồm các commit theo thứ tự: sửa `versionNumber`; sửa toạ độ Blockly; tài liệu audit; sửa 409 sau khi nộp; sửa evaluator + version; test hồi quy và cập nhật tài liệu.

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

- [ ] Review và merge PR #147 (không merge tự động).
- [x] GAP-L02-09 (409 sau khi nộp) và GAP-L02-02/-03 (evaluator `-2`): đã được chủ dự án giao sửa và đã sửa trong PR này.
- [ ] GAP-L02-10: có rà soát/thu hồi các PASS cũ của evaluator `-1` không (hiện không đụng tới dữ liệu cũ)?
- [ ] GAP-L03-01/-02: ai làm API giao template lập trình và chọn challenge trong Course Builder; có cần cho lần bảo vệ này không?
- [ ] GAP-L03-04: kế hoạch cho `preview.move_xyz` trên runtime (thuộc Đức).
- [ ] Cấp project Supabase dev để quay video E2E (GAP-L03-06).
- [ ] Cập nhật hạn mới cho L01–L03 trong sheet (hạn cũ là 14/11).

## 7. Cách chạy test

Không dùng Supabase hay production. DB test là PostgreSQL 17 dùng xong bỏ, chỉ nghe trên loopback; `db-test-support.ts` từ chối mọi đích khác.

```bash
# 1) DB dùng xong bỏ (thông tin đăng nhập giống CI, chỉ dùng cục bộ)
docker run -d --name vista-test-pg --rm -e POSTGRES_USER=vista_test -e POSTGRES_PASSWORD=ci-disposable-local-only \
  -e POSTGRES_DB=vista_test_course_builder -p 127.0.0.1:55432:5432 postgres:17
export PGPASSWORD=ci-disposable-local-only VISTA_DATABASE_PROJECT_REF=vista-course-builder-test
VISTA_DEV_DATABASE_URL=postgresql://vista_test:ci-disposable-local-only@127.0.0.1:55432/vista_test_course_builder \
  python scripts/bootstrap_dev_database.py --confirm-local-bootstrap      # cần psql 17 và DB rỗng

# 2) API (unit + PostgreSQL thật)
cd services/education-api
export RUN_POSTGRES_INTEGRATION=1 VISTA_DATABASE_PROJECT_REF=vista-course-builder-test \
  DATABASE_URL=postgresql://vista_test:ci-disposable-local-only@127.0.0.1:55432/vista_test_course_builder \
  VISTA_INTEGRATION_DATABASE_URL=$DATABASE_URL
npx jest --runInBand                                   # 24 test của iot-feedback.repository.int.spec.ts fail nếu không có DB IoT riêng (đã biết)
npx jest --runInBand src/modules/learning/programming-evaluation-regression.db.spec.ts
env -u DATABASE_URL -u RUN_POSTGRES_INTEGRATION npx jest src/modules/learning/symbolic-rules   # chỉ test không cần DB
npx tsc --noEmit

# 3) Web
cd ../../web/robot-edu && npx vitest run && npx eslint . --ext .ts,.tsx && npx vite build

# 4) Dọn dẹp
docker rm -f vista-test-pg
```

Không có E2E trình duyệt trong bộ này; xem kịch bản thủ công ở §4.
