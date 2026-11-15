# Bằng chứng kiểm thử — fix sprint PR #147 (15/11/2026)

> **Không có lần nào kết nối Supabase/Production/AWS.** DB test là PostgreSQL 17 (`postgres:17`) dùng xong bỏ, chỉ nghe trên loopback `127.0.0.1:55432`,
> được dựng bằng `scripts/bootstrap_dev_database.py --confirm-local-bootstrap` (fingerprint schema khớp giá trị ghim `ef3d41b7…`). Không chạy migration nào ngoài bản bootstrap đó.
> **Không** chạy robot thật, runtime hay MQTT. **Không** có E2E trình duyệt, **không** có video demo.

## 1. Kết quả tổng hợp (develop @ `a8bcae5` + PR #147)

| Hạng mục | Lệnh | Kết quả | Baseline `develop` |
| --- | --- | --- | --- |
| API đầy đủ (unit + PostgreSQL thật) | `npx jest --runInBand` | **1001 PASS**, 1 skip (S3), 24 FAIL — **toàn bộ** nằm ở `iot-feedback.repository.int.spec.ts` (91 suite PASS, 1 skip, 1 FAIL) | 935 PASS, cùng 24 FAIL ở suite IoT (cần DB IoT riêng: `users_signup_method_check`) |
| API type-check | `npx tsc --noEmit` | 0 lỗi | 0 lỗi |
| Web đầy đủ | `npx vitest run` | **572/572 PASS** (81 file) | 552/552 |
| Web lint | `npx eslint . --ext .js,.jsx,.ts,.tsx` | 0 error (194 warning có sẵn) | — |
| Web build | `npx vite build` | PASS | PASS |

Lưu ý độ ổn định: ở lần chạy web đầy đủ **đầu tiên** (cache lạnh) có 1 test lệch thời gian ở `CourseContentEditor.spec.tsx` (một test khác nhau ở các lần chạy lạnh; suite này
tác giả đã ghi nhận là nhạy khi chạy song song). Chạy lại: 572/572 PASS (2 lần liên tiếp, rồi thêm 1 lần cuối). Không liên quan tới code của PR.

## 2. Test mới (đếm theo file)

| File | Số test | Loại |
| --- | --- | --- |
| `symbolic-rules/symbolic-rule-evaluator.service.spec.ts` | 32 | Engine + compiler + evaluator thật, không DB |
| `symbolic-rules/symbolic-evaluation.service.spec.ts` | 14 (+5) | Mock DB: chấm sau khi nộp cho bài không phải giáo trình |
| `symbolic-rules/symbolic-evaluation-preparation.service.spec.ts` | 12 (+1) | `assignmentKind` được truy vấn và trả về |
| `programming-evaluation-regression.db.spec.ts` | 28 | PostgreSQL thật |
| `web/.../blocklyConfig.spec.ts` | 7 | Khối Blockly thật (workspace headless) |
| `web/.../toCanonicalNest.spec.ts` | 18 (+13) | Toạ độ nguyên / lẻ / ngoài khung |

## 3. Kiểm tra "test có thật sự bắt lỗi" (hoàn nguyên từng bản sửa trong bản sao cô lập)

| Hoàn nguyên | Kết quả |
| --- | --- |
| Evaluator về bản cũ → chạy `symbolic-rule-evaluator.service.spec.ts` | **18/32 FAIL** |
| Evaluator về bản cũ → chạy `programming-evaluation-regression.db.spec.ts` | 1 FAIL (luồng đầy đủ: tay phải phải FAIL rule `arm=left`) |
| `symbolic-evaluation.service.ts` về bản cũ (bỏ guard 409) → regression DB | **4 FAIL** (Submit→Evaluate, chấm trùng, quyền, điểm) |
| Trước khi sửa (develop) | `versionNumber`: response 1, evidence 1, `result_snapshot` 1, GET đọc lại 3; Submit→Evaluate bài giáo viên: `ConflictException: Symbolic PASS provenance could not be verified for progression.`, 0 evidence, attempt kẹt `submitted` |
| Sau khi sửa | `versionNumber` 3/3/3/3; Submit→Evaluate: có evidence, attempt `evaluated`, không hoàn thành lesson |

## 4. Tái hiện evaluator (thật: engine + compiler + evaluator)

| Ca | Trước (`-1`) | Sau (`-2`) |
| --- | --- | --- |
| Chương trình tay phải vs rule `object_grasped {arm:left}` | PASS | **FAIL** `OBJECT_GRASPED_BY_OTHER_ARM` (tay trái PASS) |
| Nâng tới z=100 vs `minZ=200` | PASS | **FAIL** `LIFT_HEIGHT_INSUFFICIENT` (`maxCarryZ: 100`); `minZ=100` PASS |
| `objectId: cube-blue` không tồn tại | PASS | **FAIL** `OBJECT_NOT_FOUND` |
| Thả trong vùng B với `zoneId: B` (không `bounds`) | FAIL `OBJECT_RELEASED_OUTSIDE_TARGET` | **PASS**, `placedInZoneId: B` |
| Thả trong vùng A với `zoneId: B` | (FAIL do hardcode A) | FAIL `OBJECT_RELEASED_OUTSIDE_TARGET` |
| `zoneId: C` không tồn tại | dùng vùng A hardcode | FAIL `TARGET_ZONE_UNKNOWN` |
| Bộ rule L3/L4 của Course 1 với lời giải tay trái đúng | PASS | PASS (không đổi) |

## 5. Phần **chưa** được kiểm chứng

- E2E trên trình duyệt với Supabase Auth thật; video demo.
- Robot SO-101 thật, Robot Runtime, Digital Twin, MQTT: không chạy; `ALLOWED_STEPS` của runtime chỉ được xác minh bằng đọc code.
- Production và mọi môi trường dùng chung: không truy cập.
- Chấm lại hàng loạt dữ liệu lịch sử: **không thực hiện** (GAP-L02-10 cần quyết định chính sách).
- Tải/đồng thời của việc đánh số version và nộp bài.
