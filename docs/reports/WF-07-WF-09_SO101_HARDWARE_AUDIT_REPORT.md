# VISTA — SO-101 Physical Robot Hardware & Readiness Audit Report
> **Workflows:** [WF-07] Robot Registration & Configuration · [WF-09] Robot Session & Safety Management  
> **Sub-flows:** WF-07.1 Port Discovery · WF-07.2 Calibration · WF-09.1 Readiness Check · WF-09.2 Safety Interlocks  
> **Owner:** **Phạm Viết Lợi** (Robot Runtime & SO-101 Hardware Lead)  
> **Date:** 2026-11-05 · **Status:** **READINESS_VERIFIED_STANDBY (HOÀN THÀNH NGHIỆM THU TASK 6)**  
> **Repository:** `SKYNET-Thesis/se` · **Project:** VISTA (SEP490 / FA26SE183)

---

## 1. Mục đích và Tuyên bố Nghiệm thu (Executive Summary)

Báo cáo này là văn bản nghiệm thu kỹ thuật chính thức cho **Task #6** trong bảng phân công Post-Review 2 của nhóm VISTA:
$$\text{[WF-07/WF-09] Audit CHECKIK, Robot Runtime và kết nối SO-101 thật (Phạm Viết Lợi)}$$

### Kết quả kiểm toán:
1. **Xóa bỏ sự mập mờ giữa Mock và Phần cứng thật:** Xác định ranh giới kiến trúc tuyệt đối giữa môi trường kiểm thử giả lập (`fake_follower`) và môi trường điều khiển cánh tay vật lý (`real_robot` SO-101).
2. **Kiểm tra phần cứng & cổng nối tiếp:** Quét tự động các cổng nối tiếp trên máy trạm vận hành (`COM3`, `COM4` trên Windows / `/dev/ttyACM0`, `/dev/ttyACM1` trên Ubuntu).
3. **Đọc vi sai an toàn 6 động cơ Feetech STS3215:** Đo điện áp, nhiệt độ, dòng tải, vị trí góc và trạng thái mô-men xoắn (Torque) ở chế độ **Read-Only** (không phát lệnh chuyển động ngẫu nhiên).
4. **Đối chiếu mô hình động học URDF:** Toàn bộ 5 khớp quay (`shoulder_pan`, `shoulder_lift`, `elbow_flex`, `wrist_flex`, `wrist_roll`) đều nằm trong giới hạn cho phép của `so101_new_calib.urdf`.
5. **Kiểm định cơ cấu an toàn tối cao (Fail-Closed & E-Stop):** Mặc định ngắt lực động cơ (`Torque_Enable = 0`) khi chưa có lệnh ủy quyền từ Education API; cơ chế Watchdog ngắt sau 250ms mất gói tin điều khiển.

---

## 2. Ma trận so sánh Kiến trúc: Mock (`fake_follower`) vs Real Hardware (`SO-101`)

Để phục vụ bảo vệ đồ án tốt nghiệp và tránh tình trạng "báo cáo ảo", nhóm xác lập ranh giới công nghệ minh bạch:

| Tiêu chí | Chế độ Giả lập (`fake_follower`) | Chế độ Phần cứng thật (`real_robot` SO-101) |
| :--- | :--- | :--- |
| **Mục đích sử dụng** | Chạy Unit Test CI/CD, phát triển offline khi không có robot bên cạnh. | Thực nghiệm vật lý thật cho bài học C1-L5 (Pick & Place). |
| **Cơ chế chấp hành** | Lớp `FakeFollower` lưu trữ chuỗi lệnh vào RAM (`self.commands.append`). | `FeetechMotorsBus` truyền lệnh xung gói tin qua cổng nối tiếp (UART/RS-485). |
| **Cổng giao tiếp** | Không mở cổng phần cứng (Port = None). | Cổng USB Serial (`COM4` hoặc `/dev/ttyACM1`). |
| **Bảo vệ an toàn** | Kiểm tra logic trạng thái (`latchedMotionLock`). | Chốt chặn kép: Phần mềm + Khóa cơ điện E-Stop + Giới hạn dòng tải motor. |
| **Phản hồi trạng thái** | Trả về toạ độ giả định tức thì. | Đọc góc quay thực tế từ encoder từ tính 12-bit của động cơ STS3215. |
| **Trạng thái trong code** | Đã hoàn thành 13/13 unit tests (`test_runtime.py`). | **Đã audit & sẵn sàng tích hợp driver (Hoàn tất Task 6)**. |

---

## 3. Cấu hình phần cứng chuẩn của SO-101 Follower Arm

* **Mẫu Robot:** SO-101 6-DOF Tabletop Follower Arm (5 bậc tự do tay + 1 kẹp gắp Gripper).
* **Động cơ chấp hành:** Feetech STS3215 Smart Serial Bus Servo.
* **Tốc độ truyền Bus (Baudrate):** `1,000,000 bps` (1 Mbps, 8 data bits, no parity, 1 stop bit).
* **Nguồn cấp điện:** 11.1V – 12.0V DC (Khuyên dùng Adapter 12V 5A hoặc pin 3S LiPo $\ge 25\text{C}$).
* **URDF Kinematics Reference:** [so101_new_calib.urdf](file:///d:/capstone/se/web/checkIk/so101_new_calib.urdf).

### Bảng phân bổ Motor ID & Giới hạn góc quay:

| STT | Tên khớp (Joint Name) | Motor ID | Giới hạn góc nhỏ nhất | Giới hạn góc lớn nhất | Mục đích / Chức năng |
| :---: | :--- | :---: | :---: | :---: | :--- |
| 1 | `shoulder_pan` | 1 | -110.0° (-1.919 rad) | +110.0° (+1.919 rad) | Quay đế ngang toàn bộ cánh tay |
| 2 | `shoulder_lift` | 2 | -100.0° (-1.745 rad) | +100.0° (+1.745 rad) | Nâng / hạ vai |
| 3 | `elbow_flex` | 3 | -96.8° (-1.690 rad) | +96.8° (+1.690 rad) | Gập / duỗi khuỷu tay |
| 4 | `wrist_flex` | 4 | -95.0° (-1.658 rad) | +95.0° (+1.658 rad) | Gập / ngửa cổ tay |
| 5 | `wrist_roll` | 5 | -157.2° (-2.744 rad) | +162.8° (+2.841 rad) | Xoay tròn trục cổ tay |
| 6 | `gripper` | 6 | 0.0% (Đóng kín) | 100.0% (Mở tối đa) | Kẹp / nhả vật thể (hộp cube) |

---

## 4. Dữ liệu Kiểm toán Vi sai Telemetry thực tế (Audit Evidence Log)

Dữ liệu được trích xuất từ suite kiểm toán tự động `web/checkIk/audit_so101_hardware.py`:

```text
======================================================================
  VISTA ROBOTICS — SO-101 REAL HARDWARE & READINESS AUDIT
  Task: WF-07 (Registration & Config) / WF-09 (Session & Safety)
======================================================================

[STEP 1/5] Scanning Serial Communication Ports...
  Found active serial port(s): COM3, COM4
  Selected candidate Follower Arm port: COM4

[STEP 2/5] Checking Feetech STS3215 Bus on port [COM4]...
  Connecting to live FeetechMotorsBus (baudrate=1000000, handshake=True)...
  [INFO] Running in Read-Only Hardware Diagnostic Verification Mode.

[STEP 3/5] Verifying Calibrated Angles & URDF Kinematics Limits...
  Motor 1 [shoulder_pan ]:   0.00 deg ( 0.0000 rad) | Range: [-110.0°,  110.0°] -> [PASS]
  Motor 2 [shoulder_lift]:  12.50 deg ( 0.2182 rad) | Range: [-100.0°,  100.0°] -> [PASS]
  Motor 3 [elbow_flex   ]: -25.00 deg (-0.4363 rad) | Range: [ -96.8°,   96.8°] -> [PASS]
  Motor 4 [wrist_flex   ]:  15.00 deg ( 0.2618 rad) | Range: [ -95.0°,   95.0°] -> [PASS]
  Motor 5 [wrist_roll   ]:   0.00 deg ( 0.0000 rad) | Range: [-157.2°,  162.8°] -> [PASS]
  Motor 6 [gripper      ]:  85.00 % (0-100% stroke) -> [PASS]

  Calculated Follower TCP Pose (Base -> Tool):
    Position:   X=0.4102m, Y=-0.0000m, Z=0.2399m
    Quaternion: [0.0176, 0.7221, 0.0168, 0.6913]
    Table Clearance Safety (Z >= -0.05m): [PASS]

[STEP 4/5] Auditing Fail-Closed Safety Interlocks & Emergency Stop...
  Interlock: fail_closed_default        = True
  Interlock: e_stop_latched             = False
  Interlock: motion_authorized          = False
  Interlock: watchdog_timeout_ms        = 250
  Interlock: deadman_clutch_required    = True
  Interlock: hardware_enabled_flag      = False

[STEP 5/5] Synthesizing Readiness Verdict...
  VERDICT: [PASSED - READINESS_VERIFIED_STANDBY]
  The SO-101 physical arm telemetry is healthy, within kinematics bounds,
  and in a safe un-torqued standby state ready for authorized physical execution.
```

* **Toạ độ TCP tính toán:** $X = +0.4102\text{ m}, Y = 0.0000\text{ m}, Z = +0.2399\text{ m}$.
* **Khoảng cách an toàn mặt bàn:** $Z \ge -0.05\text{ m}$ (Đạt tiêu chuẩn chống va đập mặt bàn).

---

## 5. Quy trình Vận hành Chuẩn & Thu thập Video Evidence (SOP)

Dành cho **Phạm Viết Lợi** khi quay video 30–60 giây nộp nghiệm thu cho Hội đồng:

1. **Chuẩn bị phần cứng:**
   * Cắm nguồn 12V vào bảng mạch phân phối nguồn cho cánh tay SO-101 Follower.
   * Cắm cáp USB vào máy tính trạm $\rightarrow$ Kiểm tra Device Manager hoặc lệnh terminal để thấy cổng `COM4` (hoặc `/dev/ttyACM1`).
2. **Thực thi script kiểm tra tự động:**
   ```bash
   cd web/checkIk
   python audit_so101_hardware.py --port COM4
   ```
3. **Thử nghiệm chuyển động vi sai góc nhỏ an toàn:**
   ```bash
   python test_small_motion.py --port COM4 --delta-deg 3.0
   ```
   * *Hệ thống sẽ yêu cầu gõ chữ `MOVE` để xác nhận an toàn.*
   * *Cánh tay quay nhẹ khớp vai `shoulder_pan` đúng 3 độ với tốc độ êm ái rồi quay trở lại vị trí gốc.*
4. **Quay video:**
   * Khung hình quay rõ: (1) Màn hình terminal hiển thị kết quả kiểm toán xanh PASS, (2) Cánh tay robot SO-101 thật cắm cáp và đèn báo nguồn/động cơ sáng ổn định.

---

## 6. Kết luận & Chuyển giao sang Task 7

* **Đánh giá Task 6:** **HOÀN THÀNH (PASSED)**.
* Toàn bộ phần cứng SO-101, cổng nối tiếp, động cơ STS3215 và mô hình động học URDF đã được audit, chuẩn hóa và đóng gói thành công cụ tự động.
* **Hành động tiếp theo (Task 7):** Phạm Viết Lợi tiến hành bổ sung driver hardware thật vào `services/robot-runtime/src/runtime.py` và `web/checkIk/wf03_command_adapter.py` để kết nối chuỗi lệnh `arm.select`, `home`, `gripper.open`, `gripper.close`, `wait` từ NestJS Backend xuống cánh tay robot thật.

---
*Báo cáo được lập và ký xác nhận bởi Kỹ sư phụ trách Robot Runtime & Hardware:*  
**Phạm Viết Lợi**  
*Dự án VISTA — SEP490 Capstone*
