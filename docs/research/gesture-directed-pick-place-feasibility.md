# Khảo sát: chỉ tay để SO-101 gắp và đặt vật

Ngày khảo sát: 2026-09-28. Phạm vi: đọc code và tài liệu gốc; chưa thử nghiệm trên follower, chưa sửa production code. Các đánh giá độ khó, lựa chọn MVP và tiêu chí đo dưới đây là đề xuất kỹ thuật, không phải kết quả benchmark.

## Kết luận

Ý tưởng khả thi cho tabletop có kiểm soát: operator chọn vật và vị trí đặt, hệ thống tự thực hiện pick-and-place. VISTA đã có một phần nền tảng điều khiển follower, IK/FK và kiểm tra giới hạn. Phần cần bổ sung lớn nhất là nhận biết vị trí vật trong hệ tọa độ robot, sinh tư thế gắp phù hợp và thực thi chuỗi hành động có kiểm tra kết quả.

Khả năng “chỉ vật bất kỳ trong phòng rồi gắp ngay” chưa được chứng minh bởi code hiện tại. Giảm thao tác tay là mục tiêu UX hợp lý, nhưng cần đo thời gian, số lần can thiệp và mức mỏi tay so với teleoperation để chứng minh lợi ích.

## 1. Nền tảng hiện tại và khoảng trống

Code được đọc trực tiếp:

- [README teleoperation](../../web/checkIk/dual_arm_vr_teleop/README.md) mô tả cả Vuer hand teleop và prototype WebXR; cần xác định đúng frontend đang vận hành trước khi tích hợp gesture mới.
- [Offline bridge](../../web/checkIk/dual_arm_vr_teleop/backend/offline_teleop_server.py) có phép đổi trục `WEBXR_TO_ROBOT`, động học và xử lý chuyển động tương đối. Đây chưa phải phép hiệu chuẩn vị trí tuyệt đối giữa headset, camera và chân đế follower.
- [Real bridge](../../web/checkIk/dual_arm_vr_teleop/backend/real_vr_teleop_server.py) đọc khớp thật làm seed, kiểm tra giới hạn khớp/workspace và điều kiện hóa lệnh trước khi gửi phần cứng.
- [Robot controller](../../web/checkIk/dual_arm_vr_teleop/robot/controller.py) có nội suy khớp và kiểm tra hội tụ khớp đo được. `solve_end_effector()` chỉ đưa vị trí tới solver; task gắp cần kiểm tra thêm hướng gripper, toàn bộ đường đi và kết quả giữ vật.
- [Safety primitives](../../web/checkIk/dual_arm_vr_teleop/robot/safety.py) kiểm tra finite, joint limits, joint delta và workspace TCP. Các kiểm tra này không bao hàm tự va chạm hoặc va chạm mọi link với bàn/vật khác.
- [Camera worker](../../web/checkIk/dual_arm_vr_teleop/backend/camera_worker.py) hiện mở V4L2/OpenCV và phát MJPEG. File này chưa cung cấp depth, intrinsics/extrinsics hoặc pose vật.

Đề xuất đặt perception và task executor gần control stack Python đang điều khiển follower; dashboard/backend sản phẩm có thể cung cấp phiên, yêu cầu task và trạng thái. Đây là đề xuất tích hợp, chưa phải quyết định kiến trúc đã được phê duyệt.

## 2. Chỉ tay thực sự cung cấp thông tin gì?

WebXR cung cấp `targetRaySpace` cho tia trỏ và Hand Input cung cấp 25 joint. Với frontend có hỗ trợ hand input, có thể raycast để chọn mục tiêu và dùng pinch để xác nhận. Native OpenXR có `aimPose`, trạng thái aim hợp lệ và pinch strength. Việc runtime/device đang dùng thực sự expose các tín hiệu nào cần kiểm tra tại chỗ. [WebXR Device API](https://www.w3.org/TR/webxr/), [WebXR Hand Input](https://www.w3.org/TR/webxr-hand-input-1/), [OpenXR aim state](https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrHandTrackingAimStateFB.html).

Một tia trỏ biểu diễn hướng lựa chọn; muốn tìm điểm cuối phải có đối tượng/hình học để tia giao vào. Suy luận kỹ thuật: hand tracking không tự cho biết vật thật nào được chỉ hoặc khoảng cách đến vật. Hệ thống cần thêm camera/perception hoặc một mặt bàn/digital twin đã căn chỉnh.

Luồng UX đề xuất: trỏ → highlight ứng viên → pinch chọn vật → trỏ và chọn nơi đặt → hiện preview → xác nhận thực thi. Áp dụng smoothing, vùng chọn rộng hơn silhouette và hysteresis để tránh đổi mục tiêu khi tay rung. Gesture chọn vật cần tách khỏi gesture clutch/gripper đang dùng. Đây là đề xuất UX, cần thử trên headset thực tế.

## 3. Hai cách tương tác có độ phức tạp khác nhau

| Phương án | Cách hoạt động | Nhận định cho MVP |
|---|---|---|
| Chỉ vào ảnh camera trong VR | Ray giao với panel ảnh, đổi điểm trên panel thành pixel rồi chọn detection | Ưu tiên nếu operator ở xa; không phải hiệu chuẩn vị trí headset với bàn thật |
| Chỉ trực tiếp vào vật/bàn thật | Ray ở hệ XR giao với bàn hoặc object đã đăng ký trong cùng hệ | Trực quan nếu cùng phòng, nhưng thêm hiệu chuẩn XR↔robot và xử lý recenter |

Trong cả hai phương án, camera vẫn phải được hiệu chuẩn với follower. Chỉ vào panel chỉ loại bỏ một phép đăng ký hệ XR với bàn thật; nó không loại bỏ calibration camera↔robot.

Meta có Passthrough Camera API dựa trên Android Camera2 cho Quest 3/3S. Nguồn này không đủ để kết luận frontend Vuer/WebXR hiện tại truy cập được ảnh camera headset. Cần thử quyền, browser/runtime và API của thiết bị đang triển khai; fixed camera ngoài là đường MVP ít phụ thuộc camera headset hơn. [Meta Passthrough Camera API](https://developers.meta.com/horizon/documentation/spatial-sdk/spatial-sdk-pca-overview/).

## 4. Nhận biết vật và vị trí gắp

MVP nên dùng camera cố định nhìn xuống bàn, vật nhẹ, không chồng, nền tương phản và nhóm hình dạng biết trước. Có thể dùng vật gắn AprilTag, hoặc segmentation theo màu/contour cho vật đã giới hạn. AprilTag hỗ trợ pose estimation với kích thước tag và intrinsics camera đã biết; tag trên vật vẫn cần offset từ tâm tag đến grasp pose. [AprilRobotics implementation](https://github.com/AprilRobotics/apriltag#pose-estimation).

Homography ánh xạ điểm giữa các mặt phẳng; phù hợp tìm vị trí trên bàn sau khi hiệu chuẩn. Nó không xác định chiều cao/tư thế đầy đủ của vật. Không nên lấy tâm bounding box trên mặt trên của một vật cao rồi coi đó là tọa độ chân vật trên mặt bàn. MVP cần chiều cao/hình học biết trước hoặc bước bù hình học; vật đa dạng hơn cần depth hoặc pose estimation thích hợp. [OpenCV homography tutorial](https://docs.opencv.org/4.5.1/d9/dab/tutorial_homography.html).

Phân biệt rõ: chọn đúng object ID; ước lượng vị trí/hướng object; sinh grasp pose; theo dõi object trước và sau gắp. Một detector 2D trả về bounding box không tự giải quyết ba bước còn lại. Khi operator chọn xong, lưu object ID với timestamp và đo lại trước approach; nếu vật đổi vị trí quá ngưỡng cho phép, hủy hoặc yêu cầu chọn lại. Không cần đuổi theo vật đang di chuyển trong MVP.

## 5. Hiệu chuẩn và độ chính xác

Với camera ngoài, cần intrinsics/distortion, `T_base_camera` và offset TCP/gripper. Khi chỉ bàn thật, cần thêm `T_base_xr`. Với hai follower, mỗi chân đế có transform riêng. Camera gắn cổ tay cần hand-eye calibration và cập nhật transform theo FK. OpenCV có camera calibration, solvePnP và hand-eye calibration; phải chọn đúng bài toán camera cố định hay camera trên gripper. [OpenCV calibration](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html).

Theo quy ước `T_A_B` biến tọa độ từ B sang A, `p_base = T_base_camera * p_camera`. Phép đổi dấu/đổi trục trong teleop tương đối không đủ để suy ra phép này. Đo extrinsic bằng marker và điểm có vị trí biết trong hệ robot; kiểm tra trên các điểm độc lập không dùng để fit.

Ví dụ hình học minh họa, không phải sai số đo của Quest: tại khoảng cách 0,5 m, sai hướng 2° lệch khoảng `0,5 × tan(2°) = 17,5 mm`. Vì vậy dùng trỏ tay để chọn vật và snap vào detection hợp lý hơn dùng điểm tay làm tâm gắp chính xác.

Không có một yêu cầu “độ chính xác 5 mm” đúng cho mọi vật. Với gripper mở rộng `g` và vật rộng `w`, khoảng hở mỗi bên lý tưởng là `(g-w)/2`; sai số localization, calibration, cơ khí và nghiêng vật phải nằm trong margin đó với phần dự phòng. Cần đo bằng setup thật trước khi quyết định vật/grasp khả thi.

## 6. Từ IK đến pick-and-place

SO-101 trong code hiện tại có năm khớp chuyển động tay và một actuator gripper. Không nên coi sáu actuator này là tay có sáu bậc tự do pose độc lập. Grasp pose cần được lọc theo khả năng đạt vị trí và hướng thực tế; kiểm tra top-down/side grasp theo từng vùng thay vì giả định robot đạt mọi quaternion. [LeRobot SO-101 motor table](https://huggingface.co/docs/lerobot/so101), [real bridge joint list](../../web/checkIk/dual_arm_vr_teleop/backend/real_vr_teleop_server.py).

Chuỗi task đề xuất:

```text
Selected → Preview → Confirmed → Pre-grasp → Approach
→ Close → Verify grasp → Lift → Transfer → Place
→ Open → Retreat → Verify placement → Completed
```

Mỗi bước cần timeout, điều kiện thành công và đường chuyển sang Hold/abort. Với bàn ít vật và đường đi đơn giản, bắt đầu bằng waypoint executor có kiểm tra IK, hướng gripper và clearance cho mọi đoạn. Joint interpolation không đảm bảo TCP đi thẳng hoặc các link không chạm bàn. Nếu mở rộng sang clutter/đường tránh vật, cần mô hình collision và motion planner đầy đủ.

MoveIt Task Constructor là tham khảo tốt cho phân tách task thành approach, grasp, lift, transfer và place, cùng quản lý object trong planning scene. Đây là công cụ có thể cân nhắc ở giai đoạn mở rộng; tài liệu không chứng minh SO-101 trong repo đã được tích hợp MoveIt. [MoveIt pick-and-place tutorial](https://moveit.picknik.ai/main/doc/tutorials/pick_and_place_with_moveit_task_constructor/pick_and_place_with_moveit_task_constructor.html).

Gripper đóng tới setpoint chưa chứng minh đã gắp vật. MVP nên kiểm tra camera sau lift: vật có rời bàn và đi cùng gripper không. Joint feedback không thay thế cảm biến lực hoặc quan sát object. Tương tự, chỉ báo Completed sau khi kiểm tra vật nằm trong vùng đặt.

## 7. Quyền điều khiển và Hold

Autonomous task phải có ownership follower độc quyền: teleop và executor không được gửi lệnh cùng lúc. Xác nhận nên chốt object ID, place target, pose snapshot, calibration version và hạn dùng kế hoạch; E-stop/manual takeover phải được executor kiểm tra trong lúc chạy, kể cả giữa trajectory dài.

Clutch hiện tại được thiết kế cho input liên tục. Muốn operator hạ tay sau khi xác nhận cần mô hình quyền chạy autonomous task riêng; không âm thầm coi một pinch là clutch vĩnh viễn. Mất kết nối/supervision, perception quá cũ hoặc không đạt waypoint đưa task sang trạng thái lỗi/Hold theo cơ chế kiểm soát có chủ đích. Khi đang giữ vật, không mặc định mở gripper. Dừng software và ngắt torque có thể gây hạ tay/rơi vật; cần kiểm chứng hành vi thực tế.

## 8. MVP và cách chứng minh thực tiễn

Phạm vi đề xuất: một follower, một camera ngoài cố định, mặt bàn hiệu chuẩn, 3–5 vật nhẹ dạng đơn giản, không chồng, 1–2 khay lớn làm đích, vật đứng yên. Operator chọn trên ảnh camera hoặc digital twin đã đăng ký; hệ thống dùng grasp template đã kiểm tra và preview trước chạy.

Thực hiện theo ba mốc có tiêu chí dừng rõ:

1. Chỉ chọn: đánh giá chọn đúng object/đích, mất tracking và xung đột gesture; chưa chạy follower.
2. Định vị + dry-run: kiểm tra tọa độ ở điểm độc lập, reachability/hướng gripper và clearance trong digital twin; chạy waypoint không gắp ở tốc độ thấp sau xác nhận.
3. Pick-and-place thật: ghi số task thành công, gắp hụt, thả sai, abort và manual recovery theo từng vật/vị trí.

Benchmark đề xuất tối thiểu 30 lần với vị trí được thay đổi trong vùng đã kiểm tra; báo tỷ lệ thành công theo từng loại vật cùng số mẫu, không chỉ video vài lần đẹp. Đo selection accuracy, sai số localization, end-to-end success, cycle time, số lần operator can thiệp và thời gian phải giơ tay. So sánh cùng task với VR teleop để xác nhận mục tiêu giảm thao tác.

Rủi ro chi phối là calibration/hình học gắp và độ ổn định follower. Vật trong suốt, bóng, mềm, chồng nhau, hoặc yêu cầu xoay chính xác tăng độ khó; bimanual thêm inter-arm collision và điều phối. Chưa đủ dữ liệu để đưa ra tỷ lệ thành công, payload, giá phần cứng hoặc lịch hoàn thành đáng tin cậy. Có thể demo bounded tabletop trước; general-purpose manipulation nên là giai đoạn sau dựa trên số đo.
