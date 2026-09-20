# B2 — Phản biện đề tài và đề xuất thu hẹp có kiểm soát

> Dựa trên B1, inventory Giai đoạn 1 và source code hiện trạng.  
> Trạng thái: **đề xuất chờ nhóm duyệt**. Không thay thế phiếu đăng ký v1.0.

## Nhận định chính

VISTA có lõi Capstone khả thi và đã có nền tảng mạnh: hai cặp leader–follower SO-101, teleop web/phone/VR, safety seam, video evidence và task benchmark đủ hẹp. Rủi ro lớn nằm ở việc phiếu gốc đồng thời cam kết simulation, sim-data, ba policy, autonomous inference, dataset management, dashboard và RBAC trong khi chỉ có bốn thành viên và model pipeline chưa hoàn thành.

## Quyết định đề xuất theo trụ

| Trụ | Đánh giá | Đề xuất | Lý do |
| --- | --- | --- | --- |
| Teleoperation 2 cặp SO-101 | Có code và nhóm xác nhận hardware vận hành | **GIỮ — Must** | Là nền tảng tạo data và safety evidence. |
| Pick-and-place cube/bút → hộp | Task hẹp, có điều kiện PASS rõ | **GIỮ — Must** | Có thể dùng chung cho real, sim, train, inference và evaluation. |
| Dataset 150 episode real | Khả thi hơn claim “vài nghìn episode”; split 105/15/30 đã chốt | **GIỮ — Must** | Là baseline khả thi; cần ghi giới hạn generalization. |
| Wrist + top-head camera | Có định hướng, nhưng chưa chốt mapping/schema | **GIỮ — Must, thu hẹp** | Chỉ ghi modality thực tế, không cam kết camera không có. |
| Simulation MuJoCo/gym-aloha + sim-data | In-scope nhưng chưa có evidence | **GIỮ — Must, giới hạn task** | Chỉ mô phỏng task benchmark và pre-deployment evaluation; cần xác nhận generator/domain randomization tối thiểu. |
| SmolVLA | Nhóm chọn policy duy nhất | **GIỮ — Must** | Phù hợp mục tiêu VLA; phải sửa research question/product. |
| ACT và Diffusion Policy | Phiếu gốc yêu cầu comparison, nhóm đã loại | **CHUYỂN FUTURE/OUT_OF_SCOPE** | Không được tiếp tục gọi là benchmark ba policy. Cần GVHD duyệt. |
| Autonomous inference real/sim | Là product chính nhưng chưa có code E2E | **GIỮ — Must, giới hạn 1 task** | Nghiệm thu bằng instruction của task pick-and-place và safety gate. |
| Dashboard | UI/control surfaces đã có một phần | **GIỮ — Must, tối thiểu** | Chỉ readiness/teleop status, camera/arm state, training progress và outcome; không xây product analytics lớn. |
| Login/RBAC/personal workspace | Nhóm chọn local-first, robot USB nối control host | **CHUYỂN OUT_OF_SCOPE** | Không có remote/cloud deployment; cần GVHD duyệt thay đổi. |
| Dataset repository/versioning | Hugging Face Hub đã chọn | **GIỮ — Must** | Dùng Hub cho dataset/checkpoint; không tự xây repository riêng. |

## Tính khả thi và rủi ro

| Rủi ro | Mức | Mitigation/fallback đề xuất |
| --- | --- | --- |
| 4 thành viên nhưng phiếu phân 5 WP | Cao | Gộp architecture/documentation/integration vào các WP thực thi; không để 5 owner độc lập. |
| 150 episode không đủ cho claim generalization lớn | Cao | Chỉ kết luận trên task/object/configuration đã định nghĩa; báo cáo giới hạn thay vì claim generalist VLA. |
| Kaggle/HF quota hoặc GPU thuê không đủ | Cao | Hub là storage; compute thay thế; giảm số lượt run, lưu config/checkpoint/log để tái lập. |
| Simulation/sim-data chưa tồn tại | Cao | Gate: simulation task phải chạy trước khi coi sim-data là deliverable; nếu không, escalation GVHD thay vì bịa kết quả. |
| Safety hardware | Cao | timeout 1 s → hold; E-stop lock; physical E-stop; video/log cho acceptance. |
| Mâu thuẫn tài liệu VR LeKiwi fake vs real path | Trung bình | Không tuyên bố hardware-ready nếu evidence chưa ánh xạ test case. |
| Không RBAC trên trusted LAN | Trung bình | Local-first, control host USB trực tiếp; ghi rõ đây là constraint, không phải security control. |

## Đề xuất research question thay thế

> **NEEDS_CONFIRMATION — chỉ dùng sau khi GVHD duyệt.**

"Trong một thiết lập SO-101 hai tay chi phí thấp, SmolVLA được fine-tune trên tập demonstration real khoảng 150 episode và dữ liệu mô phỏng bổ trợ đạt success rate như thế nào cho nhiệm vụ pick-and-place cube/bút vào hộp nhựa, trên các cấu hình object được định nghĩa trước?"

Điểm thay đổi: bỏ comparative claim với ACT/Diffusion Policy; không hứa hẹn generalization ngoài object/configuration của benchmark.

## Điều kiện để tạo phiếu v1.1

1. Nhóm duyệt bảng giữ/thu hẹp/chuyển Future ở trên.
2. Xác nhận simulation/sim-data tối thiểu cần có và evidence mong muốn.
3. Xác nhận dashboard tối thiểu có những màn/số liệu nào.
4. GVHD duyệt thay đổi: 4 thay vì 5 work package; SmolVLA-only; không login/RBAC/personal workspace.

