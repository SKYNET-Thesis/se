# B7 — Entity Catalog

> Conceptual entity only; chưa định nghĩa database schema, datatype hoặc API.

| Entity | Loại | Mô tả | Thuộc tính nghiệp vụ chính | Trạng thái |
| --- | --- | --- | --- | --- |
| Arm | Master | Một leader hoặc follower SO-101, có side và vai trò. | arm identity, role, side, device identity | VERIFIED |
| PortAssignment | Configuration | Gán stable USB port/device identity cho Arm. | assignment ID, port path, arm, assigned time, status | VERIFIED |
| CalibrationProfile | Configuration | Kết quả calibration của một Arm. | profile ID, arm, calibration values, version, status, time | VERIFIED |
| ReadinessCheck | Transaction | Kết quả check/preflight trước session. | check ID, arm set, checks, result, time | VERIFIED |
| ControlSession | Transaction | Một phiên teleop hoặc inference có lifecycle/safety state. | session ID, mode, active arms, state, start/end, stop reason | VERIFIED |
| SafetyEvent | Audit | Sự kiện hold, timeout, Stop, E-stop, rejection hoặc fault. | event ID, session, type, reason, timestamp | VERIFIED |
| BenchmarkTask | Master | Định nghĩa task pick cube/bút vào hộp. | task ID, object type, target container, PASS criterion | VERIFIED |
| ObservationConfiguration | Configuration | Cấu hình wrist/top-head camera và robot observation. | config ID, camera sources, arm mapping, version | NEEDS_CONFIRMATION |
| DemonstrationEpisode | Transaction | Một lần teleop ghi data cho BenchmarkTask. | episode ID, task, source real/sim, instruction, outcome, timestamps | VERIFIED |
| DatasetVersion | Master | Phiên bản bộ episode/publication trên Hub. | dataset version, split, provenance, Hub reference | VERIFIED |
| SimulationScenario | Master | Cấu hình task benchmark trong MuJoCo/gym-aloha. | scenario ID, task, object configuration, randomization config | NEEDS_CONFIRMATION |
| TrainingRun | Transaction | Một lần fine-tune SmolVLA. | run ID, dataset version, config, compute source, status, metrics | VERIFIED |
| ModelCheckpoint | Master | Artifact SmolVLA từ TrainingRun. | checkpoint ID, training run, Hub reference, version, metrics | VERIFIED |
| EvaluationRun | Transaction | Chạy checkpoint trên test split/simulation/hardware. | evaluation ID, checkpoint, task, target mode, outcomes, metrics | VERIFIED |

