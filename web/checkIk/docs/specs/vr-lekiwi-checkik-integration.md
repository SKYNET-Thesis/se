# Technical Specification: Tích hợp VR LeKiwi vào CHECKIK

## Problem Statement

CHECKIK là giao diện điều khiển chính thức cho việc setup, calibration, teleoperation và VR của hệ thống hai cánh tay SO-101. VR control hiện tại đã có một implementation đang được sử dụng, nhưng cần tích hợp implementation WebXR `lekiwi-vr-teleop` đã được kiểm thử thành công trong `VRTeleop`.

Việc tích hợp phải thay thế toàn bộ hành vi VR của implementation mới mà không làm CHECKIK mất quyền quản lý assignment, calibration, readiness, motion authorization hoặc vòng đời session. Trong giai đoạn chuyển đổi, implementation hiện tại và implementation mới phải cùng tồn tại để kiểm thử và rollback.

## Solution

Bổ sung `VR LeKiwi` (`vr_lekiwi`) như một VR implementation độc lập, chạy bằng process/package riêng và được CHECKIK khởi động thông qua adapter. `VR LeKiwi` sử dụng operator surface WebXR của `lekiwi-vr-teleop`, điều khiển hai SO-101 follower độc lập qua USB trực tiếp vào máy chạy CHECKIK, không sử dụng mobile base trong phase đầu.

CHECKIK giữ vai trò control plane:

- chọn implementation và arm mode;
- kiểm tra readiness trước khi start;
- truyền tường minh port, device ID và cấu hình relay vào process;
- quản lý Start, Stop, E-stop và Unlock;
- hiển thị process lifecycle, health, lỗi và `operatorUrl`.

VRTeleop giữ vai trò operator surface và control loop:

- nhận WebXR tracking;
- mapping tracking thành lệnh arm theo mapping đã kiểm thử;
- áp dụng clutch, hold, stale tracking và safety boundary hiện có;
- kết nối, seed pose, điều khiển và shutdown follower qua adapter;
- hiển thị telemetry chi tiết trong Quest.

## User Stories

1. As an operator, I want to choose between `VR Control` and `VR LeKiwi`, so that I can test the new VR implementation without losing the current implementation.
2. As an operator, I want `VR Control` to remain available as `vr_control`, so that I can roll back if `VR LeKiwi` fails.
3. As an operator, I want to start `VR LeKiwi` in `left-only` mode, so that I can bring up and test only the left follower.
4. As an operator, I want to start `VR LeKiwi` in `right-only` mode, so that I can bring up and test only the right follower.
5. As an operator, I want `dual-arm` to be the default arm mode, so that normal operation controls both followers.
6. As an operator, I want dual-arm startup to require both ready followers, so that one failed arm never produces a misleading partial session.
7. As an operator, I want CHECKIK to validate assignment before startup, so that the process cannot open an unassigned device.
8. As an operator, I want CHECKIK to validate calibration before startup, so that the process starts only with calibrated followers.
9. As an operator, I want CHECKIK to validate device availability before startup, so that missing USB devices fail before motion is authorized.
10. As an operator, I want CHECKIK to enforce motion authorization, so that a process cannot start real motion while motion is locked.
11. As an operator, I want CHECKIK to pass each follower port explicitly, so that `VR LeKiwi` never relies on serial auto-discovery.
12. As an operator, I want CHECKIK to pass each follower device ID explicitly, so that left/right identity is deterministic.
13. As an operator, I want `VR LeKiwi` to use the tested WebXR operator surface, so that Quest interaction remains consistent with the validated implementation.
14. As an operator, I want `VR LeKiwi` to expose a separate HTTPS relay, so that its operator surface is independently reachable from Quest.
15. As an operator, I want CHECKIK to show the actual operator URL, so that I do not need to infer an IP address or port.
16. As an operator, I want to copy or open `operatorUrl` from CHECKIK, so that I can reach the correct VR session easily.
17. As an operator, I want the process to report readiness only after both followers are connected, so that Ready means hardware initialization has completed.
18. As an operator, I want readiness to require measured pose seeding, so that the first command starts from the real follower pose without a jump.
19. As an operator, I want readiness to require the HTTPS relay to be listening, so that CHECKIK does not report a session whose Quest surface is unavailable.
20. As an operator, I want CHECKIK to verify the relay health endpoint, so that the stdout readiness signal is independently confirmed.
21. As an operator, I want the VR relay health status to be available at `/api/status`, so that process health can be checked without relying only on logs.
22. As an operator, I want the dashboard to show implementation, mode and active arms, so that I can identify exactly which session is running.
23. As an operator, I want the dashboard to show the most recent process error, so that startup and runtime failures are diagnosable.
24. As an operator, I want Stop to release clutch authority, so that a normal shutdown cannot leave an arm commanded.
25. As an operator, I want Stop to hold the current pose, so that a normal shutdown does not create an uncontrolled movement.
26. As an operator, I want Stop to shut down and disconnect followers, so that the hardware is released cleanly.
27. As an operator, I want Stop to close the relay and process, so that no stale VR session remains reachable.
28. As an operator, I want E-stop to perform the Stop sequence, so that the active process and followers are brought to a safe stopped state.
29. As an operator, I want E-stop to latch the motion lock, so that restarting a process cannot immediately re-enable motion.
30. As an operator, I want Unlock to be a separate explicit action, so that an E-stop cannot be cleared accidentally.
31. As an operator, I want readiness to be checked again after Unlock, so that a new session cannot start against changed or missing hardware.
32. As an operator, I want a lost clutch to put the corresponding arm into hold, so that releasing the deadman input stops active tracking commands.
33. As an operator, I want stale tracking to revoke motion authority and hold the arms, so that old VR data cannot continue driving hardware.
34. As an operator, I want joint and workspace limits to remain those already tested in VRTeleop, so that integration does not silently change the safety envelope.
35. As an operator, I want mapping values to remain those already tested in VRTeleop, so that integration does not change how my movements map to the arms.
36. As an operator, I want left and right commands to remain isolated, so that one controller cannot command the other follower.
37. As an operator, I want single-arm sessions to work independently, so that I can test or operate one follower without requiring the other.
38. As an operator, I want a dual-arm startup failure to clean up every already-opened follower, so that a partial initialization does not hold USB resources.
39. As an operator, I want fake hardware support, so that adapter and control-loop behavior can be tested without moving physical arms.
40. As an operator, I want offline relay testing, so that Quest/WebXR transport can be validated before hardware is connected.
41. As an operator, I want single-arm tests for both sides, so that left/right configuration and command routing are independently verified.
42. As an operator, I want dual-arm tests, so that simultaneous control and command isolation are verified.
43. As an operator, I want failure tests for tracking loss, WebSocket loss and follower disconnect, so that runtime safety behavior is observable before normal operation.
44. As an operator, I want `VR Control` preserved behind the feature flag after migration, so that rollback remains available even if `VR LeKiwi` becomes the default.

## Implementation Decisions

### VR implementations and feature flag

- The system exposes two implementations:
  - `VR Control` with identifier `vr_control`: the existing implementation.
  - `VR LeKiwi` with identifier `vr_lekiwi`: the new implementation based on the tested `lekiwi-vr-teleop` package.
- The backend stores the selected implementation as the source of truth for the session.
- The frontend selects and displays the implementation; it does not infer it from a route, process name, port or runtime state.
- `vr_control` remains available throughout the migration and after `vr_lekiwi` becomes the default.
- The default is changed to `vr_lekiwi` only after the complete acceptance matrix passes.

### Arm modes

- Supported modes are `left-only`, `right-only` and `dual-arm`.
- `dual-arm` is the default.
- A single-arm session validates and opens only the selected follower.
- A dual-arm session validates and opens both followers.
- A dual-arm session must fail before Ready if either follower is missing, unassigned, unavailable, uncalibrated or unable to connect.
- The first phase controls arms only. Mobile base control is disabled completely.

### Process and package boundary

- `VRTeleop/lekiwi-vr-teleop` remains the source of truth during the development phase.
- CHECKIK uses it as an editable/local dependency.
- The package runs as an independent process managed by CHECKIK.
- The process must not read `dashboard_state.json` or other CHECKIK internal state directly.
- CHECKIK passes all session configuration explicitly through process arguments, including mode, selected follower ports, device IDs, certificate, key and relay port.
- The phase-one process does not use `remote_ip`, mobile base configuration or serial auto-discovery.
- Once the API boundary is stable, the dependency may be moved to a version-pinned package or git submodule to provide explicit versioning and rollback.

### `DualSO101FollowerRobot` adapter

- The adapter is the single hardware boundary between `VR LeKiwi` and CHECKIK-assigned followers.
- It owns two independent `SO101Follower` instances, one for left and one for right, using the explicitly supplied port and device ID.
- It exposes the robot operations required by the VRTeleop control loop: connect, observation, action, connection state and disconnect.
- It provides only the arm action and observation channels in phase one; no base action channel is enabled.
- It preserves left/right arm identity and prevents both arms from writing to the same follower.
- It supports fake follower instances for offline and deterministic adapter/control-loop tests.
- The adapter does not own dashboard readiness or motion authorization; CHECKIK decides whether the process may be started.

### Startup contract

CHECKIK performs the preflight readiness checks for the selected arm mode before spawning the process. The checks include motion authorization, assignment, calibration, device availability and absence of a conflicting task.

The `VR LeKiwi` process startup sequence is:

1. Construct the selected follower instance or instances from explicit arguments.
2. Connect the selected follower instance or instances.
3. Read and seed each selected arm from its measured pose.
4. Start the HTTPS WebXR relay.
5. Verify that the relay is listening.
6. Emit `VR_LEKIWI_READY {...}` through stdout only after all preceding steps succeed.
7. Let CHECKIK verify the relay health endpoint before marking the task Ready.

The readiness payload identifies at least the selected arm mode, active arms, relay port and `operatorUrl`. `operatorUrl` is generated from the actual relay binding and returned to the dashboard; the frontend does not hard-code the host or port.

### Health and status

- The VR relay exposes `/api/status` as its health endpoint.
- CHECKIK verifies this endpoint after receiving `VR_LEKIWI_READY`.
- The dashboard status remains the system-level status surface and reports implementation, mode, active arms, process lifecycle, relay health, operator URL and latest error.
- Detailed joint telemetry, clutch state, stale state and command-vs-measured data remain in the Quest operator surface.
- Detailed telemetry is written to runtime logs; no realtime telemetry bridge from VRTeleop into the dashboard is added in phase one.

### Lifecycle

#### Start

- The operator selects implementation and arm mode, then requests Start.
- CHECKIK performs mode-specific readiness checks.
- CHECKIK starts the selected implementation through its process adapter.
- `vr_lekiwi` is not considered Ready until the startup contract and `/api/status` verification succeed.
- The dashboard exposes Open/Copy operator URL only after `operatorUrl` is available.

#### Stop

- CHECKIK asks the process to perform an orderly shutdown.
- The process releases clutch authority, holds the current pose, shuts down and disconnects selected followers, then stops the relay.
- CHECKIK waits for process termination and uses its existing process cleanup behavior if the process does not terminate within the shutdown timeout.
- Stop does not create a latched motion lock.

#### E-stop

- E-stop performs the Stop behavior and sets `latched motion lock` in CHECKIK.
- The latched lock survives process termination and restart attempts.
- No new real-motion session may start while the lock is latched.

#### Unlock

- Unlock is a separate, explicit operator action with confirmation.
- Unlock clears the latched motion lock only; it does not start or resume a process.
- Assignment, calibration, device availability, motion authorization and process readiness are checked again before a new session starts.

### Responsibility split

| Responsibility | CHECKIK | VRTeleop / `VR LeKiwi` |
|---|---:|---:|
| Implementation selection | Owns | Consumes passed selection |
| Arm mode selection | Owns | Consumes passed mode |
| Port assignment | Owns | Receives explicit ports |
| Calibration readiness | Owns | Requires successful preflight |
| Motion authorization | Final authority | Enforces at process boundary |
| WebXR operator surface | Links/observes | Owns |
| Tracking and mapping | Observes lifecycle | Owns tested behavior |
| Clutch and hold | Observes state | Owns |
| Stale tracking response | Observes error/health | Owns |
| Joint/workspace safety | Verifies preconditions | Owns runtime safety boundary |
| Detailed VR telemetry | Runtime logs/status summary | Owns Quest display |
| Start/Stop/E-stop/Unlock | Owns | Executes process-side shutdown behavior |

## Testing Decisions

Tests verify externally observable behavior at the highest available seam: the CHECKIK-managed process boundary and the `DualSO101FollowerRobot` adapter contract. Tests should not assert private implementation details when they can assert session state, emitted readiness, follower actions, cleanup and health behavior.

### Existing test seams to prefer

- The existing CHECKIK dashboard/controller task seam for readiness, process lifecycle, feature selection, `operatorUrl`, Start, Stop, E-stop and Unlock.
- The adapter boundary for explicit port/device-ID routing, fake hardware, connect/seed/action/disconnect behavior and cleanup.
- The existing VRTeleop offline/fake robot seams for WebXR relay, control-loop, mapping, clutch, hold, stale tracking, command-vs-measured telemetry and safety behavior.

No additional realtime telemetry bridge seam is introduced in phase one.

### Required test groups

1. **Fake hardware adapter tests**
   - left-only creates and commands only the left fake follower;
   - right-only creates and commands only the right fake follower;
   - dual-arm creates both with distinct explicit identities;
   - actions cannot cross between left and right;
   - disconnect and cleanup release all opened fake followers.

2. **Offline relay tests**
   - HTTPS relay starts without physical hardware;
   - Quest/WebXR input reaches the tested VRTeleop control path;
   - relay status is available through `/api/status`;
   - no hardware or mobile base is opened.

3. **Single-arm integration tests**
   - left-only successful startup, pose seed, ready handshake and shutdown;
   - right-only successful startup, pose seed, ready handshake and shutdown;
   - failure of the selected follower prevents Ready and cleans up the process.

4. **Dual-arm integration tests**
   - both followers connect and seed before Ready;
   - `VR_LEKIWI_READY {...}` identifies both active arms and the operator URL;
   - CHECKIK verifies `/api/status` before reporting Ready;
   - failure of either follower cancels the complete startup and cleans up the other follower.

5. **Lifecycle and safety tests**
   - Start is rejected when motion authorization, assignment, calibration or availability is invalid;
   - Stop releases clutch, holds pose, disconnects followers and closes the process;
   - E-stop performs Stop and latches motion lock;
   - Start remains rejected while motion lock is latched;
   - Unlock requires explicit confirmation and a complete readiness re-check;
   - stale tracking and WebSocket loss revoke active control and hold the arms;
   - follower disconnect produces a visible failure and safe cleanup.

6. **Regression and rollback tests**
   - `vr_control` remains startable through the same feature-selection surface;
   - switching implementation does not infer state from route, port or process name;
   - rollback from `vr_lekiwi` to `vr_control` is possible after a failed test session.

### Acceptance criteria

The specification is accepted when all of the following are true:

- Both `vr_control` and `vr_lekiwi` are selectable by explicit implementation identifier.
- `left-only`, `right-only` and `dual-arm` are supported, with `dual-arm` as the default.
- CHECKIK remains the final authority for motion authorization and readiness.
- The new process receives explicit ports, device IDs, mode, certificate and relay port.
- The phase-one process does not use `remote_ip`, mobile base control or serial auto-discovery.
- `DualSO101FollowerRobot` isolates the two independently assigned followers.
- Readiness is emitted only after follower connection, measured-pose seed and HTTPS relay listen succeed.
- `VR_LEKIWI_READY {...}` is emitted and CHECKIK independently verifies relay `/api/status`.
- `operatorUrl` is returned by task status and shown by the dashboard without frontend hard-coding.
- Stop, E-stop and Unlock satisfy the lifecycle and motion-lock behavior defined above.
- VRTeleop mapping and safety tuning remain unchanged in phase one.
- Fake hardware, offline, single-arm and dual-arm tests pass.
- Clutch/hold, stale tracking, WebSocket loss, follower disconnect, startup failure, Stop, E-stop and rollback tests pass.
- Detailed telemetry remains in the Quest operator surface and runtime logs; no realtime dashboard telemetry bridge is required.

## Out of Scope

- Implementing or modifying the code in this specification.
- Replacing or removing `vr_control` during the migration.
- Mobile base control or thumbstick base behavior.
- Use of `remote_ip` in phase one.
- Serial auto-discovery in phase one.
- Reading CHECKIK state files directly from the VRTeleop process.
- Changing the tested VRTeleop mapping, gains, joint limits, workspace limits, stale timeout or other safety tuning.
- Adding safety tuning controls to the CHECKIK dashboard.
- Adding a realtime telemetry bridge into the CHECKIK dashboard.
- Cloud control, remote deployment or multi-host orchestration.
- Converting the editable/local dependency into a pinned package before the API boundary is stable.
- New VR interaction modes or new Quest UX beyond the existing `lekiwi-vr-teleop` operator surface.

## Further Notes

- The source of truth during development is the existing `lekiwi-vr-teleop` package outside CHECKIK, consumed as an editable/local dependency.
- After the adapter and process API stabilize, dependency version pinning or a git submodule can be introduced to make rollback explicit.
- The terms used here follow the project glossary in `CONTEXT.md`: CHECKIK is the control plane, VRTeleop is the operator surface/control process, a follower is a physical SO-101 arm, and each session has an explicit arm mode.
- This spec intentionally records the integration boundary and externally observable contracts. It does not prescribe private class layout or internal refactoring beyond the named adapter boundary.
