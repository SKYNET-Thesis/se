# VISTA — Project Inventory (Giai đoạn 1)

> Cập nhật: 18/09/2026  
> Trạng thái: working document — phục vụ khảo sát và phỏng vấn; chưa phải SRS hay phiếu v1.1.

## Quy ước trạng thái

- **VERIFIED**: có nguồn trực tiếp từ phiếu đăng ký, code, tài liệu dự án hoặc câu trả lời của nhóm.
- **INFERRED**: suy ra hợp lý từ hiện trạng code; cần nhóm/GVHD xác nhận trước khi đưa thành yêu cầu.
- **NEEDS_CONFIRMATION**: chưa đủ bằng chứng hoặc cần quyết định của nhóm/GVHD.
- **OUT_OF_SCOPE**: đã thống nhất loại khỏi Capstone.
- **FUTURE**: hướng phát triển sau Capstone.

## Nguồn đã khảo sát

| Nguồn | Vai trò | Trạng thái |
| --- | --- | --- |
| `../references/FA26SE183_VISTA_VISION_LANGUAGE_ACTION_SYSTEM_FOR__phuonglhk (1).docx` | Phiếu đăng ký Capstone v1.0 của nhóm | **VERIFIED** |
| `../references/Capstone_Tu-Phieu-dang-ky-den-Dac-ta-Yeu-cau_v1.2_1.pdf` | Hướng dẫn B1–B12; không phải quy định chính thức của Khoa | **VERIFIED** |
| `docs/progress/teleoperation-progress-and-test-plan.md` | Tài liệu canonical về teleoperation hiện trạng | **VERIFIED** |
| `docs/reports/*.md`, `docs/architecture/*.md`, `docs/setup/*.md` | Tài liệu lịch sử/bổ trợ | **VERIFIED** |
| `web/checkIk/`, `apps/mobile/`, `services/`, `edge/` | Hiện trạng mã nguồn | **VERIFIED** |

## Hồ sơ đề tài đã xác nhận

| Hạng mục | Giá trị | Trạng thái / nguồn |
| --- | --- | --- |
| Tên tiếng Anh | VISTA: Vision-Language-Action System for Tabletop Manipulation with Dual Robot Arms | **VERIFIED** — phiếu đăng ký mục 3.1 |
| Tên tiếng Việt | VISTA: Hệ thống Thị giác - Ngôn ngữ - Hành động điều khiển hai cánh tay robot thao tác trên bàn | **VERIFIED** — phiếu đăng ký mục 3.1 |
| Tên viết tắt | VISTA | **VERIFIED** — phiếu đăng ký mục 3.1 |
| GVHD | Lâm Hữu Khánh Phương | **VERIFIED** — phiếu đăng ký mục 1 |
| Nhóm | 4 thành viên | **VERIFIED** — phiếu đăng ký mục 2 |
| Thời gian | 09/2026–03/2027 | **VERIFIED** — phiếu đăng ký đầu trang |
| Robot hiện có | 2 leader + 2 follower SO-101, tức 2 cặp leader–follower | **VERIFIED** — nhóm trả lời 18/09/2026 |
| Mức sẵn sàng teleop | Manual web, phone teleop và VR teleop đã vận hành ổn định | **VERIFIED** — nhóm trả lời 18/09/2026; cần evidence riêng để gọi là hardware acceptance |
| Benchmark task khởi đầu | Pick một cube hoặc bút và đặt vào trong hộp nhựa | **VERIFIED** — nhóm trả lời 18/09/2026 |
| Quan sát khi ghi dataset | 2 wrist camera, mỗi follower một camera; 2 head camera bao quát | **VERIFIED** — nhóm trả lời 19/09/2026 |
| Quy mô dataset hiện tại | Khoảng 150 episode real, thu bằng teleoperation; chia 105 train / 15 validation / 30 test | **VERIFIED** — nhóm trả lời 18/09/2026 |
| Tài nguyên training | Hugging Face Hub lưu dataset/checkpoint; Kaggle hoặc GPU thuê chạy training; giảm số lượt run khi compute thiếu | **VERIFIED** — quyết định theo ủy quyền của nhóm 18/09/2026; quota/cost cụ thể chưa chốt |
| Safe failure khi mất input | Sau 1 giây mất input/tracking: hold pose; E-stop khóa motion; chỉ Unlock sau inspection, reconnect và recenter | **VERIFIED** — nhóm trả lời 18/09/2026 |
| Tiêu chí PASS pick-and-place | Vật được pick và place hoàn toàn trong hộp nhựa, không có tác động ngoại cảnh | **VERIFIED** — nhóm trả lời 18/09/2026; cần định nghĩa quan sát/timeout để test lặp lại |
| Hardware evidence | Có video cho web, phone và VR teleop | **VERIFIED** — nhóm trả lời 18/09/2026; đường dẫn và metadata chưa được cung cấp |
| Quy trình chuẩn bị robot | Disconnected → Find Port → Assign Port → Calibrate → Check/Preflight → Teleop → Stop | **VERIFIED** — nhóm trả lời 19/09/2026 |
| Truy cập control host | Bất kỳ người dùng tại laptop control host hoặc trusted LAN có thể kết nối/vận hành; không có RBAC | **VERIFIED** — nhóm trả lời 19/09/2026 |
| Ứng dụng thực tiễn chính | Hỗ trợ người vận hành sắp xếp vật dụng nhẹ trên bàn vào hộp/vùng đích | **VERIFIED** — nhóm trả lời 19/09/2026 |
| Người dùng mục tiêu chính | Người vận hành robot | **VERIFIED** — nhóm trả lời 19/09/2026 |
| Simulation deliverable tối thiểu | MuJoCo/gym-aloha scene cho task benchmark và sim-data có provenance riêng; không cam kết sim-to-real transfer thành công | **VERIFIED** — nhóm trả lời 19/09/2026 |
| Inference acceptance | Hai instruction cube/bút vào hộp; 10 lượt mỗi loại, tối thiểu 7/10 PASS mỗi loại, không vi phạm safety | **VERIFIED** — nhóm trả lời 19/09/2026 |
| Evidence hiện có | `references/73079`: VR teleop; `references/8689`: điều khiển đồng thời 2 follower | **VERIFIED** — nhóm trả lời 19/09/2026; cần kiểm tra tệp khi lập traceability |
| Recovery sau Hold | Reconnect → recenter → preflight rồi tiếp tục session | **VERIFIED** — nhóm trả lời 19/09/2026 |

## Phạm vi đề xuất trong phiếu đăng ký

| Trụ | Nội dung | Hiện trạng sơ bộ |
| --- | --- | --- |
| Teleoperation & data collection | Leader–follower, ghi demonstration bimanual đồng bộ kèm video/camera và language instruction theo LeRobotDataset | Teleop có mã nguồn; recording episode E2E chưa thấy bằng chứng hoàn chỉnh. **INFERRED** |
| Simulation | MuJoCo/gym-aloha, domain randomization, sim-data và đánh giá an toàn trước hardware | **VERIFIED** — nhóm chọn giữ đầy đủ trong phạm vi Capstone; implementation/evidence chưa được xác nhận |
| Training | Fine-tune SmolVLA | **VERIFIED** — nhóm quyết định chỉ dùng SmolVLA; phần chạy model chưa xong |
| Inference/control | Nhận lệnh ngôn ngữ, chọn policy và điều khiển 2 arm closed loop có safety | Chưa thấy implementation hoàn chỉnh tại các service khảo sát. **INFERRED** |
| Monitoring dashboard | Dataset statistics, training curves/logs, camera/arm state/task outcome | Có dashboard/control surfaces; nhiều UI mobile dùng mock. **INFERRED** |
| Benchmark | Dataset bimanual và báo cáo success rate/generalization của SmolVLA trên nhiệm vụ pick cube/bút vào hộp nhựa | **VERIFIED** — task/policy đã chốt; protocol và nguồn lực còn cần xác định |

## Hiện trạng kỹ thuật đã quan sát

- **VERIFIED:** `web/checkIk` có Python control path cho leader/VR/phone, FK/IK, clutch/deadman, giới hạn workspace/joint/rate, stale-input/disconnect handling, fake/offline seam và test.
- **VERIFIED:** `apps/mobile` là Expo/React Native; Phone Teleop dùng WebSocket. iOS development build có ARKit 6DoF; fallback Android/Expo Go không phù hợp để teleop chính xác.
- **VERIFIED:** `services/backend` (.NET), `services/ai-integration` (FastAPI) và `edge/raspberry-pi-agent` hiện mới có cấu trúc ban đầu/skeleton cho nhiều capability được nêu trong README.
- **VERIFIED:** Authentication/RBAC không thuộc phạm vi triển khai đã chọn. Robot kết nối USB trực tiếp tới laptop control host; nhóm vận hành theo local-first.
- **INFERRED:** Dashboard/teleoperation hiện chạy chủ yếu trên laptop control host hoặc mạng nội bộ tin cậy, dựa vào quy trình vận hành thay vì cơ chế phân quyền ứng dụng.
- **NEEDS_CONFIRMATION:** Chi tiết implementation cho safety authority, timeout, recovery và E-stop chưa được xác nhận trong source code; các rule nghiệp vụ đã được nhóm chốt.

## Mâu thuẫn và rủi ro cần xử lý ở B1–B3

| ID | Nội dung | Cách xử lý |
| --- | --- | --- |
| C-01 | Phiếu mục 3.2(g) nói “Team of 5 members”, nhưng danh sách thành viên có 4 người. | **NEEDS_CONFIRMATION** — sửa phiếu v1.1/Record of Changes sau khi nhóm và GVHD duyệt. |
| C-02 | Phiếu yêu cầu login, personal workspace và Admin/RBAC; nhóm quyết định không triển khai authentication/RBAC vì robot USB nối trực tiếp vào laptop control host. | **NEEDS_CONFIRMATION:** phải được GVHD duyệt và ghi Record of Changes khi viết phiếu v1.1; không mô tả capability này là đã có. |
| C-03 | Tài liệu lịch sử mô tả VR LeKiwi dashboard là fake/offline; tài liệu canonical mới hơn mô tả real-follower path nhưng chưa có hardware E2E evidence. | **NEEDS_CONFIRMATION** — xác nhận trạng thái acceptance bằng log/video/test report. |
| C-04 | Phiếu cam kết simulation MuJoCo/gym-aloha, sim-to-real và benchmark 3 policy; nhóm quyết định chỉ fine-tune/evaluate SmolVLA. | **NEEDS_CONFIRMATION:** ACT và Diffusion Policy cần chuyển sang OUT_OF_SCOPE/FUTURE hoặc giữ lại sau khi GVHD duyệt phiếu v1.1. |
| C-05 | Phiếu nêu target control loop khoảng 30 Hz và “few thousand episodes”; đây là mục tiêu thô, chưa có điều kiện đo hay ngân sách GPU. | **NEEDS_CONFIRMATION** — không dùng làm NFR chính thức trước khi chốt môi trường và phương pháp đo. |

## Quyết định đã ghi nhận trong vòng phỏng vấn 1

1. Teleoperation là **Must-have**: manual web, phone và VR trên 2 cặp leader–follower.
2. Simulation MuJoCo/gym-aloha và sim-data vẫn trong phạm vi Capstone; policy duy nhất được train/evaluate là **SmolVLA**. ACT và Diffusion Policy là **FUTURE/OUT_OF_SCOPE đề xuất chờ GVHD duyệt**.
3. Benchmark task khởi đầu là **pick cube/bút vào hộp nhựa**; dataset gồm khoảng **150 episode real** do teleoperation, quan sát bằng wrist camera và top-head camera, chia **105/15/30** cho train/validation/test.
4. Model training/inference chưa hoàn tất; không được ghi là đã triển khai hoặc đã nghiệm thu.
5. Authentication/RBAC và personal workspace là **OUT_OF_SCOPE (đề xuất chờ GVHD duyệt)**; hệ thống vận hành local-first trên laptop control host.
6. Safety authority và safe-failure behavior là **Must-have** mới; mất input/tracking quá **1 giây** phải hold pose; E-stop khóa motion; Unlock chỉ sau inspection, reconnect và recenter. Chưa có implementation được xác nhận.
7. Chiến lược hạ tầng: Hugging Face Hub là nơi lưu dataset/checkpoint; Kaggle hoặc GPU thuê là compute có thể thay thế. Khi compute thiếu, giảm số lượt run thay vì giảm teleoperation/data.
8. Simulation cho task benchmark và sim-data được giữ in-scope; số episode mô phỏng chưa chốt.
9. Workflow lifecycle chuẩn cho robot được xác nhận: Disconnected → Find Port → Assign Port → Calibrate → Check/Preflight → Teleop → Stop.

## Câu hỏi còn mở

- Q-01: Video hardware evidence nằm ở đâu, có thể đối chiếu video nào với web/phone/VR và test case nào?
- Q-02: GVHD có chấp thuận chuyển ACT/Diffusion Policy, login/RBAC và personal workspace ra khỏi scope Capstone không?
