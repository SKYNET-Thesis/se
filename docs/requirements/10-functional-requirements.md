# B10 — Functional Requirements

> Draft baseline. Actor chính của mọi FR là Local Operator; không có RBAC.

## FR-01 — Chuẩn bị robot và phiên điều khiển

- **Phân hệ / mục tiêu:** Hardware lifecycle; đưa follower từ disconnected đến Ready an toàn.
- **Mô tả:** Find Port, assign left/right, calibrate, check/preflight, Start và Stop.
- **Preconditions / trigger:** Robot USB nối control host; operator chọn chuẩn bị robot.
- **Main flow:** Find Port → assign → calibrate → preflight → Ready → Start session → Stop → cleanup.
- **Alternative / exception:** Calibration/preflight fail thì không Ready; port sai/busy thì không Start.
- **Postconditions:** Session kết thúc ở Stopped/Disconnected hoặc Ready trước Start.
- **Rules / entities:** BR-01–BR-04, BR-08; Arm, PortAssignment, CalibrationProfile, ReadinessCheck, ControlSession.
- **Acceptance:** Given arm mới, when preflight pass, then session Ready; when preflight fail, then motion không được Start.
- **MoSCoW / estimate / source / status:** Must / L / P-15, P-26 / VERIFIED.

## FR-02 — Teleoperation bimanual

- **Phân hệ / mục tiêu:** Teleoperation; cho operator điều khiển 2 follower qua web, phone hoặc VR.
- **Preconditions / trigger:** FR-01 Ready; operator Start và giữ clutch/deadman.
- **Main flow:** Nhận input → validate/map → kinematics/safety → follower action → telemetry.
- **Alternative / exception:** Single-arm mode chỉ active arm; input invalid/stale/out-of-order bị reject.
- **Postconditions:** Action đã gửi hoặc safety event/log được ghi.
- **Rules / entities:** BR-05, BR-06, BR-10; ControlSession, Arm, SafetyEvent.
- **Acceptance:** Given dual Ready arms, when valid left/right input, then đúng follower nhận bounded action, không cross-command.
- **MoSCoW / estimate / source / status:** Must / L / P-08, P-15, P-22 / VERIFIED.

## FR-03 — Safety hold, Stop và E-stop

- **Phân hệ / mục tiêu:** Safety; ngăn motion không chủ ý.
- **Preconditions / trigger:** Active session; timeout >1 s, clutch release, Stop hoặc E-stop.
- **Main flow:** Timeout/tracking loss → Hold; Stop → controlled cleanup; E-stop → lock motion; recovery → reconnect, recenter, preflight.
- **Exception:** Không Unlock/Start khi inspection hoặc preflight fail.
- **Postconditions:** Hold/Stopped/EmergencyLocked đúng state, safety event được ghi.
- **Rules / entities:** BR-05–BR-10; ControlSession, SafetyEvent, ReadinessCheck.
- **Acceptance:** Given active robot, when no input >1 s, then hold; when E-stop, then motion remains locked until preflight after Unlock.
- **MoSCoW / estimate / source / status:** Must / M / P-24, P-28 / VERIFIED.

## FR-04 — Thu và quản lý dataset

- **Phân hệ / mục tiêu:** Dataset; tạo dataset real tái lập cho benchmark.
- **Preconditions / trigger:** Teleop session active, task/camera configuration chọn.
- **Main flow:** Ghi 2 wrist + 2 head camera, observation/action, instruction, outcome; version lên Hub; split 105/15/30.
- **Exception:** Recorder lỗi đánh dấu incomplete, không block control loop.
- **Postconditions:** Episode có provenance real/sim, PASS/FAIL; dataset version được tham chiếu.
- **Rules / entities:** BR-11–BR-13, BR-15; DemonstrationEpisode, DatasetVersion, ObservationConfiguration.
- **Acceptance:** Given completed pick/place, when saved, then episode có instruction/outcome/camera metadata và thuộc split hợp lệ.
- **MoSCoW / estimate / source / status:** Must / L / P-08, P-16, P-17 / NEEDS_CONFIRMATION (implementation).

## FR-05 — Simulation và sim-data

- **Phân hệ / mục tiêu:** Simulation; chạy cùng benchmark và tạo sim-data provenance riêng.
- **Preconditions / trigger:** MuJoCo/gym-aloha scenario configured.
- **Main flow:** Chạy cube/bút → hộp trong sim; ghi sim episode; lưu tách dữ liệu real.
- **Exception:** Scenario invalid không tạo episode valid.
- **Postconditions:** Sim-data truy vết được scenario/task, không claim sim-to-real transfer.
- **Rules / entities:** BR-15, BR-16; SimulationScenario, DemonstrationEpisode, DatasetVersion.
- **Acceptance:** Given scenario, when episode completes, then dataset records source=simulation and scenario reference.
- **MoSCoW / estimate / source / status:** Must / L / P-09, P-20 / NEEDS_CONFIRMATION.

## FR-06 — Fine-tune, inference và dashboard SmolVLA

- **Phân hệ / mục tiêu:** AI/dashboard; fine-tune SmolVLA và đánh giá task benchmark.
- **Preconditions / trigger:** Dataset version + compute; checkpoint passed to inference after preflight.
- **Main flow:** Start training → store config/log/checkpoint Hub → select checkpoint → instruction → candidate action → safety → outcome/dashboard.
- **Exception:** Compute unavailable preserves run state; unsafe candidate rejected.
- **Postconditions:** TrainingRun/Checkpoint/EvaluationRun có metrics/outcome.
- **Rules / entities:** BR-10, BR-13, BR-14, BR-16; TrainingRun, ModelCheckpoint, EvaluationRun.
- **Acceptance:** Given 10 trials each instruction, when evaluation ends, then ≥7/10 PASS for cube and pen with no safety violation.
- **MoSCoW / estimate / source / status:** Must / L / P-18, P-19, P-21, P-23 / NEEDS_CONFIRMATION (implementation).
