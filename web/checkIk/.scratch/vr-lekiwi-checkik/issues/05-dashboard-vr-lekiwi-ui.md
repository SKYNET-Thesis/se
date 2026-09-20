# 05: Dashboard frontend selectors, state display và Open/Copy operatorUrl

**What to build:** Operator có thể chọn implementation/arm mode và quan sát chính xác trạng thái session `vr_lekiwi` trên dashboard.

**Blocked by:** 04 — CHECKIK backend lifecycle, process spawning, handshake, health và task status.

**Status:** ready-for-agent

- [ ] UI hiển thị selector `VR Control` và `VR LeKiwi`.
- [ ] UI gửi implementation đã chọn từ backend contract.
- [ ] UI hiển thị selector `left-only`, `right-only`, `dual-arm`.
- [ ] `dual-arm` là lựa chọn mặc định.
- [ ] UI hiển thị implementation hiện tại.
- [ ] UI hiển thị arm mode và active arms.
- [ ] UI hiển thị process lifecycle và relay health.
- [ ] UI hiển thị lỗi gần nhất.
- [ ] UI hiển thị `operatorUrl` sau khi Ready.
- [ ] Có thao tác Open và Copy `operatorUrl`.
- [ ] Frontend không hard-code IP, port hoặc suy luận implementation từ route/process.
- [ ] `vr_control` hiện tại vẫn hiển thị và có thể được chọn.
