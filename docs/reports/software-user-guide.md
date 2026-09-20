# Software User Guide (SUG)
## Vận hành hệ thống teleoperation SO-101

> Nội dung này đã được hợp nhất vào tài liệu canonical: [Tài liệu phần mềm tổng hợp SO-101](../progress/teleoperation-progress-and-test-plan.md). Giữ file này chỉ để tham chiếu lịch sử.

| Thuộc tính | Nội dung |
| --- | --- |
| Phiên bản | 1.0 — hướng dẫn vận hành baseline |
| Cập nhật | 15/09/2026 |
| Đối tượng | Operator, demonstrator, QA và kỹ sư setup |

## 1. Cảnh báo an toàn

- Chỉ người đã được hướng dẫn mới vận hành robot thật.
- Luôn có người đứng cạnh nguồn/E-stop vật lý, giữ vùng làm việc trống và bắt đầu bằng chuyển động nhỏ.
- Không chạy `--real` hoặc unlock motion khi chưa xác nhận port, arm identity và calibration.
- Không dùng mobile UI E-STOP như E-stop phần cứng: hiện nó chỉ khóa giao diện cục bộ.
- Khi có hành vi bất thường: nhả clutch/hold, dùng Stop hoặc E-stop dashboard, ngắt nguồn khi cần; không cố gắng tiếp tục input.

## 2. Chọn đúng chế độ

| Nhu cầu | Chế độ phù hợp | Lưu ý |
| --- | --- | --- |
| Kiểm mapping/VR không chạm robot | Offline/fake relay | Không import/open serial follower. |
| Điều khiển follower bằng leader qua web | Dashboard leader teleop | Cần assignment/calibration/preflight. |
| Quest điều khiển SO-101 | VR Control/local SO-101 runtime | Bắt đầu fake rồi mới hardware. |
| Phone điều khiển một arm | Phone Teleop + compatible server | iPhone ARKit build cho 6DoF; Android fallback chỉ UI/protocol. |
| Kiểm VR LeKiwi qua dashboard | VR LeKiwi | Hiện fake/offline, không hardware operation. |

## 3. Chuẩn bị chung

1. Kết nối leader/follower và xác định đúng thiết bị:

```bash
ls -l /dev/serial/by-id/
```

2. Ghi lại port stable, device ID, arm side và calibration profile.
3. Đặt robot ở tư thế an toàn, bỏ vật cản, bật E-stop vật lý sẵn sàng.
4. Đảm bảo laptop, Quest/phone ở mạng tin cậy; kiểm IP laptop trước khi mở URL.
5. Khởi động offline/fake trước; xác nhận hướng digital twin/mapping.

## 4. Laptop dashboard CHECKIK

### 4.1 Khởi động dashboard an toàn

```bash
cd web/checkIk
source .venv/bin/activate
python dual_arm_vr_teleop/backend/dashboard_server.py
```

Mặc định backend giữ real motion locked. Chỉ dùng `--enable-motion` sau preflight hardware; cờ này không bỏ qua assignment, calibration hoặc Unlock confirmation.

### 4.2 Quy trình vận hành dashboard

1. Mở laptop dashboard và kiểm tra trạng thái backend.
2. Scan/assign follower đúng left/right bằng stable port.
3. Chạy calibration/read-only check cho arm được chọn.
4. Chọn task/mode: leader, single, VR offline hoặc VR real.
5. Với real motion, xác nhận vùng an toàn và Unlock theo UI trước Start.
6. Sau Start, ghi operator URL, mode và active arms vào test log.
7. Kết thúc bằng Stop; dùng E-stop khi có rủi ro hoặc hành vi bất thường.

Không khởi động bridge real trực tiếp nếu workflow dashboard đã yêu cầu dashboard quản lý lifecycle.

### 4.3 Stop, E-stop, Unlock

- **Stop**: kết thúc session có kiểm soát; arm được hold/cleanup/disconnect theo runtime.
- **E-stop**: dừng task và latch motion lock; không được Start lại ngay.
- **Unlock**: thao tác riêng có xác nhận; sau đó phải preflight lại trước Start.

## 5. Quest VR teleoperation

### 5.1 Offline verification

```bash
cd web/checkIk/VRTeleop/lekiwi-vr-teleop
lekiwi-vr-relay --port 8443
python tools/fake_headset.py --seconds 5
```

Hoặc dùng dashboard **Start offline VR bridge**. Xác nhận relay health và digital twin trước khi chuyển hardware.

### 5.2 Vận hành với Quest

1. Mở URL operator được runtime/dashboard in ra trên Quest Browser; chấp nhận certificate nếu local self-signed.
2. Enter VR, recenter headset theo tư thế operator.
3. Chọn arm/mode đúng; bắt đầu với hand/controller ở tư thế thoải mái.
4. Giữ clutch/deadman để điều khiển. Chuyển động đầu tiên phải rất nhỏ.
5. Nhả clutch để hold. Dùng STOP khi cần dừng khẩn; không tin rằng tab browser đóng là Stop chủ động.
6. Nếu tracking mất hoặc socket rớt, chờ system hold; kiểm tra robot trước reconnect.

### 5.3 Local SO-101 real mode

Runtime local SO-101 yêu cầu explicit port:

```bash
so101-vr-teleop --host 0.0.0.0 --port 8443 \
  --cert certs/cert.pem --key certs/key.pem --arms left \
  --real --robot-id <follower-id> --robot-port /dev/serial/by-id/<follower>
```

Thay placeholder bằng identity đã xác nhận. Không copy lệnh này để chạy robot nếu chưa qua checklist an toàn; dùng tài liệu runtime hiện hành để lấy các flag mapping/certificate phù hợp.

## 6. Phone teleoperation

### 6.1 Chuẩn bị mobile

1. Với control hardware chính xác, dùng iPhone development build đã được sign/sideload; Expo Go không cung cấp ARKit native module.
2. Bật Developer Mode (nếu iOS yêu cầu) và cấp Camera, Motion và Local Network permission.
3. Đảm bảo phone và server cùng mạng; lấy host/port từ runtime đang chạy.
4. Mở **Phone Teleop**, nhập server host/port, chọn arm trước khi kết nối.

### 6.2 Điều khiển

1. Nhấn Connect và chờ trạng thái `CONNECTED`/tracking hợp lệ.
2. Recenter khi phone và robot đang ở tư thế mong muốn.
3. Giữ vùng/nút control; chỉ sau đó dịch phone chậm để tạo motion tương đối.
4. Slide theo UI để điều khiển gripper trong khi giữ control.
5. Nhả control trước khi đổi tư thế, background app hoặc chuyển người vận hành.

Nếu tracking là `lost`, socket error hoặc app background, không thử tiếp tục điều khiển: kiểm tra robot đang hold rồi reconnect/recenter.

### 6.3 Giới hạn platform

| Platform | Điều được phép kết luận |
| --- | --- |
| iPhone ARKit development build | Có thể chạy hardware validation sau evidence. |
| Expo Go iPhone | UI/protocol/camera preview, không precision 6DoF. |
| Android DeviceMotion | UI/protocol test, không precision hardware teleop. |

## 7. Mobile app ngoài Phone Teleop

Home, Connect, Calibrate, Manual Teleop, Camera và Status có UI để demo flow/UX. Trong baseline hiện tại, các mục này dùng mock data hoặc local UI state; không xem chúng như trạng thái robot thật. Không dùng nút E-STOP trong mobile UI thay thế Stop/E-stop dashboard/hardware.

## 8. Xử lý sự cố

| Hiện tượng | Hành động an toàn đầu tiên | Hướng xử lý |
| --- | --- | --- |
| Robot di chuyển khác chiều | Nhả clutch/Stop | Quay lại fake mode, xác nhận frame/mapping từng axis. |
| Robot jump khi start | Nhả clutch/E-stop nếu cần | Kiểm pose seed/recenter/reference; không tiếp tục hardware test. |
| Quest/phone mất kết nối | Không reconnect vội | Xác nhận robot hold, kiểm network, recenter trước control mới. |
| Dashboard báo locked | Không bypass | Kiểm E-stop/task cũ, Unlock theo quy trình và preflight lại. |
| Không thấy iPhone ARKit | Dừng precision test | Kiểm IPA development build, permission, device support; Expo Go là fallback. |
| Port không đúng/busy | Không đoán port | Dùng `/dev/serial/by-id/`, disconnect stale process, assign lại qua dashboard. |
| VR LeKiwi dashboard "Ready" | Không coi là real motion | Baseline hiện fake follower; chỉ dùng offline validation. |

## 9. Sau mỗi session

1. Nhả clutch và Stop task.
2. Xác nhận follower disconnect/torque state theo runtime.
3. Lưu terminal log, configuration, video và kết quả PASS/FAIL vào thư mục evidence.
4. Ghi bất thường/mapping issue trước khi session tiếp theo chạy.
5. Chỉ tắt nguồn sau khi robot ở trạng thái an toàn.

## 10. Liên kết tài liệu

- [Software Design Document](software-design-document.md): kiến trúc, interface và design decision.
- [Software Test Document](software-test-document.md): test cases, evidence và exit criteria.
- [Tài liệu tổng thể tiến độ](../progress/teleoperation-progress-and-test-plan.md): roadmap, tiến độ và phân công.
