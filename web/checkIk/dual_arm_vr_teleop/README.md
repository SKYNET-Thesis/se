# Dual SO-101 VR Teleoperation

## Vuer hand-tracking mode

Real VR now uses the vendored
`Oasis-Uniandes/lerobot_teleoperator_so101_vuer` client instead of the custom
Three.js/WebXR client. Install its dependencies once in the LeRobot environment:

```bash
/home/quangduc/miniconda3/envs/lerobot/bin/python3 -m pip install -e \
  dual_arm_vr_teleop/vendor/lerobot_teleoperator_so101_vuer
```

Choose a follower on the dashboard and press **Start Vuer hand teleop**. Then
open `https://<laptop-ip>:8012/?ws=wss://<laptop-ip>:8012` in Quest Browser,
accept the self-signed certificate, recenter the headset, and enter VR. The
selected hand drives only the selected follower; no leader device is opened.

Thư mục độc lập để khôi phục prototype WebXR điều khiển hai SO-101.

## Trạng thái hiện tại

- Quest Browser đọc pose của controller trái/phải ở 60 Hz.
- Side Grip là clutch: chỉ khi giữ nút này tay tương ứng mới cập nhật mục tiêu.
- Front Trigger điều khiển gripper: thả = mở tối đa, bóp = đóng dần.
- Controller translation được ánh xạ tương đối sang TCP robot.
- Controller pitch chỉ điều khiển `wrist_flex`.
- Controller twist chỉ điều khiển `wrist_roll`.
- `elbow_flex` do IK vị trí quyết định: đưa controller ra xa thì tay duỗi, kéo về thì tay gập.
- Có hai backend tách biệt: offline không import LeRobot, và real bridge chỉ kết nối hai follower sau khi mở khóa rõ ràng.

## Cấu trúc

```text
frontend/                  WebXR + hai digital twin
backend/offline_teleop_server.py
backend/real_vr_teleop_server.py
robot/                     FK, IK và safety primitives
tests/                     kiểm tra offline
so101_new_calib.urdf       model động học
teleop_config.example.json cấu hình dự kiến cho hai follower
```

## Cài đặt

```bash
cd ~/Code/checkIk/dual_arm_vr_teleop
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd frontend
npm install
```

## Test offline tự động

```bash
cd ~/Code/checkIk/dual_arm_vr_teleop
source .venv/bin/activate
python tests/test_dual_arm_offline.py
```

Kết quả cần thấy:

```text
DUAL ARM WEBXR PACKET + CLUTCH + IK + FK: PASS
```

## Chạy với Quest nhưng chưa điều khiển robot thật

Terminal 1:

```bash
cd ~/Code/checkIk/dual_arm_vr_teleop
source .venv/bin/activate
python backend/offline_teleop_server.py
```

Terminal 2:

```bash
cd ~/Code/checkIk/webxr
npm run dev
```

Quest và laptop phải cùng Wi-Fi. Mở trên Quest Browser:

```text
https://<IP_LAPTOP>:8081
```

Với IP cũ của laptop, URL là `https://192.168.1.77:8081`; hãy chạy `hostname -I` để kiểm tra lại.

Nhấn `ENTER VR`. Giữ Grip bên hông của từng controller để điều khiển digital twin tương ứng. Trigger phía trước đóng/mở gripper.

## Chạy hai follower thật qua Quest

Không chạy real bridge trực tiếp ở lần đầu. Mở dashboard API có khóa motion:

```bash
cd ~/Code/checkIk
source .venv/bin/activate
python dual_arm_vr_teleop/backend/dashboard_server.py --enable-motion
```

Trên dashboard: scan/assign hai follower, calibrate followers, kiểm tra setup, vào **VR Control** và nhấn **Start REAL VR teleop**. Sau đó mở WebXR trên Quest tại `https://<IP_LAPTOP>:8081`.

Quest hand tracking is also supported in the same page. Put the controllers
down so Quest switches to hands, then hold thumb and middle fingertip together
for 0.65 seconds to enable or disable the selected arm. Thumb/index distance
controls the gripper proportionally. Losing wrist/fingertip tracking disables
motion and requires the enable gesture again.

## Single-arm operating profiles and recovery

The single-arm and dual-arm Teleoperation pages offer two profiles.
**Exhibition** runs every active leader/follower pair at 50 Hz, reduces follower
telemetry reads to 5 Hz, applies a 2-degree relative command envelope, and
re-bases leader motion on each follower's measured held pose. **Project** keeps
direct calibrated mirroring and the higher-rate loop for experiments and data
collection. If a USB bus drops during a public demo, keep the arms clear and
press **Reset / recover** on the same page; the dashboard releases the previous
worker, reconnects all boards used by that session, and Exhibition mode resumes
with zero commanded motion on its first frame for one or both followers.

Real bridge đọc pose thật làm điểm bắt đầu nên lần bóp Grip đầu tiên không nhảy về pose mặc định. Nó dùng Grip làm deadman, bỏ packet cũ, giới hạn workspace, giới hạn khớp và giới hạn mỗi bước 1.5°. Mất WebSocket trên 250 ms sẽ nhả clutch; Stop/E-stop dừng process và LeRobot disconnect để tắt torque.
# SO-101 dual-arm WebXR teleoperation

This folder contains two deliberately separate control surfaces:

- `frontend/`: the Quest WebXR client and digital twins.
- `backend/offline_teleop_server.py`: dual-controller IK with no LeRobot import.
- `backend/dashboard_server.py`: local allow-listed API for port assignment, calibration utilities, task logs, and E-stop.

The richer laptop dashboard lives at
`../frontend/818ac92f-06fa-424a-b907-69fdf7b4c564`.

## Safe offline run

Terminal 1:

```bash
cd ~/Code/checkIk
source .venv/bin/activate
python dual_arm_vr_teleop/backend/dashboard_server.py
```

Terminal 2:

```bash
cd ~/Code/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
npm run dev -- --host 0.0.0.0
```

Use the dashboard's **Start offline VR bridge** button, then start the Quest
client in a third terminal:

```bash
cd ~/Code/checkIk/dual_arm_vr_teleop/frontend
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
npm run dev
```

Open `https://<laptop-ip>:8081` in Meta Quest Browser. The offline bridge has
no LeRobot import and cannot command hardware.

## Hardware lock

`dashboard_server.py` starts with real motion locked. `--enable-motion` only
unlocks the backend gate; it does not bypass port assignment, calibration, or
the explicit `ENABLE MOTION` confirmation. Do not use that flag until both
followers have passed the read-only and small-motion checks.

For real VR, do not start either WebSocket bridge manually. Open **VR Teleop**
and press **Start REAL VR teleop**; the dashboard starts the exclusive hardware
bridge on port 8765. The WebXR page reports `REAL ROBOT` after its first valid
packet. Left Grip controls only the left follower, right Grip controls only the
right follower, and each front Trigger closes that side's gripper. Use **Stop**
or **Emergency Stop** before closing the dashboard.
