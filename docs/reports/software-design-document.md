# Software Design Document (SDD)
## Hệ thống teleoperation hai cánh tay SO-101

> Nội dung này đã được hợp nhất vào tài liệu canonical: [Tài liệu phần mềm tổng hợp SO-101](../progress/teleoperation-progress-and-test-plan.md). Giữ file này chỉ để tham chiếu lịch sử.

| Thuộc tính | Nội dung |
| --- | --- |
| Phiên bản | 1.0 — working baseline |
| Cập nhật | 15/09/2026 |
| Đối tượng | Nhóm Software, Robotics, AI, QA và người hướng dẫn |
| Phạm vi | Leader web teleop, VR/WebXR, phone teleop, laptop dashboard và ứng dụng mobile |

## 1. Mục đích

Tài liệu mô tả thiết kế phần mềm dùng để điều khiển một hoặc hai cánh tay SO-101 từ nhiều nguồn input. Mục tiêu thiết kế là chuyển input của operator thành action robot **an toàn, kiểm thử được và quan sát được**, đồng thời chuẩn bị dữ liệu demonstration cho các task như pha trà, dọn bàn, xếp đồ và thao tác nấu ăn an toàn.

Tài liệu này mô tả kiến trúc hiện tại, không xác nhận tất cả thành phần đã hoàn thành hardware end-to-end. Trạng thái nghiệm thu thuộc Software Test Document (STD).

## 2. Phạm vi hệ thống

### 2.1 In scope

- Điều khiển leader/follower qua web backend, một tay hoặc hai tay.
- Quest Browser/WebXR: controller và hand tracking, digital twin, VR operator surface.
- Phone teleop bằng Expo/React Native; iOS development build dùng ARKit 6DoF.
- FK, IK, coordinate transform, workspace/joint/rate safety, clutch, stale input và shutdown.
- CHECKIK dashboard: port assignment, calibration task, process lifecycle, motion lock, Start/Stop/E-stop/Unlock.
- Telemetry, camera stream hooks, log và hợp đồng dữ liệu demonstration.

### 2.2 Out of scope hoặc chưa hoàn thành

- Android ARCore native 6DoF.
- Cloud control, multi-user authorization và remote deployment.
- Dataset recorder episode E2E đã nghiệm thu.
- VR LeKiwi được dashboard điều khiển follower thật: dashboard implementation hiện dùng fake follower.
- Tự động hóa hoàn chỉnh các task pha trà/dọn bàn/nấu ăn/xếp đồ.

## 3. Yêu cầu thiết kế

| ID | Yêu cầu | Cách đáp ứng |
| --- | --- | --- |
| D-01 | Không gửi raw input trực tiếp tới servo | Input đi qua protocol validation, mapping, clutch, IK và safety. |
| D-02 | Hai arm không được cross-command | Prefix/action routing và explicit arm/port/device ID. |
| D-03 | Bắt đầu control không làm robot jump | Relative reference và measured-pose seed/hold latch. |
| D-04 | Mất input phải an toàn | Timeout, disconnect, tracking-loss và clutch release đưa arm vào hold. |
| D-05 | Phần cứng chỉ mở khi có thẩm quyền | CHECKIK motion lock, assignment, calibration và explicit confirmation. |
| D-06 | Có thể kiểm thử không cần robot | Offline server, fake headset và fake follower adapter. |
| D-07 | Operator thấy được trạng thái | Dashboard/Quest telemetry, health endpoint và error/log surface. |

## 4. Kiến trúc tổng thể

```text
┌──────────────────────────────── Operator inputs ────────────────────────────────┐
│ Leader web                 Meta Quest / WebXR                 Mobile phone       │
└──────────┬─────────────────────────────┬───────────────────────────┬─────────────┘
           │ WebSocket                   │ WebXR + WebSocket         │ protocol v1
           └─────────────────────────────┴───────────────────────────┘
                                          │
                                          ▼
                           ┌────────────────────────────┐
                           │ Python teleoperation layer │
                           │ validation / mapping       │
                           │ teleop state + clutch      │
                           │ FK/IK + safety             │
                           └──────────────┬─────────────┘
                                          │ action / observation
                    ┌─────────────────────┴────────────────────┐
                    ▼                                          ▼
       ┌────────────────────────┐                 ┌────────────────────────┐
       │ LeRobot left adapter   │                 │ LeRobot right adapter  │
       └───────────┬────────────┘                 └───────────┬────────────┘
                   ▼                                          ▼
             SO-101 left                                  SO-101 right

     URDF/SO-101 chain ── FK, IK, limits        GLB/Three.js ── digital twin
     CHECKIK dashboard ── control plane, lifecycle, health, operator URL
```

## 5. Module design

### 5.1 Robot/hardware boundary

LeRobot hoặc follower adapter là nơi duy nhất được phép connect serial, đọc observation, gửi action và disconnect. Operator surface không truy cập servo trực tiếp.

Các lifecycle tối thiểu:

```text
Disconnected → Assigned → Calibrated → Connected → Pose seeded → Ready
                                              │                    │
                                              └──── Stop/E-stop ───┘
                                                           ▼
                                                     Disconnected
```

Mỗi follower phải có port và device ID rõ ràng. Không dùng `/dev/ttyACM*` như một định danh ổn định; dùng `/dev/serial/by-id/` khi vận hành hardware.

### 5.2 Kinematics

- URDF/chain là nguồn hình học: parent-child link, joint axis và limits.
- FK nhận joint state và trả end-effector pose.
- IK nhận target pose, trả joint target khả thi hoặc lỗi/rejection.
- Kiểm tra regression phải xác nhận `FK(IK(target))` xấp xỉ target trong sai số chấp nhận được.
- GLB chỉ render model, không là nguồn truth cho IK.

### 5.3 Teleoperation state

State duy trì kết nối, sequence/timestamp, pose input gần nhất, clutch, reference pose, target được gửi gần nhất và stop state. Khi operator kích hoạt clutch, state chốt input pose và robot pose hiện tại. Sau đó:

```text
delta input → coordinate transform → delta end-effector → bounded target → IK → action
```

Nhả clutch, recenter, socket close hoặc tracking lost phải xóa/revoke control authority. Hold sử dụng target an toàn hiện có, không phát lại raw input cũ.

### 5.4 Safety layer

| Lớp | Kiểm tra | Phản ứng |
| --- | --- | --- |
| Input | JSON/schema, finite value, sequence, timestamp | Reject packet lỗi/stale/out-of-order. |
| Authority | clutch/deadman, arm ownership, motion lock | Không tạo action khi không có quyền. |
| Cartesian | workspace, end-effector step | Clamp/reject target ngoài vùng. |
| Joint | joint limit, max joint step/rate, tracking fault | Giới hạn hoặc đưa arm vào hold/fault. |
| Lifecycle | disconnect, timeout, Stop/E-stop | Release clutch, cleanup process và disconnect follower. |

Safety phần mềm không thay thế E-stop vật lý, giám sát người vận hành hoặc thao tác ngắt nguồn.

### 5.5 WebXR/VR operator

Quest Browser lấy controller pose/nút bấm qua WebXR. Mapping dùng relative/clutch control. Một hand/controller chỉ sở hữu arm được chọn; trigger/grip được map sang gripper/clutch theo runtime. Relay chịu trách nhiệm HTTP(S), WebSocket, status `/api/status`, telemetry và camera frames.

Các runtime tách biệt:

- `dual_arm_vr_teleop/frontend`: Quest WebXR operator và digital twin.
- `VRTeleop/lekiwi-vr-teleop`: relay/control loop VR LeKiwi hoặc local SO-101.
- `webxr/`: laboratory/prototype, không là control-plane canonical.

### 5.6 Phone teleop

Mobile gửi protocol version 1:

```json
{"type":"hello","protocolVersion":1,"platform":"ios","sessionId":"...","arm":"right"}
```

Sau handshake, client gửi `phone_pose` gồm `sequence`, `timestampNs`, `trackingState`, `enabled`, `fineMode`, `position`, `quaternion` và `gripperVelocity`. Server chỉ chấp nhận pose sau `hello`, xác thực schema, kiểm sequence/timestamp rồi map qua cùng seam safety/IK với teleop khác.

ARKit iOS tạo world-tracked 6DoF. Expo Go/Android fallback dùng DeviceMotion; fallback không đủ độ tin cậy cho precision hardware operation.

### 5.7 Mobile application

`apps/mobile` là Expo/React Native operator app. Các screen Home, Connect, Calibrate, Teleop, Camera và Status hiện đã có UI/navigation nhưng phần lớn dùng mock data. Phone Teleop là phần có WebSocket client thực.

Global E-STOP trong mobile hiện chỉ là app-local state/UI gate; nó không thay thế E-stop của backend/hardware. Các màn mock không được trình bày là đã monitor/control robot thật.

### 5.8 CHECKIK dashboard/control plane

CHECKIK quản lý assignment/calibration, startup task, health, operator URL và motion lock. API routes bao gồm `/api/status`, port assignment, task start/stop, E-stop và Unlock. Backend phải bắt đầu với real motion locked.

`vr_control` và `vr_lekiwi` là hai implementation riêng. `vr_lekiwi` dashboard process hiện dùng `FakeSOFollower`; readiness/health của nó chỉ là offline validation, không chứng minh serial hardware đã chạy.

## 6. Interface design

| Boundary | Input | Output | Error/safety behavior |
| --- | --- | --- | --- |
| Quest ↔ relay | controller/hand pose, buttons | telemetry, camera, status | stale/disconnect releases clutch. |
| Phone ↔ server | protocol v1 JSON | hello_ack, phone_status/error | invalid/stale packet reject. |
| Dashboard ↔ backend | local HTTP JSON | status/task snapshot | motion lock and preflight gate real task. |
| Control ↔ follower | bounded joint action | measured observation | connect/action failure triggers cleanup/fault. |
| Recorder ↔ AI | timestamped observation/action/metadata | episode artifact | must not block control loop. |

## 7. Data model for AI demonstrations

Mỗi episode phải có task/episode ID, operator ID (pseudonymous nếu cần), timestamps monotonic, robot/firmware/software version, configuration, RGB/depth camera nếu có, joint position/velocity, end-effector pose, gripper state, input pose/button, action thực gửi, safety state và success/failure reason.

Dataset recorder nên dùng tách luồng/buffer bounded. Khi recorder lỗi hoặc chậm, control safety phải tiếp tục và episode được đánh dấu incomplete thay vì làm control loop backlog.

## 8. Deployment and configuration

| Thành phần | Cách chạy | Cấu hình quan trọng |
| --- | --- | --- |
| Mobile | Expo development build/iOS IPA | local network, camera/motion permission, server host/port. |
| Dashboard backend | Python local service | `--enable-motion` chỉ khi hardware preflight xong. |
| Laptop dashboard | Vite frontend | backend URL, trusted local network. |
| Quest operator | Quest Browser qua HTTPS/ADB relay | relay host/port/certificate, selected arm/mode. |
| Robot runtime | LeRobot environment | explicit port, device ID, calibration, no auto-discovery. |

Secrets, certificate private key, Wi-Fi credential, robot serial identity và any cloud token không được commit vào repository hoặc evidence log.

## 9. Traceability to source code

| Capability | Primary location |
| --- | --- |
| Mobile routing/phone UI | `apps/mobile/App.tsx`, `src/navigation/AppNavigator.tsx`, `src/screens/PhoneTeleopScreen.tsx` |
| iOS ARKit | `apps/mobile/modules/expo-phone-ar/ios/PhoneARView.swift` |
| iOS build | `.github/workflows/mobile-ios-development.yml` |
| Web dashboard | `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564` |
| Dashboard backend | `web/checkIk/dual_arm_vr_teleop/backend/dashboard_server.py` |
| Real/offline bridge | `web/checkIk/dual_arm_vr_teleop/backend/*teleop_server.py` |
| VR LeKiwi | `web/checkIk/VRTeleop/lekiwi-vr-teleop/lekiwi_vr_teleop` |

## 10. Known gaps and next design increments

1. Implement real follower factory/adapter for dashboard-launched VR LeKiwi.
2. Replace mobile mock Connect/Calibrate/Status/Camera/Manual with typed backend API integration.
3. Connect mobile E-stop to authoritative backend E-stop with explicit confirmation and state sync.
4. Add ARCore native 6DoF only if Android is a committed requirement.
5. Define stable canonical web control path, package/dependency lock and source-of-truth for untracked prototype directories.
6. Implement and validate non-blocking dataset recording.
7. Add CI coverage for Python test suite in reproducible LeRobot environment.

## 11. Design acceptance criteria

The design is accepted when each input has a documented owner/control path, all real-motion boundaries have a safety gate, left/right isolation is tested, stale/disconnect handling is demonstrated, configuration is explicit and all claims are tied to code/test/evidence. Hardware readiness requires the separate STD evidence, not this document alone.
