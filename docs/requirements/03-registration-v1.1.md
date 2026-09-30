# CAPSTONE PROJECT REGISTER — v1.1

> Bản nâng cấp từ phiếu đăng ký v1.0.  
> Trạng thái: **chờ GVHD phê duyệt thay đổi phạm vi và ký xác nhận**.

## Thông tin chung

| Trường | Giá trị |
| --- | --- |
| Chuyên ngành | Software Engineering |
| Thời gian thực hiện | 09/2026–03/2027 |
| GVHD | [CẦN BỔ SUNG] |
| Thành viên / MSSV / liên hệ | [CẦN BỔ SUNG] |
| Ngày lập | [CẦN BỔ SUNG] |
| Ngày GVHD phê duyệt | [CẦN BỔ SUNG] |

## 3.1. Tên đề tài

**English:** VISTA: Vision-Language-Action System for Tabletop Manipulation with Dual Robot Arms  
**Vietnamese:** VISTA: Hệ thống Thị giác - Ngôn ngữ - Hành động điều khiển hai cánh tay robot thao tác trên bàn  
**Abbreviation:** VISTA

## 3.2. Nội dung chính, kết quả và sản phẩm

### a) Context

Vision-Language-Action (VLA) là hướng tiếp cận cho phép robot tạo hành động từ quan sát thị giác và chỉ dẫn ngôn ngữ tự nhiên. Hệ sinh thái LeRobot cung cấp nền tảng mã nguồn mở cho teleoperation, quản lý dataset và fine-tuning policy trên phần cứng chi phí thấp như SO-101. Tuy nhiên, pipeline có thể tái lập cho thao tác tabletop hai tay trong điều kiện thiết bị, dữ liệu và GPU hạn chế vẫn là một bài toán thực hành đáng giải quyết.

VISTA tập trung vào một benchmark hẹp: pick một cube hoặc bút và place hoàn toàn vào hộp nhựa. Nhóm đã có hai cặp Leader–Follower SO-101 (hai leader, hai follower), có thể teleoperate qua web, điện thoại và VR. Dataset mục tiêu ban đầu gồm khoảng 150 episode real thu bằng teleoperation, dùng wrist camera và top-head camera. Mỗi episode được gắn chỉ dẫn tác vụ và nhãn kết quả; một lần chạy PASS khi vật được pick, place hoàn toàn trong hộp nhựa, không có tác động ngoại cảnh.

Phạm vi này nhằm trả lời liệu SmolVLA có thể được fine-tune và đánh giá cho benchmark bimanual nói trên khi kết hợp dữ liệu real với môi trường mô phỏng bổ trợ, đồng thời vẫn duy trì cơ chế vận hành an toàn trên robot thật.

### b) Proposed Solutions

VISTA xây dựng một pipeline VLA cho thao tác tabletop hai tay trong LeRobot, gồm các cấu phần sau:

1. **Teleoperation và thu thập dữ liệu.** Sử dụng hai cặp Leader–Follower SO-101 để điều khiển bimanual qua web, phone hoặc VR; ghi observation, action, camera stream, instruction, metadata cấu hình và outcome theo LeRobotDataset.
2. **Môi trường mô phỏng.** Xây dựng/cấu hình môi trường MuJoCo/gym-aloha cho cùng task pick-and-place để prototype, kiểm thử an toàn trước hardware, và tạo dữ liệu mô phỏng bổ trợ trong phạm vi task đã xác định.
3. **Fine-tuning SmolVLA.** Fine-tune một policy SmolVLA trên dataset đã thu thập; lưu dataset và checkpoint trên Hugging Face Hub. Kaggle hoặc GPU thuê được dùng làm compute; nếu compute thiếu, giảm số lượt thực nghiệm nhưng không giảm dữ liệu teleoperation mục tiêu.
4. **Inference và control.** Nhận chỉ dẫn ngôn ngữ cho task benchmark, chạy checkpoint SmolVLA và điều khiển hai follower theo closed loop có safety gate.
5. **Dashboard tối thiểu.** Cung cấp readiness/teleop status, camera và arm state, tiến trình training cùng outcome của lần chạy; dashboard vận hành local-first trên laptop control host kết nối USB trực tiếp tới robot.

### c) Functional Requirements

**Operator/Researcher** có thể:

1. Kết nối, kiểm tra readiness và teleoperate hai follower bằng leader web, phone hoặc VR để thu episode.
2. Chọn task, ghi instruction ngôn ngữ, observation/action, wrist/top-head camera stream và nhãn PASS/FAIL cho episode.
3. Xem danh sách, replay và export/import dataset/checkpoint theo workflow LeRobot/Hugging Face Hub đã cấu hình.
4. Khởi chạy hoặc theo dõi job fine-tuning SmolVLA khi compute khả dụng; xem trạng thái, log/metric và checkpoint kết quả.
5. Chạy inference SmolVLA cho task pick-and-place trong simulation hoặc hardware đã sẵn sàng; xem camera, arm state, log và outcome.

**Robot/Control System** phải:

1. Nhận proprioceptive state hai arm và camera observations; tạo action bimanual đồng bộ từ policy SmolVLA.
2. Áp dụng validation, clutch/deadman, workspace/joint/rate limit và safety gate trước khi gửi action xuống follower.
3. Khi mất input hoặc tracking quá 1 giây, đưa follower về hold pose; không tự resume khi reconnect.
4. Khi E-stop được kích hoạt, khóa motion; chỉ cho phép Unlock sau kiểm tra robot, reconnect và recenter. E-stop vật lý vẫn là biện pháp ưu tiên khi vận hành hardware.
5. Ghi execution trace và outcome để truy xuất cho evaluation/dataset khi recorder khả dụng mà không làm chậm control loop.

**Local Control Host/Dashboard** phải:

1. Hiển thị readiness, trạng thái teleop/safety, camera/arm state, training progress và task outcome.
2. Quản lý cấu hình port, calibration, process lifecycle, Stop/E-stop/Unlock trên laptop control host.
3. Không expose control qua Internet; robot chỉ được kết nối USB trực tiếp với laptop control host hoặc trusted LAN theo cấu hình vận hành.

### d) Non-Functional Requirements and Constraints

1. **Safety:** Mất input/tracking quá 1 giây phải hold pose; E-stop phải khóa motion; không được tự khôi phục motion sau reconnect.
2. **Reliability:** Packet không hợp lệ, stale hoặc out-of-order phải bị từ chối; input không được gửi trực tiếp tới servo mà bỏ qua safety/kinematics.
3. **Reproducibility:** Dataset/checkpoint phải có version, metadata về cấu hình và được lưu trên Hugging Face Hub; mỗi run phải lưu config, log, commit/version và outcome khi có thể.
4. **Portability:** Task benchmark phải chạy được trong simulation trước khi dùng để đánh giá trên hardware; môi trường real/sim dùng cùng định nghĩa task và tiêu chí PASS/FAIL.
5. **Performance:** Ngưỡng control-loop và inference latency sẽ được xác định bằng test trong môi trường mục tiêu trước nghiệm thu; không tuyên bố target 30 Hz khi chưa có evidence đo.
6. **Deployment constraint:** Hệ thống local-first, không yêu cầu cloud control, multi-user authorization, login/RBAC hoặc personal workspace trong Capstone.
7. **Data constraint:** Dataset real mục tiêu khoảng 150 episode, chia 105 train, 15 validation và 30 test; mọi kết luận generalization chỉ nằm trong object/configuration của benchmark đã định nghĩa.

### e) Theory & Practical

**Theory.** Đề tài áp dụng VLA, imitation learning/fine-tuning, robot kinematics, bimanual coordination, safety trong teleoperation và sim-to-real. SmolVLA là policy trọng tâm. Bài toán cần xét phối hợp hai arm, frame/kinematics, input freshness, workspace/joint limits, và đánh giá success rate trên task có điều kiện rõ ràng.

**Practical.** Nhóm vận hành hai cặp Leader–Follower SO-101, thu demonstration real qua web/phone/VR, sử dụng wrist và top-head camera, xây dựng/cấu hình simulation MuJoCo/gym-aloha cho task benchmark, fine-tune SmolVLA và chạy inference có safety gate. Dataset/checkpoint được lưu trên Hugging Face Hub; compute dùng Kaggle hoặc GPU thuê tùy khả dụng.

### f) Products (Expected Deliverables)

1. Công cụ teleoperation và data collection cho hai follower SO-101, kèm safety behavior và evidence vận hành.
2. Dataset benchmark khoảng 150 episode real cho task pick cube/bút vào hộp nhựa, với metadata và split train/validation/test.
3. Môi trường MuJoCo/gym-aloha cho cùng task benchmark, dùng prototype và pre-deployment evaluation; sim-data được ghi rõ provenance.
4. Pipeline fine-tuning SmolVLA, artifact checkpoint, configuration, log/metric và hướng dẫn tái lập.
5. Ứng dụng inference/control SmolVLA chạy task benchmark trong simulation và hardware khi preflight đạt.
6. Dashboard local-first tối thiểu cho readiness, teleop/safety status, camera/arm state, training progress và outcome.
7. Báo cáo benchmark SmolVLA, nêu success rate, completion time khi đo được, giới hạn dataset/hardware và evidence test.

### g) Proposed Tasks and Work Packages

Do nhóm có bốn thành viên, kế hoạch thực hiện dùng bốn work package với trách nhiệm chính rõ ràng và phối hợp ở integration/test/documentation:

1. **WP1 — Project Management, Requirements and Architecture:** quản lý scope/risk, traceability, task protocol, architecture và tài liệu.
2. **WP2 — Hardware, Teleoperation and Data Collection:** calibration, camera setup, teleop safety, dataset capture và evidence hardware.
3. **WP3 — Simulation and Evaluation Environment:** MuJoCo/gym-aloha, task definition, sim-data provenance và pre-deployment evaluation.
4. **WP4 — SmolVLA, Inference, Dashboard and Integration:** fine-tuning SmolVLA, inference/control, dashboard tối thiểu, E2E test và report.

## 3.3. Research Information

### a) Research Problem / Research Question

Trong một thiết lập SO-101 hai tay chi phí thấp, SmolVLA được fine-tune trên khoảng 150 demonstration real và dữ liệu mô phỏng bổ trợ đạt success rate như thế nào cho nhiệm vụ pick-and-place cube/bút vào hộp nhựa, trên các cấu hình object được định nghĩa trước?

### b) Research Objectives

1. Xây dựng benchmark bimanual pick-and-place chạy được trên simulation và SO-101 real hardware.
2. Thu, quản lý và đánh giá dataset khoảng 150 episode real theo split 105/15/30, với task instruction và outcome rõ ràng.
3. Fine-tune và đánh giá SmolVLA bằng success rate, completion time khi đo được, và failure analysis trên test split/configuration đã định nghĩa.
4. Đánh giá vai trò của simulation/sim-data bổ trợ trong phạm vi task benchmark, với provenance tách biệt khỏi dữ liệu real.

### c) Research Scope & Methodology

Nghiên cứu thực nghiệm/định lượng trong LeRobot, dùng hai follower SO-101 và MuJoCo/gym-aloha. Benchmark chỉ bao gồm pick cube hoặc bút vào hộp nhựa. Episode real được ghi qua teleoperation, camera wrist và top-head; train/validation/test split là 105/15/30. SmolVLA là policy duy nhất được fine-tune/evaluate. Các lần thử được cấu hình và log để tái lập; báo cáo không ngoại suy ngoài benchmark hoặc tuyên bố generalist VLA.

### d) Expected Scientific Contribution

Một benchmark và pipeline tái lập cho fine-tuning/evaluate SmolVLA trên thao tác tabletop hai tay chi phí thấp, gồm dữ liệu real, simulation task, safety-aware control và evidence đánh giá. Đóng góp được giới hạn ở task/object/configuration đã định nghĩa.

### e) Related Works / Literature Review (Preliminary)

- LeRobot: framework cho teleoperation, LeRobotDataset và robot learning.
- SmolVLA: policy VLA trọng tâm của đề tài.
- ALOHA/ALOHA 2: tham chiếu thiết kế bimanual teleoperation chi phí thấp.
- Các nghiên cứu sim-to-real và bimanual manipulation được dùng để xác định task protocol, camera/data provenance và evaluation.

## Record of Changes / GVHD Approval

| Mã thay đổi | Nội dung thay đổi so với v1.0 | Nguồn / P-xx | Trạng thái phê duyệt GVHD | Ngày / chữ ký |
| --- | --- | --- | --- | --- |
| ROC-01 | Chỉ fine-tune/evaluate SmolVLA; ACT và Diffusion Policy chuyển FUTURE/OUT_OF_SCOPE. | P-02, P-06, P-10, P-33, P-34 | [CẦN GVHD PHÊ DUYỆT] | [CẦN BỔ SUNG] |
| ROC-02 | Login/RBAC và personal workspace không triển khai; vận hành local-first trên laptop control host. | P-14, P-26, P-31 | [CẦN GVHD PHÊ DUYỆT] | [CẦN BỔ SUNG] |
| ROC-03 | Năm work package chuyển thành bốn work package, phù hợp danh sách bốn thành viên. | P-36 | [CẦN GVHD PHÊ DUYỆT] | [CẦN BỔ SUNG] |
| ROC-04 | Research question/objectives sửa từ comparative benchmark ba policy thành fine-tuning/evaluation SmolVLA trên một benchmark hẹp. | P-06, P-10, P-33, P-34 | [CẦN GVHD PHÊ DUYỆT] | [CẦN BỔ SUNG] |

## Đối chiếu P-01 đến P-36

| P-xx | Cách xử lý trong v1.1 |
| --- | --- |
| P-01–P-05 | Giữ ở Context; giới hạn claim theo benchmark. |
| P-06 | Thay comparative question bằng SmolVLA-only qua ROC-01/ROC-04. |
| P-07–P-09 | Giữ: end-to-end, teleop/data collection và simulation cho task hẹp. |
| P-10 | SmolVLA giữ; ACT/Diffusion chuyển Future/Out of scope qua ROC-01. |
| P-11–P-13 | Giữ với autonomous inference một task, dashboard tối thiểu và benchmark SmolVLA. |
| P-14 | Out of scope qua ROC-02. |
| P-15–P-25 | Giữ/thu hẹp thành FR cho teleop, dataset, simulation, training, inference, dashboard và safety. |
| P-26 | Login/RBAC bỏ; hardware lifecycle/dashboard local-first giữ phần phù hợp. |
| P-27–P-32 | Định lượng được safety/data split; các ngưỡng chưa có evidence để placeholder test, không bịa số. |
| P-33–P-35 | Research question/objective/methodology sửa theo SmolVLA-only và benchmark hẹp. |
| P-36 | Bốn work package qua ROC-03. |

## Xác nhận

| Vai trò | Họ tên | Ngày | Chữ ký |
| --- | --- | --- | --- |
| Supervisor | [CẦN BỔ SUNG] | [CẦN BỔ SUNG] | [CẦN BỔ SUNG] |
| On behalf of Registers | [CẦN BỔ SUNG] | [CẦN BỔ SUNG] | [CẦN BỔ SUNG] |
