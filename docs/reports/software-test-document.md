# Software Test Document (STD)
## Hệ thống teleoperation hai cánh tay SO-101

> Nội dung này đã được hợp nhất vào tài liệu canonical: [Tài liệu phần mềm tổng hợp SO-101](../progress/teleoperation-progress-and-test-plan.md). Giữ file này chỉ để tham chiếu lịch sử.

| Thuộc tính | Nội dung |
| --- | --- |
| Phiên bản | 1.0 — baseline test plan |
| Cập nhật | 15/09/2026 |
| Mục đích | Quy định phạm vi, test case, evidence và tiêu chí PASS/FAIL |

## 1. Mục tiêu kiểm thử

Xác minh rằng teleoperation từ leader web, Quest VR và phone được validate, map đúng arm, giới hạn an toàn và dừng an toàn khi có lỗi. Kiểm thử được chia thành static/unit, offline integration, hardware smoke và acceptance. Test pass ở fake/offline không thay thế hardware acceptance.

## 2. Phạm vi và trạng thái baseline

| Hạng mục | Code/test seam | Hardware E2E baseline |
| --- | --- | --- |
| Leader web single/dual arm | Có | Chưa có evidence trong bộ tài liệu này |
| Quest WebXR/local SO-101 | Có | Chưa có evidence trong bộ tài liệu này |
| VR LeKiwi dashboard | Fake follower test seam | Không hardware-ready |
| Phone protocol/mobile UI | Có; TypeScript + Node tests pass | Chưa có iPhone + arm evidence |
| iOS ARKit build | Workflow có | Chưa xác nhận artifact/sideload trên thiết bị |
| Mobile non-phone screens | UI mock | Không phải hardware test |
| CHECKIK dashboard | API/control-plane seam | Cần lifecycle/hardware evidence |

## 3. Test levels

| Level | Mục tiêu | Điều kiện PASS |
| --- | --- | --- |
| T1 Static/unit | Schema, kinematics, mapping, UI logic | Test/typecheck pass, không lỗi compile/import. |
| T2 Offline integration | Relay, WebSocket, fake robot, health, lifecycle | Không mở serial/hardware; expected status/action pass. |
| T3 Hardware smoke | Connect/calibrate/motion nhỏ/hold | Có người giám sát, E-stop vật lý, log/video. |
| T4 Acceptance | Luồng vận hành và lỗi lặp lại | Tất cả case bắt buộc pass, evidence đầy đủ. |

## 4. Test environment và an toàn

Trước test T3/T4:

1. Dọn vùng làm việc, đặt robot ở rest pose; một người đứng cạnh nguồn/E-stop vật lý.
2. Xác nhận left/right follower, calibration, port bằng `/dev/serial/by-id/` và device ID cụ thể.
3. Chạy fake/offline trước mỗi thay đổi mapping/safety; chỉ sau đó mới bật `--real` hoặc `--enable-motion`.
4. Test chuyển động rất nhỏ trước, tốc độ thấp; không thử task có nhiệt/lửa/vật sắc.
5. Ghi commit SHA, version LeRobot, IP/port, selected mode, người test và người quan sát.

Không chạy hardware khi robot không quan sát được, không xác định được port, không có E-stop vật lý hoặc motion lock chưa được kiểm tra.

## 5. Test cases

### 5.1 Kinematics và safety

| ID | Level | Bước | Expected result |
| --- | --- | --- | --- |
| KIN-01 | T1 | Chạy FK/IK regression trên reachable targets | `FK(IK(target))` trong sai số quy định. |
| KIN-02 | T1 | Gửi unreachable target | Không tạo joint action nguy hiểm. |
| KIN-03 | T1/T2 | Gửi NaN/Inf/out-of-bound input | Packet/target bị reject. |
| SAF-01 | T2 | Target ngoài workspace | Clamp/reject theo policy; action vẫn trong workspace. |
| SAF-02 | T2 | Target vượt joint/rate step | Không vượt joint limit/max step. |
| SAF-03 | T2/T3 | Nhả clutch | Arm hold, không tiếp tục theo input. |
| SAF-04 | T2/T3 | Mất tracking/WebSocket quá timeout | Authority revoked, hold/cleanup an toàn. |
| SAF-05 | T3 | E-stop trong motion nhỏ | Task dừng, motion lock/lifecycle đúng. |

### 5.2 Leader web dual-arm

| ID | Level | Bước | Expected result |
| --- | --- | --- | --- |
| LDR-01 | T2 | Gửi left/right packet hợp lệ vào offline bridge | IK trả result đúng active hand, không LeRobot action. |
| LDR-02 | T3 | Bật leader trái, dịch chuyển nhỏ | Chỉ left follower nhận action. |
| LDR-03 | T3 | Bật leader phải, dịch chuyển nhỏ | Chỉ right follower nhận action. |
| LDR-04 | T3/T4 | Điều khiển hai leader đồng thời | Không cross-command; cả hai stay within limits. |
| LDR-05 | T2 | Gửi duplicate/out-of-order sequence | Server reject, không action mới. |
| LDR-06 | T2/T3 | Ngắt client khi clutch | Hold, không replay backlog. |
| LDR-07 | T4 | 10 cycle Start→move→release→Stop | Không fault bất ngờ; log/lifecycle sạch. |

### 5.3 Quest VR/WebXR

| ID | Level | Bước | Expected result |
| --- | --- | --- | --- |
| VR-01 | T2 | Start fake relay, dùng fake headset/Quest | Relay listening; `/api/status` healthy. |
| VR-02 | T2/T3 | Engage clutch ở rest pose | First action không làm arm jump. |
| VR-03 | T3 | Dịch từng axis rất nhỏ | Hướng mapping đúng, bounded workspace. |
| VR-04 | T3 | Trigger/gripper test | Gripper đúng chiều/trong giới hạn. |
| VR-05 | T3 | STOP rồi thử input | STOP latch, không chuyển động. |
| VR-06 | T3 | Unlock theo thao tác thiết kế | Chỉ restore sau explicit action. |
| VR-07 | T3/T4 | Hai arm: left, right, simultaneous | Arm ownership/routing đúng. |
| VR-08 | T3 | Quest Wi-Fi/tab close khi active | Timeout/disconnect releases clutch/holds. |

### 5.4 Phone teleop/mobile

| ID | Level | Bước | Expected result |
| --- | --- | --- | --- |
| PH-01 | T1 | `npm run typecheck`, Node pose/gripper tests | Pass. |
| PH-02 | T2 | Send pose trước hello/sai protocol | Server reject, no robot action. |
| PH-03 | T2 | Hello rồi phone pose hợp lệ | `hello_ack`/status và packet route đúng arm. |
| PH-04 | T3 | Recenter, hold control, dịch nhỏ | No jump; Cartesian mapping đúng chiều. |
| PH-05 | T3 | Nhả hold/background app | Disable/hold xảy ra. |
| PH-06 | T3 | Slide gripper | Open/close đúng, không vượt limit. |
| PH-07 | T3 | Mất ARKit tracking | UI locked; server không motion mới. |
| PH-08 | T2 | Stale timestamp/duplicate sequence | Server reject. |
| PH-09 | T4 | iPhone ARKit X/Y/Z mapping | Video/log chứng minh ba trục đúng. |
| PH-10 | T1/T2 | Android fallback | Chỉ chứng nhận UI/protocol, không precision hardware. |

### 5.5 Dashboard/web

| ID | Level | Bước | Expected result |
| --- | --- | --- | --- |
| WEB-01 | T2 | Dashboard đọc `/api/status` | UI phản ánh snapshot/error đúng. |
| WEB-02 | T2/T3 | Assign port/calibrate task | UI không báo success nếu backend fail. |
| WEB-03 | T2 | Start offline VR | Operator URL + health; không serial/LeRobot. |
| WEB-04 | T3 | Real VR sau preflight/unlock | Chỉ authorized process chạy, log đủ mode/arm/port. |
| WEB-05 | T3 | Stop/E-stop/Unlock | UI/backend motion lock thống nhất. |
| WEB-06 | T3 | Reload dashboard khi task active | Không tạo task/process thứ hai. |
| WEB-07 | T2 | VR LeKiwi dashboard | Chỉ pass fake/offline contract; không ghi là hardware result. |

## 6. Regression commands

```bash
cd apps/mobile
npm run typecheck
node --test tests/pose-sender.test.cjs tests/gripper-slide.test.cjs
```

```bash
cd web/checkIk/VRTeleop/lekiwi-vr-teleop
PYTHONPATH=. <python-lerobot> -m pytest -q
```

Python command chỉ chạy sau khi môi trường có `pytest`, LeRobot và dependency package. Trong rà soát baseline, TypeScript và hai Node test pass; Python pytest chưa chạy được vì environment thiếu pytest và network cài dependency không khả dụng.

## 7. Evidence và báo cáo defect

Mỗi T3/T4 dùng cấu trúc:

```text
evidence/YYYY-MM-DD/<flow>-<test-id>/
  README.md            # steps, expected/actual, PASS/FAIL, tester/reviewer
  configuration.json   # commit, version, arm, port/device ID (redact if needed)
  terminal.log
  video.mp4 hoặc video-link.txt
  screenshots/
  observations.md
```

Mọi FAIL phải có: test ID, severity, bước reproduce, expected/actual, log/video, commit/configuration và owner. Re-test chỉ được PASS sau khi evidence mới được đính kèm.

## 8. Exit criteria

Một luồng được gọi là hardware-ready khi các T1/T2 liên quan pass, T3 pass tối thiểu ba lần lặp lại, T4 pass với evidence, không có defect safety mở, và reviewer robotics ký xác nhận mapping/limits. `vr_lekiwi` dashboard không đạt tiêu chí này cho đến khi có real follower adapter.
