# Tài liệu phần mềm tổng hợp hệ thống SO-101

> Cập nhật: 15/09/2026
> Mục đích: tài liệu nguồn duy nhất cho nhóm Phần mềm, AI, QA, Documentation và Operator. Tài liệu kết hợp định hướng phát triển, Software Design Document, tiến độ, Software Test Document và Software User Guide.
>
> Trạng thái: **canonical document**. Khi cập nhật thiết kế, test result hoặc hướng dẫn vận hành, cập nhật trực tiếp tài liệu này.

## 1. Tóm tắt điều hành

Nhóm đã xây dựng ba hướng teleoperation chính:

1. **Teleop hai cánh tay bằng leader qua web**: nhận dữ liệu điều khiển qua WebSocket, thực hiện IK/safety và có đường chạy với follower thật.
2. **VR teleop**: dùng Meta Quest/WebXR để điều khiển SO-101 hoặc LeKiwi; có clutch, emergency stop, giới hạn chuyển động, telemetry và chế độ mô phỏng.
3. **Phone teleop**: ứng dụng Expo/React Native gửi pose điện thoại qua WebSocket; iPhone development build dùng ARKit để lấy pose 6DoF.

Phần mềm và các seam kiểm thử đã có tương đối đầy đủ. VR LeKiwi hiện đã có đường CHECKIK mở follower được assign/calibrate thật, nhưng chỉ được đánh dấu **hoàn thành trên phần cứng** khi có biên bản chạy thử lặp lại với robot, Quest và iPhone thật.

## 2. Bối cảnh và định hướng

Hệ thống phần mềm là lớp trung gian giữa người vận hành, thiết bị input (leader, Meta Quest, điện thoại), thuật toán điều khiển và hai cánh tay robot SO-101. Đích đến không chỉ là làm robot chuyển động, mà là một nền tảng có thể:

- teleoperate robot an toàn theo thời gian thực;
- trực quan hóa trạng thái robot bằng web/VR digital twin;
- ghi demonstration chuẩn hóa cho nhóm AI;
- kiểm thử các kịch bản thao tác thực tế: pha trà, dọn bàn, xếp đồ và các thao tác nấu ăn an toàn.

Kiến trúc được phát triển theo hướng mô-đun: tầng giao tiếp hardware tách khỏi input operator; URDF/kinematics tách khỏi GLB rendering; safety nằm trong đường lệnh trước robot; và recording tách khỏi control loop để không làm gián đoạn teleoperation.

## 3. Mục tiêu của nhóm Phần mềm

1. Xây dựng lớp điều khiển dựa trên LeRobot, hỗ trợ hai SO-101 độc lập với identity, calibration và safety state riêng.
2. Duy trì Forward Kinematics (FK), Inverse Kinematics (IK) và biến đổi hệ tọa độ có thể kiểm thử từ URDF.
3. Hỗ trợ nhiều nguồn teleoperation: leader qua web, Quest/WebXR và phone pose.
4. Áp dụng safety bắt buộc: joint/workspace limit, giới hạn bước/tốc độ, kiểm tra dữ liệu không hợp lệ, stale input, disconnect, clutch và emergency stop.
5. Hiển thị digital twin/telemetry cho người vận hành khi phù hợp.
6. Chuẩn bị hợp đồng dữ liệu và recording cho nhóm AI.
7. Xây dựng test/evidence để các demo task có thể được đánh giá lặp lại.

## 4. Phạm vi chức năng và giới hạn

| Phạm vi | Mục tiêu | Ranh giới hiện tại |
| --- | --- | --- |
| Robot control | Connect, read observation, gửi target, gripper, hold/stop/disconnect | Chỉ hardware được chỉ định rõ port/device ID mới được mở |
| Kinematics | FK/IK, kiểm giới hạn và mapping input sang robot frame | GLB không là nguồn IK; URDF/chain là nguồn hình học |
| Operator | Web leader, Quest WebXR, iPhone/phone | Android chưa có ARCore native 6DoF |
| Safety | Clutch, timeout, stop, workspace/joint/rate/fault limit | Không thay thế E-stop vật lý hoặc giám sát con người |
| Digital twin | Three.js/GLB, telemetry, camera panels | Không phải bằng chứng hardware command đã thành công |
| Dataset | Chuẩn bị schema/evidence và điểm tích hợp recording | Chưa xác nhận recorder episode end-to-end trong phạm vi rà soát này |
| Task ứng dụng | Pha trà, dọn bàn, xếp đồ, nấu ăn an toàn | Là kịch bản nghiệm thu/AI roadmap, không phải tính năng tự động đã hoàn thành |

## 5. Kiến trúc và nguyên tắc thiết kế

```text
Leader web ───┐
Meta Quest ──┼──> WebXR/WebSocket/phone protocol ──> Python control plane
Phone ───────┘                                          │
                                                        ├─ Coordinate transform
                                                        ├─ Teleop state + clutch
                                                        ├─ FK / IK
                                                        ├─ Safety layer
                                                        ├─ Recorder / telemetry
                                                        ▼
                                                  LeRobot / adapter
                                                   │             │
                                             SO-101 left    SO-101 right

Three.js + GLB <──── joint state / command-vs-measured telemetry ────┘
URDF / SO-101 chain ─── nguồn hình học cho FK, IK và giới hạn khớp
```

### 5.1 Luồng điều khiển chung

```text
Input pose/button → validate protocol → relative reference/clutch
→ coordinate transform → target end-effector → IK/FK validation
→ workspace + joint + step/rate checks → follower action → observation/telemetry
```

Robot không nhận trực tiếp pose tuyệt đối từ Quest hoặc phone. Khi clutch được bật, hệ thống chốt pose input và pose robot làm reference; lệnh tiếp theo là độ dịch chuyển tương đối. Thiết kế này giúp tránh jump ở frame đầu và cho phép người vận hành đổi tư thế khi clutch tắt.

### 5.2 Vai trò của các thành phần

| Thành phần | Trách nhiệm |
| --- | --- |
| LeRobot/follower adapter | Giao tiếp servo, observation/action, lifecycle phần cứng. |
| URDF + kinematics | Mô hình link/joint, FK/IK và xác nhận nghiệm IK. |
| Python backend | Mapping frame, teleop state, safety, lifecycle và protocol validation. |
| WebXR/WebSocket | Thu pose/controller state thời gian thực, relay telemetry/status. |
| Three.js + GLB | Digital twin và hỗ trợ quan sát; không tính IK từ mesh. |
| Mobile Expo + ARKit | Phone operator surface, pose tracking iOS, protocol client. |
| CHECKIK | Dashboard/control plane: cấu hình, readiness và quản lý process. |

## 6. Quan hệ với nhóm AI và các task ứng dụng

Teleoperation là công cụ tạo demonstration, không chỉ là UI điều khiển. Nhóm Phần mềm chịu trách nhiệm cung cấp input/action an toàn, timestamp, trạng thái robot và evidence; nhóm AI dùng demonstration đã chuẩn hóa để huấn luyện/evaluate policy.

| Task | Giá trị kiểm thử | Dữ liệu nên ghi |
| --- | --- | --- |
| Pha trà | Chuỗi thao tác, grasp/place, phối hợp hai tay | camera, pose EE, gripper, action, bước task, success/failure |
| Dọn bàn | Pick-and-place nhiều vật, reset và workspace | object/task ID, target zone, joint/action, số vật thành công |
| Xếp đồ | Độ lặp lại, độ chính xác, thứ tự thao tác | pose vật thể, thứ tự, vị trí đặt, lỗi va chạm |
| Nấu ăn an toàn | Sequencing nhiều bước và bimanual coordination | chỉ dùng vật/dụng cụ không nóng, metadata safety, episode state |

Mỗi episode demo nên có tối thiểu: timestamp, episode/task ID, camera RGB (và depth nếu có), joint position/velocity, end-effector pose, gripper state, pose/button input operator, action thực tế gửi đi, trạng thái safety, kết quả success/failure và metadata cấu hình. Recording không được làm chậm control loop hoặc làm mất cơ chế safety.

## 7. Lộ trình phát triển và đối chiếu hiện trạng

| Giai đoạn định hướng | Mục tiêu | Hiện trạng |
| --- | --- | --- |
| 1. Kinematics core | FK/IK offline, xác nhận FK(IK(target)) | Có mã và test seams; cần lưu kết quả regression chính thức |
| 2. Cartesian control | Một SO-101 nhận Cartesian target an toàn | Có control path; cần evidence hardware lặp lại |
| 3. WebXR prototype | Quest đọc pose trái/phải | Có WebXR relay/operator surface |
| 4. VR single-arm | Relative/clutch control cho một SO-101 | Có runtime local và fake/real path |
| 5. Bimanual VR | Hai controller điều khiển hai arm | Có implementation/test seam; cần hardware acceptance |
| 6. Digital twin | Đồng bộ model với joint state | Có assets/UI; cần xác nhận với telemetry hardware |
| 7. Dataset recording | Ghi demonstration chuẩn hóa | Mới ở định hướng/hợp đồng dữ liệu; cần hoàn thiện E2E |
| 8. Task integration | Pha trà, dọn bàn, xếp đồ, nấu ăn an toàn | Chưa nghiệm thu như task automation |

## 8. Phạm vi và thuật ngữ

| Thuật ngữ | Ý nghĩa trong tài liệu |
| --- | --- |
| SO-101 | Cánh tay robot follower/leader dùng servo SO-101. |
| Follower | Cánh tay nhận lệnh và tạo chuyển động vật lý. |
| Leader | Cánh tay thiết bị đầu vào; góc khớp leader được dùng làm mục tiêu cho follower. |
| CHECKIK | Dashboard/control plane quản lý cấu hình, process, Start/Stop/E-stop/Unlock. |
| VRTeleop / VR LeKiwi | Operator surface và control loop WebXR cho Quest. |
| Clutch/deadman | Cơ chế giữ nút để có quyền điều khiển; nhả nút thì robot giữ vị trí. |
| Fake/offline | Không mở cổng serial, không ra lệnh phần cứng; chỉ kiểm tra logic/transport. |
| Hardware E2E | Một ca kiểm thử hoàn chỉnh trên thiết bị thật, có log và kết quả quan sát. |

## 9. Kiến trúc hiện tại của các luồng teleoperation

```text
                         ┌───────────────────────┐
                         │ Operator surfaces     │
                         │ Web / Quest / Phone   │
                         └──────────┬────────────┘
                                    │ WebSocket / WebXR
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
             ▼                      ▼                      ▼
     Web leader/VR server      LeKiwi VR relay        Phone protocol v1
             │                      │                      │
             └──────────────────────┴──────────────────────┘
                                    │
                                    ▼
                    Mapping → clutch → safety → IK
                                    │
                                    ▼
                          SO-101 follower(s)
```

Nguyên tắc chung: dữ liệu input không được gửi thẳng xuống servo. Mọi luồng phải đi qua kiểm tra freshness, clutch, giới hạn workspace/joint và giới hạn tốc độ trước khi thành lệnh follower.

## 10. Hạng mục đã thực hiện

### 4.1 Teleop hai cánh tay bằng leader qua web

**Mục tiêu.** Điều khiển follower trái/phải từ leader tương ứng qua giao diện web/WebSocket, đảm bảo hai kênh điều khiển độc lập.

**Thành phần hiện có.**

- Backend nhận packet điều khiển, giữ packet mới nhất để tránh phát lại backlog khi mạng jitter.
- Luồng offline để xác minh mapping, FK/IK và giao thức mà không chạm hardware.
- Luồng real để mở follower được chỉ định, xử lý input VR/phone và điều khiển ở tần số cố định.
- Kiểm tra thứ tự sequence, timestamp, stale input, joint limit, workspace và giải phóng clutch khi client mất kết nối.
- Test fake bridge, IK, FK, offline dual-arm và phone protocol.

**Vị trí mã nguồn.**

- `web/checkIk/dual_arm_vr_teleop/backend/real_vr_teleop_server.py`
- `web/checkIk/dual_arm_vr_teleop/backend/offline_teleop_server.py`
- `web/checkIk/dual_arm_vr_teleop/backend/leader_teleop_worker.py`
- `web/checkIk/dual_arm_vr_teleop/tests/`

**Kết quả cần thu thập để báo cáo.**

- Video leader trái/phải điều khiển đúng follower trái/phải.
- Log port, device ID, calibration và thời điểm connect/disconnect.
- Ít nhất 10 chu kỳ: Start → clutch → chuyển động nhỏ → nhả clutch → Stop.
- Kết quả test single arm và dual arm; phải chứng minh một tay không gửi lệnh cho tay còn lại.

### 4.2 VR teleop qua Meta Quest/WebXR

**Mục tiêu.** Dùng Meta Quest Browser làm thiết bị operator, không cần APK/Unity cho WebXR browser surface.

**Chức năng hiện có.**

- Đọc pose controller/hand tracking từ WebXR.
- Mapping vị trí controller sang TCP robot; trigger/grip điều khiển gripper và clutch.
- STOP dạng latch và thao tác unlock có chủ ý.
- Hold latch, input timeout, giới hạn workspace, giới hạn bước end-effector và joint-step limit.
- Hiển thị video/telemetry, pose lệnh và pose đo được trên giao diện Quest.
- Relay HTTP(S)/WebSocket, endpoint health `/api/status`, fake headset và fake follower để kiểm tra offline.
- Đường local SO-101 có cờ `--real --robot-port ...`; phải chỉ định port rõ ràng, không auto-discovery.

**Vị trí mã nguồn.**

- `web/checkIk/VRTeleop/lekiwi-vr-teleop/lekiwi_vr_teleop/`
- `web/checkIk/VRTeleop/lekiwi-vr-teleop/tests/`
- `web/checkIk/VRTeleop/lekiwi-vr-teleop/README.md`

**Trạng thái VR LeKiwi qua CHECKIK.**

Dashboard có process boundary, mode `left-only`, `right-only`, `dual-arm`, readiness payload, health check relay và real follower factory. CHECKIK chỉ truyền port/device ID đã assign/calibrate, không auto-discovery. Trạng thái đúng là:

| Nội dung | Trạng thái |
| --- | --- |
| WebXR relay, HTTPS, status/ready handshake | Có ở code và có test seam |
| Mode một tay/hai tay và cách ly key trái/phải | Có ở code/test fake và real adapter path |
| Dashboard Start/Stop/E-stop/Unlock | Có cơ chế quản lý process |
| Follower thật qua dashboard VR LeKiwi | Đã có control path; cần test hardware E2E |
| Mobile-base LeKiwi trong phase dashboard | Ngoài phạm vi phase hiện tại |

Đường hardware yêu cầu dashboard chạy với `--hardware --enable-motion`, follower được assign/calibrate và motion lock đã Unlock. Chưa dùng cụm từ “đã nghiệm thu hardware” cho tới khi có biên bản E2E.

### 4.3 Phone teleop

**Mục tiêu.** Dùng điện thoại điều khiển một SO-101 qua pose tương đối, với cơ chế nhấn-giữ để tránh robot chạy ngoài ý muốn.

**Ứng dụng mobile đã có.**

- Màn hình `PhoneTeleopScreen`: nhập IP/port, chọn left/right arm, trạng thái kết nối/tracking, recenter, E-stop UI, control pad và motion control.
- WebSocket protocol version 1: `hello`, `phone_pose`, `control_disabled`, `recenter`.
- Gửi pose ở 20 Hz khi control đang active; sequence và session ID được gắn vào packet.
- Gripper dùng thao tác slide trong lúc giữ điều khiển; backend tích phân thành trigger.
- Background app, mất socket, mất tracking hoặc nhả nút điều khiển đều thu hồi quyền điều khiển.

**Tracking theo nền tảng.**

| Nền tảng | Nguồn pose | Mức sẵn sàng |
| --- | --- | --- |
| iPhone development build | ARKit `ARWorldTrackingConfiguration`, camera-backed 6DoF | Dùng được để kiểm thử hardware sau khi build/sideload và xác nhận thực tế |
| Expo Go trên iPhone | DeviceMotion fallback | Chỉ UI/protocol, không dùng cho teleop chính xác |
| Android | DeviceMotion fallback | Chưa có ARCore 6DoF native; không production-ready |

**Vị trí mã nguồn.**

- `apps/mobile/src/screens/PhoneTeleopScreen.tsx`
- `apps/mobile/src/services/usePoseSender.ts`
- `apps/mobile/modules/expo-phone-ar/ios/PhoneARView.swift`
- `web/checkIk/VRTeleop/lekiwi-vr-teleop/lekiwi_vr_teleop/phone.py`
- `web/checkIk/dual_arm_vr_teleop/backend/phone_protocol.py`
- `.github/workflows/mobile-ios-development.yml`

**Lưu ý triển khai.** iOS native module không chạy trong Expo Go. Cần IPA development/unsigned được ký và sideload, bật Developer Mode, cấp Camera/Motion/Local Network permission, rồi mới đánh giá ARKit tracking.

### 10.4 Ứng dụng mobile OmniArm

**Vai trò.** `apps/mobile` là ứng dụng Expo/React Native dành cho operator ở thiết bị di động. Ứng dụng hiện cung cấp trải nghiệm onboarding, điều hướng, quan sát trạng thái và các màn hình hỗ trợ setup/teleop. Phone Teleop là luồng đã có WebSocket điều khiển thực sự; phần lớn các màn hình quản trị còn lại là UI prototype/mock, chưa đồng bộ với dashboard backend hoặc robot thật.

**Cấu trúc hiện có.**

| Nhóm màn hình | Chức năng hiện có | Trạng thái dữ liệu |
| --- | --- | --- |
| Onboarding + Global Chrome | Giới thiệu, lưu trạng thái hoàn thành onboarding, theme/accessibility, modal E-STOP/reset | Hoàn thiện UI; E-STOP là state cục bộ của app, chưa gọi API safety backend |
| Home | Điểm vào Connect, Calibrate, Teleop, Phone Teleop, Camera | Dữ liệu robot/trạng thái là mock |
| Connect | UI quét/chọn cổng và luồng setup | Danh sách port mock; chưa scan serial thật qua backend |
| Calibrate | UI chọn arm/motor và quan sát calibration range | Motor samples/port là mock; chưa gọi calibration hardware |
| Teleop | Manual/leader control UI, profile/gate và joint feedback | Gate, joint position và motion hiển thị là mock |
| Phone Teleop | Kết nối WebSocket, chọn arm, hold-to-control, recenter, gripper slide, camera/motion view | Có client protocol thật; hardware E2E cần evidence |
| Camera | UI chọn stream/preview | Hiện ghi rõ mock preview |
| Status | Health/safety/firmware matrix | `MOCK_STATE`, telemetry mock; chưa poll backend status thật |

**Luồng Phone Teleop trong mobile.**

```text
PhoneARView (ARKit iOS) hoặc DeviceMotion fallback
  → PhoneTeleopScreen: reference pose + hold-to-control + gripper slide
  → WebSocket /ws: hello → phone_pose 20 Hz → control_disabled/recenter
  → Python teleop server: validate → mapping → safety/IK → follower
```

**Điểm đã hoàn thành ở mobile.**

- Navigation gồm Home, Control stack, Camera và Status; có onboarding và hỗ trợ Reduce Motion.
- Phone Teleop có chọn arm left/right trước khi kết nối, session ID/sequence, protocol version, reconnect/disconnect handling và trạng thái tracking.
- Khi app background, socket lỗi, socket đóng, tracking lost hoặc nhả hold, client thu hồi control và gửi disable nếu có thể.
- ARKit module cục bộ có `ARWorldTrackingConfiguration`; CI iOS prebuild/autolink/archive unsigned IPA đã được định nghĩa.
- `npm run typecheck` và hai test Node của pose sender/gripper slide đã pass trong lần rà soát ngày 15/09/2026.

**Khoảng trống mobile cần ghi rõ trong báo cáo.**

1. Chưa có lớp mobile API client chung tới CHECKIK/backend cho Connect, Calibration, Status, Camera và E-stop.
2. E-STOP trên `GlobalChrome` hiện chỉ khóa state trong app UI; chưa phải E-stop hardware/backend authoritative.
3. Connect, Calibrate, manual Teleop, Home, Status và Camera đang có mock data/mock behavior; không mô tả là điều khiển/monitoring robot thật.
4. Android chưa có native ARCore 6DoF; DeviceMotion không đủ cho precision teleoperation.
5. Cần chạy iOS workflow, sign/sideload IPA và test permission, network, ARKit loss/relocalization trên iPhone thật.

**Vị trí mã nguồn chính.**

- `apps/mobile/App.tsx` và `apps/mobile/src/navigation/AppNavigator.tsx`
- `apps/mobile/src/screens/PhoneTeleopScreen.tsx`
- `apps/mobile/src/screens/ConnectScreen.tsx`, `CalibrateScreen.tsx`, `TeleopScreen.tsx`, `CameraScreen.tsx`, `StatusScreen.tsx`
- `apps/mobile/modules/expo-phone-ar/ios/PhoneARView.swift`
- `.github/workflows/mobile-ios-development.yml`

### 10.5 Web application, dashboard và operator surfaces

Web hiện không phải một ứng dụng duy nhất; có ba vai trò cần tách rõ trong báo cáo để tránh nhầm dashboard quản trị với WebXR operator.

| Surface | Công nghệ/vị trí | Vai trò | Trạng thái |
| --- | --- | --- | --- |
| Laptop dashboard CHECKIK | Vite/React tại `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564` | Quản lý port/device, calibration, camera discovery, task lifecycle, Start/Stop/E-stop/Unlock, chọn VR mode | Có frontend gọi dashboard API; cần hardware E2E và chuẩn hóa frontend source/template |
| Quest WebXR operator | `web/checkIk/dual_arm_vr_teleop/frontend` và VRTeleop web assets | Lấy pose Quest/controller/hand, render digital twin, gửi packet teleop, hiển thị VR state | Có offline/real control path; cần acceptance Quest + hardware |
| WebXR laboratory/prototype | `web/checkIk/webxr` | Môi trường 3D/lab, asset GLB và prototype trực quan hóa | Prototype; không phải control-plane canonical |

**Dashboard CHECKIK hiện làm được.**

- Đọc `/api/status`, quản lý snapshot UI và gọi API cho assign port, calibration, camera scan, leader/single/VR tasks, Stop, E-stop và Unlock.
- Có route riêng cho offline VR (`/api/tasks/vr-offline`), real VR (`/api/tasks/vr-real`) và VR LeKiwi (`/api/tasks/vr-lekiwi`).
- Có luồng recovery cho leader/single teleop, task logs, hiển thị operator URL và camera stream qua backend.
- Backend khởi động với real motion bị khóa; yêu cầu motion authorization, assignment/calibration và xác nhận Unlock trước real task.

**Giới hạn web/dashboard.**

- `vr_lekiwi` chỉ mở follower thật khi dashboard chạy hardware-enabled, motion unlocked và preflight assignment/calibration/availability pass; health pass vẫn không thay thế hardware E2E evidence.
- Web dashboard là một frontend generated/template và còn nằm trong vùng `web/checkIk` chưa được track đầy đủ trong Git; cần chốt source-of-truth, dependency lock và quy trình build trước khi coi là sản phẩm phát hành.
- Từng WebXR surface có runtime/port riêng; team phải ghi rõ operator URL và process đang chạy trong evidence, tránh kết luận nhầm offline bridge là real bridge.
- Dashboard API chỉ được dùng trên local/trusted network; chưa có scope cloud authentication/multi-user authorization.

**Test web cần bổ sung.**

| ID | Kiểm tra | Kỳ vọng |
| --- | --- | --- |
| WEB-01 | Dashboard tải `/api/status` khi backend healthy | State/UI khớp snapshot, lỗi mạng hiển thị rõ |
| WEB-02 | Assign port + calibrate qua dashboard | Backend trả kết quả, UI không tự đánh dấu success khi task fail |
| WEB-03 | Start offline VR | Operator URL xuất hiện, relay health pass, không mở LeRobot/serial |
| WEB-04 | Start real VR sau unlock hợp lệ | Chỉ process được dashboard phê duyệt chạy; có log mode/arm/port |
| WEB-05 | Stop/E-stop/Unlock | UI và backend đều phản ánh lock/lifecycle chính xác |
| WEB-06 | Quest disconnect/stale tracking | Dashboard có failure/lifecycle rõ; arm đi vào hold/safe cleanup |
| WEB-07 | Reload dashboard giữa task | Không tạo task/hardware process thứ hai; snapshot khôi phục đúng |

### 10.6 Interface, deployment và traceability

**Interface boundary.**

| Boundary | Input | Output | Xử lý lỗi/safety |
| --- | --- | --- | --- |
| Quest ↔ relay | Controller/hand pose, button state | Telemetry, camera, status | Stale hoặc disconnect phải release clutch. |
| Phone ↔ teleop server | Protocol v1 JSON | `hello_ack`, `phone_status`, error | Reject schema/sequence/timestamp sai. |
| Dashboard ↔ backend | Local HTTP JSON | Status/task snapshot/operator URL | Motion lock và preflight gate real task. |
| Control ↔ follower | Bounded joint action | Measured observation | Connect/action fail tạo fault/cleanup. |
| Recorder ↔ AI | Observation/action/metadata có timestamp | Episode artifact | Không được làm backlog control loop. |

**Deployment topology.**

| Thành phần | Cách triển khai | Cấu hình phải lưu trong evidence |
| --- | --- | --- |
| Mobile | Expo development build hoặc signed/sideload iOS IPA | App version, host/port, permission/tracking state. |
| Dashboard backend | Python local service | Commit, host/port, motion-lock state, selected task. |
| Laptop dashboard | Vite/React web app | Backend URL, browser/version. |
| Quest operator | Quest Browser qua HTTPS/ADB relay | Operator URL, certificate mode, arm/mode. |
| Robot runtime | LeRobot environment | Device ID, stable serial port, calibration, runtime version. |

Certificate private key, Wi-Fi credential, serial identity nhạy cảm, token hoặc dữ liệu cá nhân không được commit hay đưa nguyên văn vào evidence công khai.

**Traceability source code.**

| Năng lực | Source chính |
| --- | --- |
| Mobile routing/phone UI | `apps/mobile/App.tsx`, `src/navigation/AppNavigator.tsx`, `src/screens/PhoneTeleopScreen.tsx` |
| iOS ARKit / build | `modules/expo-phone-ar/ios/PhoneARView.swift`, `.github/workflows/mobile-ios-development.yml` |
| CHECKIK dashboard/backend | `web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564`, `dual_arm_vr_teleop/backend/dashboard_server.py` |
| Web leader/real-offline bridge | `web/checkIk/dual_arm_vr_teleop/backend/*teleop_server.py` |
| VR LeKiwi / relay | `web/checkIk/VRTeleop/lekiwi-vr-teleop/lekiwi_vr_teleop/` |

### 10.7 Software User Guide — vận hành an toàn

#### 10.7.1 Chọn đúng mode

| Nhu cầu | Chế độ dùng | Giới hạn |
| --- | --- | --- |
| Kiểm mapping/VR không chạm robot | Offline/fake relay | Không mở serial/LeRobot. |
| Leader điều khiển follower | Dashboard leader teleop | Cần assignment, calibration, preflight. |
| Quest điều khiển SO-101 | VR Control/local SO-101 runtime | Bắt đầu fake trước hardware. |
| Phone điều khiển một arm | Phone Teleop + compatible server | iPhone ARKit build cho 6DoF. |
| Kiểm contract VR LeKiwi dashboard | VR LeKiwi | Có fake/offline mode; real mode yêu cầu hardware preflight. |

#### 10.7.2 Preflight trước session hardware

1. Dọn vùng làm việc, đặt robot ở rest pose và bố trí người quan sát cạnh nguồn/E-stop vật lý.
2. Xác nhận đúng leader/follower bằng đường dẫn ổn định:

```bash
ls -l /dev/serial/by-id/
```

3. Kiểm calibration profile, device ID và mapping left/right; không suy luận qua `ttyACM0`/`ttyACM1`.
4. Chạy fake/offline sau mọi thay đổi mapping/safety. Chỉ mở hardware khi hướng mapping đã đúng.
5. Lưu commit SHA, runtime version, mode, IP/port, người test và người quan sát vào evidence.

#### 10.7.3 Vận hành laptop dashboard CHECKIK

Khởi động ở trạng thái an toàn (real motion locked):

```bash
cd web/checkIk
source .venv/bin/activate
python dual_arm_vr_teleop/backend/dashboard_server.py
```

Quy trình: mở dashboard → kiểm `/api/status` → assign port đúng arm → calibrate/read-only check → chọn task → chỉ Unlock/Start khi preflight hoàn tất → ghi operator URL/mode/active arm → Stop sau session.

- **Stop** kết thúc session có kiểm soát và cleanup runtime.
- **E-stop** dừng task và latch motion lock.
- **Unlock** là thao tác riêng; sau unlock phải preflight lại.

Không chạy bridge real trực tiếp nếu dashboard là control plane quản lý session đó.

#### 10.7.4 Vận hành Quest VR

Offline verification:

```bash
cd web/checkIk/VRTeleop/lekiwi-vr-teleop
lekiwi-vr-relay --port 8443
python tools/fake_headset.py --seconds 5
```

Khi chạy Quest: mở operator URL do runtime/dashboard trả về, Enter VR, recenter, chọn arm/mode đúng, giữ clutch/deadman và thực hiện chuyển động rất nhỏ. Nhả clutch để hold; dùng STOP/E-stop khi có nguy cơ. Khi mất Wi-Fi, tracking hoặc đóng tab, không reconnect ngay — kiểm tra robot đã hold trước.

Ví dụ local SO-101 real mode (chỉ dùng sau preflight):

```bash
so101-vr-teleop --host 0.0.0.0 --port 8443 \
  --cert certs/cert.pem --key certs/key.pem --arms left \
  --real --robot-id <follower-id> --robot-port /dev/serial/by-id/<follower>
```

Thay placeholder bằng identity đã xác nhận và đối chiếu README runtime cho flag mapping/certificate hiện hành.

#### 10.7.5 Vận hành Phone Teleop

1. Dùng iPhone development build đã signed/sideload nếu test precision 6DoF; Expo Go không tải native ARKit module.
2. Cấp Camera, Motion, Local Network permission; phone và server ở trusted network.
3. Trong Phone Teleop, nhập host/port từ runtime, chọn arm trước Connect và chờ `CONNECTED`/tracking hợp lệ.
4. Recenter, sau đó giữ control và dịch phone chậm. Slide UI điều khiển gripper.
5. Nhả control trước khi đổi tư thế, background app hoặc bàn giao operator.

Nếu tracking lost, socket lỗi hoặc app background, robot phải được kiểm tra hold trước khi reconnect/recenter. Android/DeviceMotion chỉ dành cho UI/protocol test, không chứng nhận precision teleop.

#### 10.7.6 Troubleshooting

| Hiện tượng | Hành động đầu tiên | Cách xử lý tiếp |
| --- | --- | --- |
| Robot đi sai chiều | Nhả clutch/Stop | Quay lại fake mode, kiểm transform từng axis. |
| Robot jump lúc bắt đầu | Nhả clutch/E-stop nếu cần | Kiểm seed/reference/recenter; dừng hardware test. |
| Quest/phone mất kết nối | Không reconnect vội | Xác nhận hold, kiểm network rồi recenter. |
| Dashboard locked | Không bypass | Kiểm E-stop/task cũ, Unlock và preflight lại. |
| ARKit không hoạt động | Dừng precision test | Kiểm development IPA, permission, device support. |
| Port busy/sai | Không đoán port | Dùng `/dev/serial/by-id/`, cleanup stale process, assign lại. |
| VR LeKiwi báo Ready | Kiểm mode/driver/log | Xác nhận `driver: real`, assigned arm và hardware evidence trước khi kết luận motion thật. |

#### 10.7.7 Đóng session

Nhả clutch → Stop/E-stop theo tình huống → xác nhận follower state/disconnect → lưu log, configuration, video, screenshot và PASS/FAIL evidence → ghi anomaly trước session kế tiếp. Chỉ tắt nguồn khi robot ở trạng thái an toàn.

## 11. Ma trận mức độ hoàn thành

Ký hiệu: **Có** = đã có code; **Đã kiểm chứng** = có kết quả test/run lưu kèm; **Chưa xác nhận** = cần người kiểm thử chạy và ghi evidence.

| Luồng | Code | Test tự động | Hardware E2E | Kết luận báo cáo |
| --- | ---: | ---: | ---: | --- |
| Web leader → một follower | Có | Có test seam | Chưa xác nhận trong tài liệu này | Có prototype/control path |
| Web leader → hai follower | Có | Có test seam | Cần nộp evidence | Có implementation, chờ nghiệm thu hardware |
| Quest VR → local SO-101 | Có | Có test seam | Cần nộp evidence | Có đường chạy thật, chưa thay thế biên bản hardware |
| Quest VR → LeKiwi qua ZMQ | Có | Có test seam | Cần nộp evidence | Có implementation độc lập |
| CHECKIK → VR LeKiwi | Có real adapter/control path | Có fake/offline test | Cần nộp evidence | Chờ nghiệm thu hardware E2E |
| Phone → real teleop server | Có | Protocol/fake test | Cần nộp iPhone + arm evidence | Có implementation, chưa nghiệm thu E2E |
| Mobile shell, Connect/Calibrate/Manual/Status/Camera | Có UI | Typecheck | Không áp dụng cho mock UI | Chưa nối backend/robot thật, trừ Phone Teleop |
| Laptop CHECKIK dashboard | Có UI + API integration | Có test seam backend | Cần nộp evidence | Có control plane, cần xác nhận hardware/lifecycle |
| Quest WebXR operator UI | Có | Offline relay/test seam | Cần Quest + arm evidence | Có operator surface, chờ acceptance |
| Phone Android 6DoF | Không | Không | Không | Chưa thực hiện |
| iOS build artifact | Có workflow | Typecheck có thể chạy | Cần kiểm tra workflow run | Chưa coi là release cho đến khi có artifact |

## 12. Kế hoạch kiểm thử

### 12.1 Mức kiểm thử

| Mức | Mục tiêu | Không được thiếu |
| --- | --- | --- |
| T1 — static/unit | Xác minh mapping, protocol, validation, gripper, lifecycle | Typecheck, unit tests, Python compile/import |
| T2 — offline integration | WebSocket/relay/IK chạy không chạm robot | Fake follower/headset, health endpoint, stale/disconnect |
| T3 — hardware smoke | Xác minh kết nối và chuyển động nhỏ an toàn | Port đúng, calibration, E-stop vật lý, người quan sát |
| T4 — acceptance | Xác nhận luồng vận hành lặp lại và lỗi an toàn | Video, log, checklist ký nhận |

### 12.2 Tiền điều kiện chung trước mọi test hardware

1. Robot được đặt trong vùng trống, cánh tay ở tư thế an toàn; người thử đứng cạnh nguồn để ngắt điện khi cần.
2. Xác nhận follower/leader bằng đường dẫn ổn định `/dev/serial/by-id/`, không suy luận qua `ttyACM0`/`ttyACM1`.
3. Xác nhận calibration phù hợp cho từng arm và left/right device ID không bị đảo.
4. Chạy fake/offline trước; chỉ chuyển `--real` hoặc bật hardware sau khi mapping đúng chiều.
5. Kiểm tra STOP, nhả clutch và mất kết nối đều tạo hold; không thử vận tốc lớn ở lần đầu.
6. Lưu log terminal, ảnh cấu hình, commit SHA, version LeRobot, serial port, IP/port và người kiểm thử.

### 12.3 Test cases bắt buộc

#### A. Leader web — hai cánh tay

| ID | Bước thực hiện | Kỳ vọng |
| --- | --- | --- |
| LDR-01 | Khởi động offline server, gửi packet left/right hợp lệ | IK trả kết quả cho đúng các hand active; không ra hardware command |
| LDR-02 | Chỉ bật leader trái, di chuyển nhỏ | Chỉ follower trái nhận action |
| LDR-03 | Chỉ bật leader phải, di chuyển nhỏ | Chỉ follower phải nhận action |
| LDR-04 | Bật cả hai leader, di chuyển theo hai chiều khác nhau | Hai follower độc lập, không cross-command |
| LDR-05 | Gửi duplicate/out-of-order sequence | Packet bị reject, không tạo action mới |
| LDR-06 | Ngắt WebSocket khi đang clutch | Clutch release/hold xảy ra ngay, không replay packet cũ |
| LDR-07 | Gửi pose ngoài workspace/joint limit | Target bị từ chối/clamp theo policy, không vượt giới hạn |

#### B. VR teleop

| ID | Bước thực hiện | Kỳ vọng |
| --- | --- | --- |
| VR-01 | Chạy relay fake, kết nối Quest hoặc fake headset | Relay listening, `/api/status` healthy, nhận tracking |
| VR-02 | Nhấn clutch ở tư thế rest | Command đầu tiên trùng measured pose, robot không jump |
| VR-03 | Nhả clutch | Arm giữ vị trí hiện tại |
| VR-04 | Dừng gửi tracking quá timeout | Quyền motion bị thu hồi và arm hold |
| VR-05 | Nhấn STOP | STOP latch tức thời, không còn command chuyển động |
| VR-06 | Thử unlock theo thao tác yêu cầu | Chỉ mở lại sau đúng thao tác, không unlock do nhấn nhầm |
| VR-07 | Local follower thật: dịch Quest từng trục nhỏ | TCP di chuyển đúng chiều và nằm trong workspace |
| VR-08 | Hai tay: vận hành từng tay rồi cùng lúc | Arm mode và action routing đúng left/right |
| VR-09 | Đóng tab/mất Wi-Fi Quest khi clutch | Hold, disconnect sạch, không có lệnh tồn đọng |

#### C. Phone teleop

| ID | Bước thực hiện | Kỳ vọng |
| --- | --- | --- |
| PH-01 | Mở app, kết nối host/port hợp lệ | Nhận `hello_ack`, UI hiện CONNECTED |
| PH-02 | Gửi pose trước `hello` hoặc sai protocol version | Server reject, không có robot action |
| PH-03 | Giữ control, recenter, di chuyển điện thoại rất nhỏ | Robot bắt đầu từ reference pose, không jump |
| PH-04 | Nhả nút control hoặc đưa app vào background | Gửi/áp dụng disable, arm hold |
| PH-05 | Slide gripper lên/xuống | Gripper mở/đóng theo chiều đã quy ước và trong giới hạn |
| PH-06 | Mất ARKit tracking | UI báo lost và motion bị khoá |
| PH-07 | Gửi timestamp/sequence stale | Server reject, không xử lý pose cũ |
| PH-08 | Đổi arm left/right trước connect | Chỉ arm đã chọn có quyền điều khiển |
| PH-09 | iPhone ARKit test, di chuyển theo X/Y/Z | Xác nhận chiều map vào robot bằng bảng evidence |
| PH-10 | Android fallback | Chỉ kiểm UI/protocol; không cấp chứng nhận precision teleop |

#### D. CHECKIK VR LeKiwi

| ID | Bước thực hiện | Kỳ vọng hiện tại |
| --- | --- | --- |
| CK-01 | Start left-only fake session | Readiness ghi đúng active arm và operator URL |
| CK-02 | Start dual-arm real session sau preflight | Hai follower assign/calibrate connect/seed trước READY |
| CK-03 | Stop/E-stop/Unlock | Process/replay relay được dừng; motion lock hoạt động |
| CK-04 | Mất relay / health fail | Dashboard không đánh dấu Ready |
| CK-05 | Hardware integration | Dashboard mở đúng follower thật, VR motion/hold/Stop/E-stop pass và có evidence |

## 13. Lệnh kiểm thử tham khảo

Chạy từ repository `se/`.

```bash
# Mobile: kiểm TypeScript và các test Node hiện có
cd apps/mobile
npm run typecheck
node --test tests/pose-sender.test.cjs tests/gripper-slide.test.cjs
```

```bash
# Python: chạy sau khi môi trường LeRobot đã có pytest và dependencies của package
cd web/checkIk/VRTeleop/lekiwi-vr-teleop
PYTHONPATH=. <python-lerobot> -m pytest -q
```

```bash
# VR relay offline/fake — không mở serial robot
cd web/checkIk/VRTeleop/lekiwi-vr-teleop
lekiwi-vr-relay --port 8443
python tools/fake_headset.py --seconds 5
```

Lệnh chạy phần cứng phải lấy từ README của từng runtime, dùng port/device ID thực tế đã xác nhận. Không copy lệnh mẫu rồi chạy `--real` khi chưa hoàn thành checklist an toàn ở mục 12.2.

## 14. Evidence bắt buộc cho mỗi ca nghiệm thu

Mỗi test T3/T4 tạo một thư mục evidence theo mẫu:

```text
evidence/<YYYY-MM-DD>/<flow>-<test-id>/
  README.md                 # người test, commit SHA, kết quả PASS/FAIL
  terminal.log              # stdout/stderr đã che thông tin nhạy cảm
  configuration.json        # mode, arm, IP đã ẩn nếu cần, device ID/port
  video.mp4 hoặc video-link.txt
  screenshots/
  observations.md           # độ trễ cảm nhận, lỗi, hành động recovery
```

`README.md` của evidence cần có: mục tiêu, precondition, từng bước, expected/actual result, thời gian, người quan sát, quyết định PASS/FAIL và defect link nếu FAIL.

## 15. Chỉ số cần ghi trong báo cáo cuối

- Tỷ lệ pass theo test suite và theo test case hardware.
- Số lần Start/Stop/E-stop/Unlock thành công.
- Thời gian từ lúc input dừng đến hold (quan sát/log); không tự tuyên bố latency nếu chưa đo đúng phương pháp.
- Tỷ lệ reconnect Quest/phone thành công.
- Số lỗi stale input, packet reject, workspace/joint clamp trong test.
- Kết quả left/right isolation và tỷ lệ command routing đúng.
- Phiên bản firmware/LeRobot/app, commit SHA và cấu hình thiết bị ứng với mỗi kết quả.

## 16. Hạng mục còn lại trước khi gọi là hoàn chỉnh

1. Viết và chạy integration test cho real adapter: connect, seed measured pose, send action, disconnect, cleanup khi một arm fail.
3. Thực hiện và lưu evidence T3/T4 cho leader dual-arm, Quest VR và phone iPhone.
4. Chạy iOS workflow thực tế, tải artifact, sign/sideload, xác nhận ARKit trên iPhone vật lý.
5. Nếu Android là scope chính thức: triển khai ARCore 6DoF native, frame mapping, permission/error handling và test hardware riêng.
6. Đưa Python test suite vào CI hoặc một môi trường reproducible có `pytest`, LeRobot và dependency lock phù hợp.
7. Quyết định đường điều khiển nào là canonical để tránh hai backend/protocol có chức năng chồng lấp nhưng khác safety behavior.

## 17. Phân công đề xuất

| Vai trò | Đầu việc |
| --- | --- |
| Robotics/control | Xác nhận mapping, safety tuning, calibration, hardware adapter và test T3/T4. |
| Mobile | iOS build/sideload, ARKit test, UX lỗi mạng/tracking, Android ARCore nếu được phê duyệt. |
| Backend | Chuẩn hoá process lifecycle, protocol, health/readiness, CI Python và log/evidence format. |
| QA | Duy trì test case mục 12, ghi evidence, regression sau mỗi thay đổi mapping/safety. |
| Documentation | Tổng hợp evidence, biểu đồ pass rate, video demo và các giới hạn chưa hoàn thành. |

## 18. Kết luận dùng cho báo cáo tiến độ

Có thể nêu: **nhóm đã xây dựng và có thể demo các luồng leader-based dual-arm web teleop, VR teleop và phone teleop; hệ thống đã có các lớp safety, protocol validation, offline simulation và test seams.**

Không nên nêu: **toàn bộ các luồng đã production-ready**, vì VR LeKiwi hardware path và các luồng khác vẫn cần kết quả hardware E2E có evidence trước khi nghiệm thu.
