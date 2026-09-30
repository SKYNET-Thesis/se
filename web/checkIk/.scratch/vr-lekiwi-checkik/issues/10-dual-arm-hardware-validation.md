# 10: Dual-arm hardware validation

**What to build:** Điều khiển đồng thời hai follower thật bằng `dual-arm` với startup all-or-nothing.

**Blocked by:** 09 — Single-arm hardware validation.

**Status:** ready-for-agent

- [ ] Hai follower được mở bằng đúng explicit port/device ID.
- [ ] Hai follower connect và seed pose trước khi Ready.
- [ ] Left/right command isolation được xác minh trên hardware.
- [ ] `VR_LEKIWI_READY {...}` xác định đúng hai active arms.
- [ ] CHECKIK xác minh `/api/status` trước khi báo Ready.
- [ ] Thiếu hoặc lỗi một follower khiến toàn bộ startup thất bại.
- [ ] Follower đã mở trước đó được cleanup khi startup thất bại.
- [ ] Không có partial dual-arm session được báo Ready.
- [ ] Stop cleanup cả hai follower.
- [ ] E-stop khóa cả session.
- [ ] Không có mobile base action.
- [ ] Hardware validation bắt đầu ở tốc độ/giới hạn chuyển động an toàn đã cấu hình.
- [ ] E-stop vật lý hoặc cơ chế dừng khẩn cấp phải sẵn sàng trước khi bắt đầu.
- [ ] Không chạy hardware validation nếu workspace chưa thông thoáng hoặc calibration chưa hợp lệ.
