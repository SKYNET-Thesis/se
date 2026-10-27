# Physical ERD

One diagram per page of the draw.io set (17 to 22): tables, all columns, datatypes, PK / FK / UK and NOT NULL, read from `services/education-api/prisma/schema.prisma`.

Relationship ends: `||` exactly one, `|o` zero or one, `o{` zero or many; the label is the FK column on the child table.

## 17 Physical ERD — IDENTITY & SCHOOL

Source: draw.io page "17 Physical ERD — IDENTITY & SCHOOL". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  users |o--o{ organizations : "personal_owner_user_id"
  organizations ||--o{ memberships : "organization_id"
  roles ||--o{ memberships : "role_id"
  users ||--o{ memberships : "user_id"
  users |o--o{ learning_classrooms : "created_by"
  organizations ||--o{ learning_classrooms : "organization_id"
  learning_classrooms ||--o{ learning_classroom_members : "classroom_id"
  memberships |o--o{ learning_classroom_members : "membership_id"
  users ||--o{ learning_classroom_members : "user_id"
  organizations {
    uuid id PK
    text name "NOT NULL"
    text type "NOT NULL"
    text segment "NOT NULL"
    text status "NOT NULL"
    date contract_start
    date contract_end
    uuid converted_from_lead_id FK
    uuid personal_owner_user_id FK, UK
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  users {
    uuid id PK
    uuid auth_user_id UK
    text email
    text password_hash
    text full_name "NOT NULL"
    text status "NOT NULL"
    text signup_method "NOT NULL"
    timestamptz email_verified_at
    timestamptz last_login_at
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  roles {
    uuid id PK
    text code UK "NOT NULL"
    text name "NOT NULL"
    text scope "NOT NULL"
    uuid default_safety_profile_id FK
    timestamptz created_at "NOT NULL"
  }
  memberships {
    uuid id PK
    uuid user_id FK "NOT NULL"
    uuid organization_id FK "NOT NULL"
    uuid role_id FK "NOT NULL"
    uuid safety_profile_id FK
    text status "NOT NULL"
    timestamptz starts_at "NOT NULL"
    timestamptz ends_at
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  learning_classrooms {
    uuid id PK
    uuid organization_id FK "NOT NULL"
    uuid offering_id FK "NOT NULL"
    text name "NOT NULL"
    text code "NOT NULL"
    text description
    int capacity
    text status "NOT NULL"
    uuid created_by FK
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  learning_classroom_members {
    uuid id PK
    uuid classroom_id FK "NOT NULL"
    uuid user_id FK "NOT NULL"
    uuid membership_id FK
    text classroom_role "NOT NULL"
    text status "NOT NULL"
    timestamptz joined_at
    timestamptz left_at
    timestamptz created_at "NOT NULL"
  }
```

## 18 Physical ERD — CURRICULUM

Source: draw.io page "18 Physical ERD — CURRICULUM". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  learning_courses ||--o{ learning_course_offerings : "course_id"
  learning_courses ||--o{ learning_lessons : "course_id"
  learning_lessons ||--o{ learning_assignments : "lesson_id"
  learning_assignments ||--o{ learning_classroom_assignments : "assignment_id"
  learning_courses {
    uuid id PK
    uuid level_id FK
    uuid organization_id FK
    text title "NOT NULL"
    text description
    text status "NOT NULL"
    uuid created_by FK
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  learning_course_offerings {
    uuid id PK
    uuid course_id FK "NOT NULL"
    uuid organization_id FK "NOT NULL"
    text code "NOT NULL"
    text title
    text academic_term
    int academic_year
    timestamptz start_at
    timestamptz end_at
    timestamptz enrollment_open_at
    timestamptz enrollment_close_at
    int max_students
    text status "NOT NULL"
    uuid created_by FK
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  learning_lessons {
    uuid id PK
    uuid course_id FK "NOT NULL"
    text title "NOT NULL"
    jsonb content "NOT NULL"
    int ordinal "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  learning_assignments {
    uuid id PK
    uuid lesson_id FK "NOT NULL"
    uuid challenge_id FK
    text title "NOT NULL"
    text instructions "NOT NULL"
    jsonb allowed_blocks "NOT NULL"
    jsonb constraints "NOT NULL"
    timestamptz due_at
    timestamptz created_at "NOT NULL"
  }
  learning_classroom_assignments {
    uuid id PK
    uuid classroom_id FK "NOT NULL"
    uuid assignment_id FK "NOT NULL"
    uuid published_by FK
    timestamptz available_from
    timestamptz due_at
    timestamptz close_at
    int max_attempts
    text status "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
```

## 19 Physical ERD — PROGRAMS & ASSESSMENT

Source: draw.io page "19 Physical ERD — PROGRAMS & ASSESSMENT". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  learning_programs ||--o{ learning_program_versions : "program_id"
  learning_programs |o--o{ learning_submissions : "program_id"
  learning_program_versions |o--o{ learning_submissions : "program_version_id"
  learning_submissions ||--o{ learning_assessments : "submission_id"
  learning_feedback |o--o{ learning_feedback : "parent_feedback_id"
  learning_submissions |o--o{ learning_feedback : "submission_id"
  learning_programs {
    uuid id PK
    uuid owner_user_id FK "NOT NULL"
    uuid assignment_id FK
    text title "NOT NULL"
    int schema_version "NOT NULL"
    jsonb workspace_json "NOT NULL"
    jsonb robot_program "NOT NULL"
    jsonb validation_result "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  learning_program_versions {
    uuid id PK
    uuid program_id FK "NOT NULL"
    int version_number "NOT NULL"
    jsonb workspace_json "NOT NULL"
    jsonb robot_program "NOT NULL"
    jsonb validation_result "NOT NULL"
    text change_summary
    uuid created_by FK
    timestamptz created_at "NOT NULL"
  }
  learning_submissions {
    uuid id PK
    uuid assignment_id FK "NOT NULL"
    uuid learner_user_id FK "NOT NULL"
    uuid program_id FK
    uuid program_version_id FK
    jsonb submitted_workspace
    jsonb submitted_program
    text reflection
    text status "NOT NULL"
    timestamptz submitted_at
    timestamptz created_at "NOT NULL"
  }
  learning_assessments {
    uuid id PK
    uuid submission_id FK, UK "NOT NULL"
    uuid reviewer_user_id FK
    text overall_feedback
    timestamptz reviewed_at
    timestamptz created_at "NOT NULL"
  }
  learning_feedback {
    uuid id PK
    uuid submission_id FK
    uuid attempt_id FK
    uuid author_user_id FK "NOT NULL"
    uuid parent_feedback_id FK
    text feedback_type "NOT NULL"
    text content "NOT NULL"
    jsonb metadata "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
```

## 20 Physical ERD — ROBOT RESOURCES

Source: draw.io page "20 Physical ERD — ROBOT RESOURCES". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  robots |o--o{ org_entitlements : "robot_id"
  robots ||--o{ learning_classroom_robot_allocations : "robot_id"
  robots ||--o{ control_sessions : "robot_id"
  robots {
    uuid id PK
    text serial_no UK "NOT NULL"
    text name "NOT NULL"
    text model_name "NOT NULL"
    text firmware_version
    text status "NOT NULL"
    uuid owner_organization_id FK
    text notes
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  org_entitlements {
    uuid id PK
    uuid organization_id FK "NOT NULL"
    text resource_type "NOT NULL"
    uuid robot_id FK
    uuid ai_model_id FK
    uuid mode_id FK
    int seats
    timestamptz valid_from "NOT NULL"
    timestamptz valid_to
    uuid created_by FK
    timestamptz created_at "NOT NULL"
  }
  learning_classroom_robot_allocations {
    uuid id PK
    uuid classroom_id FK, UK "NOT NULL"
    uuid robot_id FK "NOT NULL"
    uuid created_by_user_id FK "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  control_sessions {
    uuid id PK
    uuid organization_id FK "NOT NULL"
    uuid membership_id FK "NOT NULL"
    uuid robot_id FK "NOT NULL"
    uuid mode_id FK "NOT NULL"
    uuid safety_profile_id FK "NOT NULL"
    jsonb safety_profile_snapshot "NOT NULL"
    uuid installation_id FK
    uuid readiness_check_id FK
    text state "NOT NULL"
    timestamptz started_at
    timestamptz ended_at
    text end_reason
    text stop_reason
    jsonb summary "NOT NULL"
    text log_file_uri
    jsonb metadata "NOT NULL"
    timestamptz created_at "NOT NULL"
    uuid model_checkpoint_id FK
  }
```

## 21 Physical ERD — EXPERIMENT

Source: draw.io page "21 Physical ERD — EXPERIMENT". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  demonstration_episodes |o--o{ learning_experiments : "demonstration_episode_id"
  learning_experiments ||--o{ learning_experiment_artifacts : "experiment_id"
  dataset_versions ||--o{ dataset_episodes : "dataset_version_id"
  demonstration_episodes ||--o{ dataset_episodes : "demonstration_episode_id"
  learning_experiments {
    uuid id PK
    uuid challenge_id FK
    uuid submission_id FK
    uuid learner_user_id FK "NOT NULL"
    text method "NOT NULL"
    text execution_mode "NOT NULL"
    text status "NOT NULL"
    uuid control_session_id FK
    uuid demonstration_episode_id FK
    uuid evaluation_run_id FK
    jsonb input_snapshot "NOT NULL"
    jsonb output_snapshot "NOT NULL"
    jsonb metrics "NOT NULL"
    timestamptz started_at
    timestamptz ended_at
    timestamptz created_at "NOT NULL"
  }
  learning_experiment_artifacts {
    uuid id PK
    uuid experiment_id FK "NOT NULL"
    text artifact_type "NOT NULL"
    text storage_path
    text external_uri
    text mime_type
    jsonb metadata "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  demonstration_episodes {
    uuid id PK
    uuid organization_id FK
    uuid recorded_by FK
    uuid benchmark_task_id FK "NOT NULL"
    uuid observation_configuration_id FK
    uuid control_session_id FK
    uuid simulation_scenario_id FK
    text source "NOT NULL"
    text instruction "NOT NULL"
    text outcome "NOT NULL"
    timestamptz started_at "NOT NULL"
    timestamptz ended_at
    int frame_count
    text storage_uri
    text checksum
    jsonb provenance "NOT NULL"
    jsonb metrics "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  dataset_versions {
    uuid id PK
    uuid organization_id FK
    uuid created_by FK
    text name "NOT NULL"
    text version "NOT NULL"
    jsonb split_definition "NOT NULL"
    text huggingface_repo
    text huggingface_revision
    jsonb provenance "NOT NULL"
    boolean is_frozen "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  dataset_episodes {
    uuid dataset_version_id PK, FK
    uuid demonstration_episode_id PK, FK
    text split "NOT NULL"
  }
```

## 22 Physical ERD — AI & MODEL LIFECYCLE

Source: draw.io page "22 Physical ERD — AI & MODEL LIFECYCLE". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  ai_models ||--o{ model_checkpoints : "ai_model_id"
  training_runs |o--o{ model_checkpoints : "training_run_id"
  dataset_versions ||--o{ training_runs : "dataset_version_id"
  model_checkpoints ||--o{ evaluation_runs : "model_checkpoint_id"
  ai_models {
    uuid id PK
    text name "NOT NULL"
    text description
    text owner_type "NOT NULL"
    uuid owner_organization_id FK
    uuid owner_user_id FK
    text visibility "NOT NULL"
    text status "NOT NULL"
    timestamptz created_at "NOT NULL"
    timestamptz updated_at "NOT NULL"
  }
  model_checkpoints {
    uuid id PK
    uuid ai_model_id FK "NOT NULL"
    uuid training_run_id FK
    text version "NOT NULL"
    int step
    text huggingface_repo
    text huggingface_revision
    text artifact_uri
    jsonb metrics "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
  training_runs {
    uuid id PK
    uuid dataset_version_id FK "NOT NULL"
    uuid requested_by FK
    text policy_name "NOT NULL"
    text status "NOT NULL"
    jsonb configuration "NOT NULL"
    text compute_source
    jsonb metrics "NOT NULL"
    timestamptz started_at
    timestamptz ended_at
    timestamptz created_at "NOT NULL"
  }
  evaluation_runs {
    uuid id PK
    uuid model_checkpoint_id FK "NOT NULL"
    uuid benchmark_task_id FK "NOT NULL"
    uuid simulation_scenario_id FK
    uuid control_session_id FK
    uuid requested_by FK
    text target_mode "NOT NULL"
    text status "NOT NULL"
    text outcome
    int trial_count "NOT NULL"
    int success_count "NOT NULL"
    jsonb metrics "NOT NULL"
    timestamptz started_at
    timestamptz ended_at
    timestamptz created_at "NOT NULL"
  }
  dataset_versions {
    uuid id PK
    uuid organization_id FK
    uuid created_by FK
    text name "NOT NULL"
    text version "NOT NULL"
    jsonb split_definition "NOT NULL"
    text huggingface_repo
    text huggingface_revision
    jsonb provenance "NOT NULL"
    boolean is_frozen "NOT NULL"
    timestamptz created_at "NOT NULL"
  }
```
