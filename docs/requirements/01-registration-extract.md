# B1 — Giải mã phiếu đăng ký VISTA

> Nguồn: `../references/FA26SE183_VISTA_VISION_LANGUAGE_ACTION_SYSTEM_FOR__phuonglhk (1).docx`, mục 3.2 và 3.3.  
> Quy tắc: bảng này chỉ tách và mã hóa ý gốc; không tự sửa nội dung phiếu.

## Thông tin bất biến

| Hạng mục | Nội dung | Trạng thái |
| --- | --- | --- |
| Tên EN | VISTA: Vision-Language-Action System for Tabletop Manipulation with Dual Robot Arms | VERIFIED |
| Tên VI | VISTA: Hệ thống Thị giác - Ngôn ngữ - Hành động điều khiển hai cánh tay robot thao tác trên bàn | VERIFIED |
| Viết tắt | VISTA | VERIFIED |
| GVHD | Lâm Hữu Khánh Phương | VERIFIED |
| Nhóm | 4 thành viên trong bảng đăng ký | VERIFIED |

## Context và vấn đề

| ID | Ý gốc tách ra | Loại | Suy ra / chưa rõ |
| --- | --- | --- | --- |
| P-01 | VLA biến natural-language instruction và quan sát thành action robot, thay thế lập trình task-specific cứng nhắc. | Context | NEEDS_CONFIRMATION: mức “generalization” kỳ vọng cho Capstone. |
| P-02 | LeRobot cung cấp hardware giá thấp, dataset chuẩn và policy ACT, Diffusion Policy, SmolVLA. | Existing ecosystem | VERIFIED: framework được đề xuất; policy cuối cần chốt lại. |
| P-03 | Reference/tutorial công khai chủ yếu single-arm, single-task; bimanual tabletop còn ít được khai thác trong bối cảnh ngân sách/dữ liệu hạn chế. | Problem | Cần literature review và tiêu chí so sánh có dẫn chứng ở B2/B3. |
| P-04 | Thiếu pipeline bimanual low-cost bao phủ data collection, training, evaluation. | Problem | Mục tiêu pipeline, không mặc định là toàn bộ product đã có. |
| P-05 | Demonstration bimanual real thu thập chậm và tốn kém. | Constraint | VERIFIED: nhóm dự kiến 150 episode real. |
| P-06 | Chưa rõ trade-off SmolVLA với ACT/Diffusion Policy trên low-cost dual-arm setup. | Research question basis | Mâu thuẫn với quyết định hiện tại chỉ dùng SmolVLA. |

## Giải pháp và sản phẩm đề xuất

| ID | Ý gốc tách ra | Loại | Suy ra / chưa rõ |
| --- | --- | --- | --- |
| P-07 | Xây VISTA end-to-end cho bimanual tabletop trong LeRobot, chạy simulation và hardware thật. | Solution pillar | NEEDS_CONFIRMATION: mức E2E được nghiệm thu. |
| P-08 | Leader–follower teleop ghi demonstration bimanual: joint state, multi-camera video, language instruction, LeRobotDataset. | Solution/product | VERIFIED: teleop hiện có; recording E2E cần xác minh. |
| P-09 | MuJoCo/gym-aloha bimanual simulation dùng prototype task, domain randomization, sim-data và pre-deployment evaluation. | Solution/product | VERIFIED scope; implementation/evidence chưa có. |
| P-10 | Fine-tune SmolVLA, train ACT/Diffusion Policy và so sánh. | Solution/product | NEEDS_CONFIRMATION: nhóm quyết định SmolVLA-only; phần ACT/Diffusion cần Record of Changes. |
| P-11 | Runtime nhận language instruction, chạy selected policy, điều khiển 2 arm closed loop có safety. | Solution/product | INFERRED: control/teleop có code; autonomous inference chưa xác nhận. |
| P-12 | Dashboard hiển thị dataset stats, training curves/logs, live camera/arm/task outcome. | Solution/product | INFERRED: có control/dashboard surface; chưa xác nhận dashboard data E2E. |
| P-13 | Benchmark dataset và report về success rate/generalization. | Product | VERIFIED: task khởi đầu là pick cube/bút vào hộp; protocol còn cần đặc tả. |

## Functional requirements thô

| ID | Ý gốc tách ra | Loại | Suy ra / chưa rõ |
| --- | --- | --- | --- |
| P-14 | Researcher/Student đăng nhập và quản lý personal workspace/project. | FR | NEEDS_CONFIRMATION: nhóm đề xuất OUT_OF_SCOPE local-first. |
| P-15 | Teleoperate dual-arm rig để ghi episode, real hoặc simulation. | FR | VERIFIED: teleop Must-have; simulation recording cần xác minh. |
| P-16 | Annotate episode bằng language instruction và success/failure. | FR | NEEDS_CONFIRMATION: schema và workflow chưa có. |
| P-17 | Browse/replay/delete episode; import/export LeRobotDataset. | FR | NEEDS_CONFIRMATION: chưa thấy implementation. |
| P-18 | Configure/launch training job, theo dõi progress/metrics. | FR | NEEDS_CONFIRMATION: pipeline/dashboard chưa hoàn thiện. |
| P-19 | Deploy checkpoint, gửi language command, chạy real/sim. | FR | NEEDS_CONFIRMATION: autonomous inference chưa hoàn thiện. |
| P-20 | Chuyển simulation và hardware mode cho cùng task pipeline. | FR | NEEDS_CONFIRMATION: cần task/interface chung. |
| P-21 | Xem dual-camera, joint state và execution log trong teleop/inference. | FR | NEEDS_CONFIRMATION: data source và sync chưa chốt. |
| P-22 | Control system ingest camera + dual-arm proprioception. | FR | NEEDS_CONFIRMATION: camera mapping/schema chưa chốt. |
| P-23 | Policy ground language instruction với visual observation và sinh synchronized bimanual action. | FR | NEEDS_CONFIRMATION: thuộc SmolVLA/inference scope, chưa có evidence. |
| P-24 | Detect workspace violation, force excess hoặc task failure; safety stop. | FR | VERIFIED một phần: workspace/joint/rate/stale-input có code; force/task-failure detection chưa xác minh. |
| P-25 | Ghi execution trace về dataset để train tiếp. | FR | NEEDS_CONFIRMATION: recorder E2E chưa xác minh. |
| P-26 | Admin quản lý account/role, shared dataset/checkpoint, hardware profile, health/training/safety incident. | FR | NEEDS_CONFIRMATION: login/RBAC đề xuất OUT_OF_SCOPE; các phần còn lại cần tách scope. |

## NFR và constraints thô

| ID | Ý gốc tách ra | Loại | Suy ra / chưa rõ |
| --- | --- | --- | --- |
| P-27 | Control loop mục tiêu khoảng 30 Hz, inference latency không phá closed-loop. | NFR thô | NEEDS_CONFIRMATION: chưa có môi trường/phương pháp đo. |
| P-28 | Mất communication với arm/camera phải fail-safe; luôn có E-stop. | NFR/constraint | VERIFIED: nhóm chốt timeout 1 s → hold; E-stop locks motion. |
| P-29 | Dataset versioned theo LeRobotDataset/Hugging Face Hub. | Constraint | VERIFIED: Hub được chọn lưu dataset/checkpoint. |
| P-30 | Task/pipeline chạy simulation khi không có hardware và transfer tối thiểu giữa supported hardware. | Portability NFR | NEEDS_CONFIRMATION: mức transfer/compatibility chưa chốt. |
| P-31 | Dashboard giúp researcher/student vận hành routine không cần scripting. | Usability NFR | NEEDS_CONFIRMATION: local-first dashboard tối thiểu cần xác định. |
| P-32 | Scale vài nghìn episode real + simulated, GPU training. | Scalability NFR thô | Mâu thuẫn với 150 real episode và quota GPU chưa chốt. |

## Research và work package

| ID | Ý gốc tách ra | Loại | Suy ra / chưa rõ |
| --- | --- | --- | --- |
| P-33 | Research question so sánh SmolVLA với ACT/Diffusion Policy trên limited real + simulated bimanual data. | Research question | NEEDS_CONFIRMATION: phải viết lại nếu SmolVLA-only. |
| P-34 | Objectives gồm benchmark task, comparison ba policy và đo ảnh hưởng sim+real data. | Research objective | NEEDS_CONFIRMATION: objective comparison cần thu hẹp/chuyển Future. |
| P-35 | Methodology dùng dual-arm SO-100/SO-101-class, MuJoCo/gym-aloha, metrics success rate/completion time/held-out configs. | Methodology | NEEDS_CONFIRMATION: hardware là SO-101; metrics/protocol chưa chốt. |
| P-36 | Dự kiến 5 work package, mỗi thành viên sở hữu một package. | Delivery plan | Mâu thuẫn: danh sách thành viên có 4 người. |

