# 09: Single-arm hardware validation

**What to build:** Điều khiển thành công từng follower thật bằng `left-only` và `right-only`.

**Blocked by:** 07 — E-stop, latched motion lock, Unlock và readiness re-check; 08 — Fake runtime failure safety.

**Status:** ready-for-agent

- [ ] `left-only` mở đúng left follower qua explicit port/device ID.
- [ ] `right-only` mở đúng right follower qua explicit port/device ID.
- [ ] Arm không được chọn không bị mở hoặc chiếm port.
- [ ] Measured pose được seed trước khi Ready.
- [ ] `operatorUrl` hoạt động trên Quest.
- [ ] Mapping VRTeleop giữ nguyên.
- [ ] Safety tuning VRTeleop giữ nguyên.
- [ ] Clutch và hold hoạt động.
- [ ] Stop cleanup đúng follower.
- [ ] E-stop và Unlock hoạt động với single-arm session.
- [ ] Follower failure không để lại process hoặc port bị giữ.
- [ ] Hardware validation bắt đầu ở tốc độ/giới hạn chuyển động an toàn đã cấu hình.
- [ ] E-stop vật lý hoặc cơ chế dừng khẩn cấp phải sẵn sàng trước khi bắt đầu.
- [ ] Không chạy hardware validation nếu workspace chưa thông thoáng hoặc calibration chưa hợp lệ.
