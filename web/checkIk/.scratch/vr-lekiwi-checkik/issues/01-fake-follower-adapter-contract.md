# 01: Fake follower và DualSO101FollowerRobot adapter contract

**What to build:** Chạy control path với fake hardware và chứng minh left/right follower được quản lý độc lập.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Adapter quản lý được fake left follower và fake right follower.
- [ ] Hỗ trợ `left-only`, `right-only` và `dual-arm`.
- [ ] Có contract cho connect, observation, action, connection state và disconnect.
- [ ] Left action chỉ đi tới left follower.
- [ ] Right action chỉ đi tới right follower.
- [ ] Dual-arm yêu cầu hai follower có identity riêng.
- [ ] Cleanup giải phóng mọi fake follower đã mở.
- [ ] Có test deterministic không dùng robot thật.
- [ ] Không dùng auto-discovery, `remote_ip` hoặc mobile base.
