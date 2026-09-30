# 07: E-stop, latched motion lock, Unlock và readiness re-check

**What to build:** E-stop khóa chuyển động và buộc operator thực hiện Unlock cùng readiness check trước session tiếp theo.

**Blocked by:** 06 — Graceful Stop, cleanup và forced termination timeout.

**Status:** ready-for-agent

- [ ] E-stop thực hiện Stop sequence.
- [ ] E-stop đặt `latched motion lock`.
- [ ] Latched lock tồn tại sau process termination.
- [ ] Start bị từ chối khi lock đang latched.
- [ ] Unlock là hành động riêng.
- [ ] Unlock yêu cầu xác nhận rõ ràng.
- [ ] Unlock không tự start hoặc resume process.
- [ ] Sau Unlock phải kiểm tra lại assignment.
- [ ] Sau Unlock phải kiểm tra lại calibration.
- [ ] Sau Unlock phải kiểm tra lại device availability.
- [ ] Sau Unlock phải kiểm tra lại motion authorization và process readiness.
- [ ] E-stop/Unlock hoạt động đúng với left-only, right-only và dual-arm bằng fake hardware.
