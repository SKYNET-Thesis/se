# VISTA Control Context

VISTA là hệ thống robot-learning cho thao tác tabletop hai cánh tay, bao gồm teleoperation, dữ liệu demonstration, policy và vận hành robot. Từ vựng này tách ranh giới an toàn giữa người vận hành, control plane và phần cứng.

## Robot operation

**Leader**:
Cánh tay đầu vào mà operator di chuyển để tạo mục tiêu điều khiển cho follower.
_Avoid_: robot điều khiển, master arm

**Follower**:
Cánh tay SO-101 vật lý nhận action từ một phiên điều khiển.
_Avoid_: robot, leader arm

**Arm pair**:
Một ánh xạ ổn định gồm một leader và một follower; hệ thống hiện có hai cặp.
_Avoid_: bimanual robot khi cần chỉ rõ từng kênh độc lập

**Teleoperation session**:
Một phiên có thời hạn mà operator điều khiển một hoặc hai follower qua một phương thức input đã chọn.
_Avoid_: connection, task

**Clutch**:
Cơ chế deadman chỉ cho phép follower chuyển động khi tín hiệu giữ điều khiển hợp lệ.
_Avoid_: enable button

**Hold**:
Trạng thái follower giữ lệnh/pose an toàn gần nhất sau khi clutch được nhả hoặc input không còn tin cậy.
_Avoid_: pause

## Robot learning

**Demonstration episode**:
Một lần ghi dữ liệu thao tác có phạm vi task, instruction, observation, action và outcome rõ ràng.
_Avoid_: video, recording

**Policy**:
Mô hình sinh action cho robot từ observation và, khi áp dụng, natural-language instruction.
_Avoid_: model khi cần phân biệt checkpoint hoặc thuật toán huấn luyện

**Benchmark task**:
Một tác vụ tabletop được định nghĩa để thu thập dữ liệu và đánh giá policy theo cùng protocol.
_Avoid_: demo chung chung
