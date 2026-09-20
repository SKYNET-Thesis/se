# 12: Chuyển default sang `vr_lekiwi` và xác minh rollback về `vr_control`

**What to build:** Đặt `vr_lekiwi` làm implementation mặc định nhưng vẫn rollback được rõ ràng về `vr_control`.

**Blocked by:** 11 — Full acceptance và regression matrix.

**Status:** ready-for-agent

- [ ] `vr_lekiwi` chỉ được đặt làm default sau khi Ticket 11 pass.
- [ ] Feature flag `vr_control | vr_lekiwi` vẫn tồn tại.
- [ ] `vr_control` vẫn có thể được chọn thủ công.
- [ ] Rollback từ `vr_lekiwi` về `vr_control` thành công.
- [ ] Rollback không yêu cầu thay đổi arm assignment hoặc calibration.
- [ ] Dashboard hiển thị implementation thực tế của session.
- [ ] Không có suy luận implementation từ route, port hoặc process name.
- [ ] Không thay đổi mapping hoặc safety tuning của VRTeleop.
