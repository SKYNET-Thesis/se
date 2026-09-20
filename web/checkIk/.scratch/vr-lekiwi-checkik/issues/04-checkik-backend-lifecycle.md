# 04: CHECKIK backend lifecycle, process spawning, handshake, health và task status

**What to build:** CHECKIK backend start được một session offline `vr_lekiwi` và chỉ báo Ready sau khi xác minh đầy đủ handshake/health.

**Blocked by:** 03 — Offline HTTPS relay và readiness handshake.

**Status:** ready-for-agent

- [ ] Backend lưu implementation bằng `vr_control | vr_lekiwi`.
- [ ] Backend nhận arm mode `left-only`, `right-only` hoặc `dual-arm`.
- [ ] Backend kiểm tra readiness theo arm mode trước khi spawn.
- [ ] Backend truyền explicit process configuration.
- [ ] Backend quản lý process `vr_lekiwi`.
- [ ] Backend đọc và xác minh `VR_LEKIWI_READY {...}`.
- [ ] Backend gọi và xác minh relay `/api/status`.
- [ ] Task chỉ chuyển sang Ready sau khi cả handshake và health pass.
- [ ] Task status trả implementation, mode, active arms, process health, relay health, lỗi gần nhất và `operatorUrl`.
- [ ] Startup failure trả rõ arm, port và nguyên nhân.
- [ ] Dual-arm startup failure cleanup toàn bộ follower/process liên quan.
