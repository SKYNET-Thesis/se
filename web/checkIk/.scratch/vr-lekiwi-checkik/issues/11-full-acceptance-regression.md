# 11: Full acceptance và regression matrix

**What to build:** Chạy toàn bộ acceptance matrix và chứng minh implementation hiện tại vẫn hoạt động để rollback.

**Blocked by:** 10 — Dual-arm hardware validation.

**Status:** ready-for-agent

- [ ] Offline relay test pass.
- [ ] Fake adapter test pass.
- [ ] Process CLI/configuration test pass.
- [ ] CHECKIK backend lifecycle test pass.
- [ ] Dashboard selector/status/operatorUrl test pass.
- [ ] Single-arm left test pass.
- [ ] Single-arm right test pass.
- [ ] Dual-arm test pass.
- [ ] Clutch/hold test pass.
- [ ] Stale tracking test pass.
- [ ] WebSocket loss test pass.
- [ ] Follower disconnect test pass.
- [ ] Startup failure cleanup test pass.
- [ ] Graceful Stop test pass.
- [ ] Forced termination timeout test pass.
- [ ] E-stop test pass.
- [ ] Unlock/readiness re-check test pass.
- [ ] `vr_control` regression test pass.
- [ ] Mapping và safety tuning không bị thay đổi.
- [ ] Không có realtime telemetry bridge mới.
- [ ] Không có `remote_ip`, mobile base hoặc auto-discovery trong phase đầu.
