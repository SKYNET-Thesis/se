# 08: Fake runtime failure safety

**What to build:** Một offline `vr_lekiwi` session dùng fake hardware tự chuyển về trạng thái an toàn khi input hoặc follower mất tin cậy.

**Blocked by:** 03 — Offline HTTPS relay và readiness handshake.

**Status:** ready-for-agent

- [ ] Nhả clutch đưa arm tương ứng về hold.
- [ ] Stale tracking thu hồi motion authority.
- [ ] Stale tracking đưa arm về hold.
- [ ] Mất WebSocket thu hồi motion authority theo safety behavior hiện có.
- [ ] Follower disconnect được phát hiện.
- [ ] Follower disconnect không để lại command đang chạy.
- [ ] Runtime failure cleanup được fake follower, relay và process.
- [ ] Lỗi runtime được ghi vào runtime log.
- [ ] Có test cho left-only, right-only hoặc dual-arm ở mức phù hợp.
- [ ] Không thay đổi mapping hoặc safety tuning hiện có của VRTeleop.
