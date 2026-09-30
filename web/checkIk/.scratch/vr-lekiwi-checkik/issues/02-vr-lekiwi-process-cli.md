# 02: VR LeKiwi process entrypoint và explicit CLI configuration

**What to build:** Khởi động được process `vr_lekiwi` bằng cấu hình explicit và kết nối đúng fake follower theo arm mode.

**Blocked by:** 01 — Fake follower và DualSO101FollowerRobot adapter contract.

**Status:** ready-for-agent

- [ ] Có process entrypoint riêng cho `vr_lekiwi`.
- [ ] Nhận explicit `mode`.
- [ ] Nhận explicit left/right port.
- [ ] Nhận explicit left/right device ID.
- [ ] Nhận explicit certificate, key và relay port.
- [ ] Không đọc state file của CHECKIK.
- [ ] Không sử dụng `remote_ip`.
- [ ] Không dùng serial auto-discovery.
- [ ] Không khởi tạo mobile base.
- [ ] Process hỗ trợ fake hardware cho cả ba arm mode.
- [ ] Lỗi CLI/configuration trả về thông báo rõ ràng.
