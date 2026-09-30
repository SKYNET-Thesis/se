# B11 — NFR và Constraints

| ID | Requirement / threshold | Điều kiện & môi trường | Xác minh | Lý do |
| --- | --- | --- | --- | --- |
| NFR-01 | Input/tracking mất liên tục >1 s phải Hold, không auto-resume. | Web/phone/VR trên control host. | Log + video timeout test. | An toàn robot. |
| NFR-02 | E-stop khóa motion đến khi inspection, reconnect, recenter và preflight pass. | Hardware smoke test. | Test SAF/E-stop evidence. | Ngăn resume nguy hiểm. |
| NFR-03 | Inference đạt ≥7/10 PASS cho cube và ≥7/10 cho pen; 20 trial tổng. | Benchmark object/configuration chốt. | EvaluationRun + video/log. | Tiêu chí nghiệm thu model. |
| NFR-04 | Dataset real có 150 episode: 105/15/30; mỗi episode chứa 2 wrist + 2 head camera metadata, instruction và outcome. | Dataset validation trước train. | Manifest/schema check. | Tái lập training/evaluation. |
| NFR-05 | Real/sim provenance phải phân biệt được ở every episode/dataset version. | Hub dataset. | Metadata audit. | Không nhầm kết quả sim với hardware. |
| NFR-06 | Dashboard/control host chỉ local/trusted LAN; không expose Internet control. | Deployment config. | Network/config review. | Giới hạn safety/deployment scope. |

