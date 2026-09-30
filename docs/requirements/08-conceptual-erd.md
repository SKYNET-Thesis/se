# B8 — Conceptual ERD

> Draft conceptual ERD: tên nghiệp vụ, quan hệ và bản số; không phải logical/physical database schema.

```mermaid
erDiagram
  ARM ||--o{ PORT_ASSIGNMENT : receives
  ARM ||--o{ CALIBRATION_PROFILE : has
  ARM }o--o{ CONTROL_SESSION : participates_in
  CALIBRATION_PROFILE ||--o{ READINESS_CHECK : supports
  READINESS_CHECK ||--o{ CONTROL_SESSION : authorizes
  CONTROL_SESSION ||--o{ SAFETY_EVENT : records
  BENCHMARK_TASK ||--o{ DEMONSTRATION_EPISODE : defines
  OBSERVATION_CONFIGURATION ||--o{ DEMONSTRATION_EPISODE : captures
  CONTROL_SESSION ||--o{ DEMONSTRATION_EPISODE : records
  DATASET_VERSION ||--o{ DEMONSTRATION_EPISODE : contains
  BENCHMARK_TASK ||--o{ SIMULATION_SCENARIO : configures
  DATASET_VERSION ||--o{ TRAINING_RUN : trains_on
  TRAINING_RUN ||--o{ MODEL_CHECKPOINT : produces
  MODEL_CHECKPOINT ||--o{ EVALUATION_RUN : is_evaluated_by
  BENCHMARK_TASK ||--o{ EVALUATION_RUN : evaluates
  SIMULATION_SCENARIO ||--o{ EVALUATION_RUN : supplies
```

## Relationship decisions

- Arm ↔ ControlSession là M:N vì một session có một hoặc hai follower và có thể tham chiếu leader tương ứng; logical model sau này cần junction `SessionArm`.
- DemonstrationEpisode có nguồn real hoặc sim; provenance phải được giữ riêng.
- TrainingRun chỉ dùng một DatasetVersion được chốt; ModelCheckpoint thuộc TrainingRun.
- EvaluationRun phải nêu checkpoint, task, target mode và outcome để tránh kết quả mồ côi.

