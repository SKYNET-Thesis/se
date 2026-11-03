# Conceptual ERD

Source: draw.io page 12 (Report 4, Figure 12). Entities and relationships only — no attributes, no keys. Many-to-many links (Classroom–Assignment, Organization–Robot…) become junction tables in the logical/physical model.

```mermaid
erDiagram
  ORGANIZATION ||--o{ USER_MEMBERSHIP : "has members"
  ORGANIZATION ||--o{ CLASSROOM : operates
  COURSE ||--o{ ASSIGNMENT : "defines work"
  CLASSROOM }o--o{ ASSIGNMENT : receives
  USER_MEMBERSHIP ||--o{ SUBMISSION : submits
  ASSIGNMENT ||--o{ SUBMISSION : collects
  USER_MEMBERSHIP ||--o{ PROGRAM : creates
  PROGRAM |o--o{ SUBMISSION : "versioned work"
  ORGANIZATION }o--o{ ROBOT : "entitled to"
  ROBOT |o--o{ EXPERIMENT : "used for"
  SUBMISSION |o--o{ EXPERIMENT : "may provide input"
  EXPERIMENT }o--o{ AI_MODEL : "references evidence"
  SUBMISSION }o--o{ AI_MODEL : "supports assessment"
```

> **Note:** the 3rd and 4th many-to-many links (Experiment–AI Model, Submission–AI Model) have no direct foreign key in the schema; they are conceptual only.
