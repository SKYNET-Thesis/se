# B6 — Business Rules

> Trạng thái: draft chờ duyệt B4–B9. “Nguồn” phân biệt câu trả lời nhóm, phiếu đăng ký và source/docs.

| ID | Rule | Loại | Nguồn | Trạng thái |
| --- | --- | --- | --- | --- |
| BR-01 | Một follower chỉ được điều khiển sau khi port được tìm, gán đúng arm và calibration hoàn tất. | Constraint | Workflow nhóm | VERIFIED |
| BR-02 | Control host là nơi duy nhất mở serial tới leader/follower; không auto-discovery để chạy motion. | Constraint | Code/docs | VERIFIED |
| BR-03 | Trước Teleop/Inference phải chạy check/preflight và robot ở trạng thái Ready. | Action enabler | Workflow nhóm | VERIFIED |
| BR-04 | Local Operator có thể bắt đầu thao tác trên control host/trusted LAN; không có login/RBAC trong scope hiện tại. | Constraint | Nhóm / ROC-02 | VERIFIED; GVHD approval pending |
| BR-05 | Input không được tạo action khi clutch/deadman không hợp lệ. | Constraint | Canonical docs/code | VERIFIED |
| BR-06 | Input stale, out-of-order hoặc không hợp lệ phải bị từ chối. | Constraint | Canonical docs/code | VERIFIED |
| BR-07 | Mất input hoặc tracking liên tục quá 1 giây phải đưa follower về Hold; reconnect không tự resume. | Constraint | Nhóm | VERIFIED |
| BR-08 | Stop kết thúc có kiểm soát session; E-stop khóa motion và chỉ Unlock sau inspection, reconnect, recenter. | Constraint | Nhóm / canonical docs | VERIFIED |
| BR-09 | E-stop phần mềm không thay thế E-stop vật lý hoặc giám sát con người. | Fact | Canonical docs | VERIFIED |
| BR-10 | Action teleop/inference phải qua kinematics và workspace/joint/rate safety trước follower. | Constraint | Canonical docs/code | VERIFIED |
| BR-11 | Một episode benchmark PASS chỉ khi cube/bút được pick và nằm hoàn toàn trong hộp nhựa, không có tác động ngoại cảnh. | Fact | Nhóm | VERIFIED |
| BR-12 | Dataset real mục tiêu khoảng 150 episode, split 105 train / 15 validation / 30 test. | Constraint | Nhóm | VERIFIED |
| BR-13 | Dataset/checkpoint phải lưu version và metadata trên Hugging Face Hub. | Constraint | Nhóm / P-29 | VERIFIED |
| BR-14 | SmolVLA là policy duy nhất được fine-tune/evaluate trong Capstone; ACT/Diffusion là Future/Out of scope. | Constraint | Nhóm / ROC-01 | VERIFIED; GVHD approval pending |
| BR-15 | Simulation chỉ phục vụ task benchmark và phải ghi provenance riêng với data real. | Constraint | Phiếu / scope | VERIFIED |
| BR-16 | Kết luận evaluation chỉ áp dụng cho object/configuration benchmark đã định nghĩa. | Constraint | B2 critique | VERIFIED |

