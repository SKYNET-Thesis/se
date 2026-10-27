Tiếp tục thực hiện phương án tổ chức hồ sơ Review 2 đã đề xuất. Tôi đã duyệt phương án; hãy bắt đầu làm, không dừng lại để xin xác nhận lại cấu trúc thư mục.

Mục tiêu là hoàn thiện và đồng bộ hồ sơ VISTA Review 2 với repository hiện tại, sử dụng đúng biểu mẫu của môn học và xuất DOCX/PDF có thể kiểm tra, chỉnh sửa và nộp.

**1. Đầu vào và nguyên tắc**

Đọc AGENTS.md cùng các skill documents, pdf và spreadsheets phù hợp trước khi xử lý.

Tất cả đầu vào nằm trong `review-2-inbox/`, bao gồm ZIP hồ sơ cũ, `diagramall.drawio.xml`, yêu cầu Review 2 và các file bổ sung. Giải nén và đọc nội dung, không chỉ phân loại theo tên file.

- Mã môn tôi yêu cầu: `SEP490`.
- Mã đề tài: `FA26SE183`, không phải `FA26S183`.
- Nhóm: `GFA26SE94`.
- GVHD: Lâm Hữu Khánh Phương.
- Tên đề tài chính thức phải đối chiếu phiếu đã được duyệt. Không tự đổi tên chính thức thành tên mô tả sản phẩm.
- Hướng dẫn gốc dùng tiền tố SWP490; ghi nhận khác biệt trong README, nhưng dùng SEP490 theo yêu cầu của tôi cho các file đầu ra.
- Hồ sơ viết bằng tiếng Anh; báo cáo tiến độ cho tôi bằng tiếng Việt.
- Đọc PDF hướng dẫn đầy đủ 7 trang. File TXT có thể thiếu mục 09; không xem TXT là toàn bộ yêu cầu.

Phân biệt rõ phạm vi được duyệt, thiết kế mục tiêu, phần đã triển khai và phần đã kiểm thử. Code là bằng chứng triển khai, không phải căn cứ để tự thu hẹp phạm vi đăng ký.

**2. Tổ chức tài liệu**

Dùng cấu trúc `docs/review-2/` đã đề xuất với các thư mục 00-guidelines đến 07-submission và 99-archive.

- Lưu nguyên bộ đầu vào trong `99-archive/imported-2026-10-27/`.
- Mỗi hồ sơ có một bản làm việc chính; DOCX và PDF cùng tên gốc.
- Chỉ gộp file trùng khi đã kiểm tra hash; giữ nguồn gốc trong manifest.
- Di chuyển nội dung `docs/review2/` vào `05-tracking/repo-audit/` và cập nhật đường dẫn tham chiếu liên quan. Không xóa hoặc ghi đè thay đổi sẵn có của người dùng.
- Giữ `docs/diagrams/` là vị trí nguồn Mermaid/PlantUML. `04-diagrams/` chứa XML draw.io, ảnh xuất và bản đồ liên kết tương ứng.
- Không đưa bản pending hoặc draft vào `07-submission/`.

Tạo README với bảng trạng thái SOURCE / DRAFT / BLOCKED / FINAL, đường dẫn bản chính, nguồn gốc, các điểm còn thiếu và điều kiện đủ để nộp.

**3. Sử dụng XML sơ đồ mới**

`diagramall.drawio.xml` là nguồn hình vẽ mới nhất do tôi cung cấp. File có 23 trang:

- 01–03: C4 Level 1, 2, 3.
- 04–07: Activity WF-01 đến WF-04.
- 08–11: State Machine.
- 12: Conceptual ERD.
- 13–15: Logical ERD theo miền.
- 16a: Logical ERD — Programs & Assessment.
- 16b: Logical ERD — AI & Datasets.
- 17–22: Physical ERD theo miền.

Đây là 23 trang thực tế, không phải 22; phần ERD có 12 trang. Không bỏ sót 16b. XML này không chứa sơ đồ AWS deployment.

Thực hiện:

1. Lập manifest từ XML: page ID, tên trang, thứ tự, loại sơ đồ, file ảnh xuất, nguồn Mermaid/PlantUML tương ứng, vị trí sử dụng trong report.
2. Xuất trực tiếp từng trang bằng renderer tương thích draw.io/diagrams.net, ưu tiên SVG và PNG độ phân giải cao. Kiểm tra hình render, tránh mất connector, font, nhãn hoặc biểu tượng.
3. Không dùng ImageGen, không vẽ lại gần giống và không lấy ảnh cũ thay cho XML mới.
4. Nếu môi trường không xuất được, thử công cụ phù hợp đang có. Nếu vẫn bị chặn, ghi đúng lỗi và tiếp tục phần việc khác; không giả vờ đã xuất thành công.
5. Đối chiếu C4, actor, state, ERD, FK, cardinality, nullable và unique với code/schema/migration. Tên “Reviewed” hoặc “Fixed” trong XML không tự chứng minh sơ đồ đã khớp code.
6. Không âm thầm sửa thiết kế gốc. Nếu phát hiện lệch, giữ nguyên XML nhập và ghi rõ chênh lệch; mọi bản sửa phải lưu riêng, có change log và đồng bộ nguồn Mermaid/PlantUML.
7. Dùng ảnh mới trong Report 3/4; bỏ hình mẫu và hình cũ bị thay thế. Cập nhật caption, số hình, mục lục và cross-reference theo manifest.
8. Với ERD lớn, bố trí trang hoặc hình theo miền để đọc được. Không ép toàn bộ ERD thành ảnh nhỏ trên trang dọc.

**4. Sửa đồng bộ nội dung hồ sơ**

Đối chiếu Registration → SRS → SDD → BM01 → test/tracking → code.

Tạo bảng truy vết cho từng tính năng:
Registration reference | FR | Actor | Acceptance criteria | Workflow | Entity/state | Diagram | Code/API | Test ID | Owner | Status.

Không giới hạn FR ở sáu mục nếu phạm vi thực tế cần nhiều hơn. Nếu đổi ID, cập nhật toàn bộ tham chiếu.

Các lỗi đã được báo cần kiểm tra lại và sửa nếu còn:

- Sai mã FA26S183 trong tên file.
- Số điện thoại sinh viên bị chèn mã đề tài; chỉ sửa bằng dữ liệu nguồn xác thực, không đoán số đúng.
- Thành viên bị lặp trong Report 1.
- Tên đề tài khác nhau giữa các hồ sơ.
- Placeholder trong mục lục, heading và bảng.
- Ví dụ Java/MVC, Voucher.java, tính tiền món ăn, khấu trừ lương hoặc bàn giao tài sản không thuộc VISTA.
- Sơ đồ và tham chiếu ERD cũ không khớp XML mới.
- NFR thiếu metric, threshold, measurement method.
- Công nghệ chỉ ghi “version per lockfile” mà chưa trích phiên bản thực tế.
- Khai báo dịch vụ ngoài, mục đích, dữ liệu gửi đi, công cụ/mô hình AI, môi trường triển khai và rollback chưa đầy đủ.

Giữ biểu mẫu chính thức, cấu trúc mục và tab Excel hiện có. Xóa hướng dẫn điền và ví dụ mẫu trong bản hoàn thiện. Cập nhật mục lục bằng nội dung thực tế.

Registration phải kèm BM03 trong cùng PDF nộp. Nếu thiếu phiếu đã duyệt hoặc biên bản Review 1, hoàn thiện phần có thể làm và ghi BLOCKED đúng chỗ; không tạo lịch sử phê duyệt hay đánh dấu “No changes” khi chưa đối chiếu được.

Report 4 cần mô tả đủ kiến trúc, database, state, workflow, API/business rules và các khai báo công nghệ mà hướng dẫn yêu cầu. Phân biệt System Admin với School Admin.

Không chỉnh application code, database hoặc CI chỉ để làm tài liệu có vẻ nhất quán. Nếu phát hiện lỗi triển khai, ghi issue, bằng chứng, tác động và đề xuất xử lý.

**5. Hoàn thiện BM01**

Dùng đúng mẫu, mục 0–8 theo thứ tự:

- Phần chính tối đa 4 trang A4, font 11, lề 2 cm; Phụ lục A không tính vào giới hạn.
- System at a Glance tối đa 150 từ.
- Đúng 5 quyết định thiết kế và 3 rủi ro.
- Mandatory Features bao phủ phạm vi, có actor, tiêu chí pass/fail và test ID.
- Tối đa 6 NFR, mỗi NFR có metric, threshold và measurement method.
- Mỗi thành viên có 2–3 phần sở hữu và ít nhất một main workflow.

Phụ lục A phải có ít nhất bốn workflow cho bốn thành viên. Mỗi workflow có đúng một owner, trigger, kết quả nghiệp vụ, đường đi trạng thái và activity diagram tương ứng. Kiểm tra điều kiện workflow hợp lệ theo mục 09 của hướng dẫn.

Mỗi workflow có ít nhất một demo chính và một demo ngoại lệ: tối thiểu tám kịch bản cho bốn workflow, bao gồm WF-04. Ghi staging, dữ liệu seed, bước thực hiện và expected result; không ghi đã chạy nếu chưa chạy.

Tính số test case đề xuất bằng công thức:
3 × số tính năng bắt buộc + số main workflow + số chuyển trạng thái cần kiểm thử + số NFR.

Đếm chuyển trạng thái từ thiết kế có căn cứ, bao gồm trường hợp chuyển không hợp lệ bị từ chối theo hướng dẫn. Lập danh sách ID để kiểm tra phép đếm. Đưa con số đề xuất cụ thể khi đủ dữ liệu; không bịa để thay TBD. Con số này vẫn là đề xuất trước khi giảng viên chốt.

**6. Report 5, tracking và bằng chứng**

Hoàn thiện test specification cho toàn bộ FR, bốn workflow, state transitions và NFR trong các tab hiện có. Mỗi case có ID, liên kết yêu cầu, tiền điều kiện, dữ liệu, bước chạy, expected result, owner và trạng thái.

Chạy các test hiện có phù hợp nếu môi trường cho phép. Lưu command, thời điểm, commit SHA, kết quả và log. Nếu thiếu dependency, credentials hoặc phần cứng, ghi blocked reason.

Không đánh đồng test được thiết kế với test đã chạy. Không ghi pass, CI thành công, staging hoạt động hoặc robot đã thực thi nếu chưa có bằng chứng.

Các ngưỡng Defense 1.1 phải trích đúng mục 09; đó là mục tiêu cam kết tương lai, không phải kết quả hiện tại. Tổng số theo workflow và thành viên phải đối chiếu được, không tính trùng test case.

**7. BM02 và Git**

Không tự commit, push, tạo hoặc di chuyển tag `review-2`. Kiểm tra tag có tồn tại không và trỏ đến SHA nào; ghi nhận chính xác trạng thái working tree.

Trước hết hoàn thiện tài liệu và chạy kiểm tra nội bộ. Đây chưa phải BM02 chính thức.

Nếu có phiên bản `review-2` hợp lệ chứa đúng đầu vào cần rà soát, chạy riêng nguyên prompt chuẩn từ hướng dẫn ở chế độ report-only. Không thêm yêu cầu làm thay đổi prompt và không sửa file trong lần review đó.

Giữ nguyên toàn bộ output gốc trong evidence; chuyển nguyên kết quả và Top 5 findings vào BM02, chỉ bổ sung Team response theo mẫu. Ghi đúng công cụ, model nếu biết, ngày chạy, SHA và phiên bản Registration. Không đoán model.

Nếu chưa có tag hợp lệ hoặc tag chưa chứa hồ sơ đang sửa, để BM02 BLOCKED và chuẩn bị sẵn mọi thứ cho lần chạy chính thức. Không dùng kết quả trên working tree rồi ghi là đã chạy trên tag.

Team response chỉ ghi Fixed khi có commit thật; Kept phải có lý do; Planned phải có owner và hạn có căn cứ. Các High Kept/Planned phải xuất hiện trong Known Gaps của BM01.

BM04 chỉ chuẩn bị dự thảo. Không điền thay kết luận, chữ ký hoặc xác nhận của giảng viên.

**8. Kiểm tra đầu ra và bàn giao**

Render các DOCX/PDF và kiểm tra trực quan: khổ giấy, bảng tràn, chữ bị cắt, heading, page break, mục lục, caption, ảnh và độ đọc được của sơ đồ. BM01 bắt buộc đúng A4; các report dùng A4 thống nhất nếu mẫu chính thức không quy định khác.

Chỉ đưa PDF đạt điều kiện vào `07-submission/`. File còn vướng dữ liệu bắt buộc phải ở DRAFT/BLOCKED, kèm lý do rõ ràng.

Cuối công việc, báo cáo:
- Các file đã hoàn thiện và đường dẫn.
- Những thay đổi quan trọng.
- Kiểm tra đã chạy cùng kết quả.
- Các mục còn BLOCKED và thông tin cần tôi bổ sung.
- Trạng thái repo/tag và bước còn lại để hoàn tất BM02 chính thức.

Tiếp tục làm hết các phần có thể thực hiện. Không dừng sau khi chỉ sắp xếp folder hoặc viết kế hoạch.