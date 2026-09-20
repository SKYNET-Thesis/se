# 06: Graceful Stop, cleanup và forced termination timeout

**What to build:** Stop một session `vr_lekiwi` từ CHECKIK và xác minh cleanup an toàn, kể cả khi process không tự kết thúc.

**Blocked by:** 05 — Dashboard frontend selectors, state display và Open/Copy operatorUrl.

**Status:** ready-for-agent

- [ ] Stop yêu cầu process release clutch authority.
- [ ] Process chuyển các arm về hold pose.
- [ ] Process shutdown và disconnect follower đã chọn.
- [ ] Process dừng HTTPS relay.
- [ ] CHECKIK chờ process graceful termination.
- [ ] Nếu process không kết thúc trong timeout, CHECKIK forced terminate.
- [ ] Sau Stop không còn task/process/relay stale.
- [ ] Stop không đặt latched motion lock.
- [ ] Left-only, right-only và dual-arm đều cleanup đúng phạm vi.
