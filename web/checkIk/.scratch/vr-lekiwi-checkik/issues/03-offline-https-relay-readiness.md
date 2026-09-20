# 03: Offline HTTPS relay và readiness handshake

**What to build:** Mở operator surface WebXR offline và phát readiness hợp lệ sau khi fake follower, pose seed và HTTPS relay đều sẵn sàng.

**Blocked by:** 02 — VR LeKiwi process entrypoint và explicit CLI configuration.

**Status:** ready-for-agent

- [ ] HTTPS relay khởi động bằng certificate/key explicit.
- [ ] Relay expose `/api/status`.
- [ ] `/api/status` trả trạng thái process/relay và active arms.
- [ ] Fake follower được connect trước khi báo Ready.
- [ ] Pose fake follower được seed trước khi báo Ready.
- [ ] Relay đã listen trước khi báo Ready.
- [ ] Process phát `VR_LEKIWI_READY {...}` qua stdout.
- [ ] Readiness payload có mode, active arms và `operatorUrl`.
- [ ] WebXR UI của VRTeleop mở được bằng `operatorUrl`.
- [ ] Không mở hardware thật hoặc mobile base.
- [ ] Mapping và safety tuning hiện có của VRTeleop không thay đổi.
