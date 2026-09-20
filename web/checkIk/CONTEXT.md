# CHECKIK Control Context

CHECKIK là giao diện điều khiển chính thức cho phòng robot: chuẩn bị thiết bị, kiểm tra mức sẵn sàng và vận hành các phiên điều khiển. Context này thống nhất ngôn ngữ cho việc tích hợp nhiều implementation VR mà vẫn giữ một ranh giới an toàn giữa dashboard và bộ điều khiển trong VR.

## Hệ thống và vai trò

**CHECKIK**:
Giao diện và control plane chính thức của hệ thống robot. CHECKIK sở hữu việc chuẩn bị thiết bị, readiness, quyền cho phép chuyển động, vòng đời session và các thao tác Stop/E-stop/Unlock.
_Avoid_: dashboard khi nói tới toàn bộ hệ thống, frontend khi nói tới vai trò điều phối.

**Control plane**:
Phần chịu trách nhiệm quyết định một phiên có được phép bắt đầu hay không và quản lý vòng đời của phiên đó.
_Avoid_: controller, backend khi nói về quyền điều phối.

**Operator surface**:
Giao diện mà người vận hành trực tiếp dùng để quan sát tracking và điều khiển robot trong phiên VR.
_Avoid_: dashboard, VR backend.

**Operator**:
Người đeo headset và thực hiện thao tác điều khiển robot.
_Avoid_: user khi cần phân biệt với người cấu hình hệ thống.

**Follower**:
Cánh tay SO-101 vật lý nhận lệnh điều khiển từ một phiên teleoperation.
_Avoid_: robot khi cần chỉ rõ cánh tay, leader, arm device.

**Arm**:
Một nhánh điều khiển tương ứng với một follower và một phía của operator (left hoặc right).
_Avoid_: hand khi nói về phần cứng.

**Arm pair**:
Cặp ánh xạ ổn định giữa left/right operator input và left/right follower.
_Avoid_: bimanual robot khi chỉ đang nói về hai follower độc lập.

## VR và phiên điều khiển

**VR implementation**:
Một implementation hoàn chỉnh của hành vi VR, bao gồm operator surface, tracking transport, control loop và safety behavior.
_Avoid_: VR mode khi muốn nói đến implementation.

**VR Control (`vr_control`)**:
Implementation VR hiện tại của CHECKIK, được giữ lại để vận hành và rollback trong giai đoạn chuyển đổi.
_Avoid_: old VR, legacy VR.

**VR LeKiwi (`vr_lekiwi`)**:
Implementation VR dựa trên bộ điều khiển WebXR LeKiwi đã được kiểm thử, dùng operator surface riêng và điều khiển các follower được CHECKIK cấp quyền.
_Avoid_: new VR, experimental VR sau khi implementation này trở thành mặc định.

**VR session**:
Một lần vận hành có phạm vi rõ ràng: implementation, arm mode, các follower được cấp quyền và trạng thái safety.
_Avoid_: connection, task khi nói về toàn bộ lần vận hành.

**Arm mode**:
Phạm vi arm của một VR session: `left-only`, `right-only` hoặc `dual-arm`; `dual-arm` là lựa chọn mặc định.
_Avoid_: side, profile khi mô tả phạm vi điều khiển.

**Single-arm session**:
VR session chỉ cấp quyền cho một follower, thuộc `left-only` hoặc `right-only`.
_Avoid_: one-sided mode.

**Dual-arm session**:
VR session cấp quyền đồng thời cho cả left và right follower. Session không được bắt đầu nếu thiếu hoặc không sẵn sàng một trong hai follower.
_Avoid_: two-arm mode khi cần tên chuẩn.

**Adapter**:
Ranh giới kết nối giữa một VR implementation và các follower mà CHECKIK đã cấp quyền; adapter chuyển cấu hình phiên và lệnh điều khiển mà không để implementation đọc trực tiếp trạng thái nội bộ của CHECKIK.
_Avoid_: bridge khi nói về ranh giới kiến trúc; bridge chỉ nên dùng cho transport cụ thể.

## Readiness và safety

**Readiness**:
Tập điều kiện phải đúng trước khi một VR session được phép bắt đầu, gồm assignment, calibration, device availability, motion authorization và process readiness theo arm mode.
_Avoid_: setup complete, connected khi chỉ mới thỏa một phần điều kiện.

**Motion authorization**:
Quyền cấp ở control plane cho phép một session được gửi lệnh chuyển động tới follower.
_Avoid_: motion enabled khi nói về một trạng thái UI cụ thể.

**Motion lock**:
Trạng thái từ chối quyền chuyển động, khiến session thật không thể bắt đầu hoặc không thể tiếp tục điều khiển follower.
_Avoid_: disabled, stopped khi nguyên nhân là khóa quyền.

**Latched motion lock**:
Motion lock được giữ sau E-stop và không tự mất khi process kết thúc hoặc được khởi động lại.
_Avoid_: temporary lock, process lock.

**Unlock**:
Hành động có chủ đích của operator để gỡ latched motion lock; sau Unlock, readiness vẫn phải được kiểm tra lại trước khi tạo session mới.
_Avoid_: resume, restart.

**Clutch**:
Cơ chế deadman của từng arm: arm chỉ nhận chuyển động khi operator đang giữ tín hiệu clutch hợp lệ; khi nhả, arm chuyển sang hold.
_Avoid_: enable button, grip khi nói về chức năng.

**Hold**:
Trạng thái follower giữ pose/lệnh an toàn gần nhất khi clutch được nhả, tracking bị mất hoặc session đang shutdown.
_Avoid_: pause khi follower vẫn phải duy trì pose.

**Stale tracking**:
Tình trạng input VR quá cũ hoặc không còn đáng tin cậy; phải thu hồi quyền điều khiển tức thời và đưa arm về hold.
_Avoid_: disconnected khi headset vẫn có thể còn kết nối nhưng dữ liệu không còn mới.

**Stop**:
Kết thúc có kiểm soát một VR session: thu hồi clutch, giữ pose, shutdown follower và đóng process/transport.
_Avoid_: E-stop, kill.

**E-stop**:
Lệnh dừng khẩn cấp có toàn bộ hành vi của Stop và đồng thời đặt latched motion lock, buộc phải Unlock và kiểm tra readiness lại.
_Avoid_: stop button khi nói về ý nghĩa safety.

**Safety boundary**:
Tập giới hạn mà control loop áp dụng để ngăn lệnh vượt quá joint, workspace, tracking freshness hoặc tốc độ chuyển động cho phép.
_Avoid_: safety check khi nói về toàn bộ envelope.
