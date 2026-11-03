# Logical ERD

One diagram per page of the draw.io set (13, 14, 15, 16a, 16b). Entities, business attributes and relationships; keys (`id`, `*_id`) are expressed by the relationship lines, as in the Logical ERD of Report 4. Mermaid `erDiagram` requires a datatype on every attribute, so platform-independent logical types are used (`string`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `json`).

Relationship ends: `||` exactly one, `|o` zero or one, `o{` zero or many; the label is the FK column on the child table. Relationships come from the Prisma `@relation` definitions and are drawn only when both tables are on the same diagram.

## 13 Logical ERD — SCHOOL & ACCESS

Source: draw.io page "13 Logical ERD — SCHOOL & ACCESS". Attributes are read from `services/education-api/prisma/schema.prisma`.

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
    string name
    string type
    string segment
    string status
    date contract_start
    date contract_end
    datetime created_at
    datetime updated_at
  }
  users {
    string auth_user_id
    string email
    string password_hash
    string full_name
    string status
    string signup_method
    datetime email_verified_at
    datetime last_login_at
    datetime created_at
    datetime updated_at
  }
  roles {
    string code
    string name
    string scope
    datetime created_at
  }
  memberships {
    string status
    datetime starts_at
    datetime ends_at
    datetime created_at
    datetime updated_at
  }
  learning_classrooms {
    string name
    string code
    string description
    integer capacity
    string status
    datetime created_at
    datetime updated_at
  }
  learning_classroom_members {
    string classroom_role
    string status
    datetime joined_at
    datetime left_at
    datetime created_at
  }
```

## 14 Logical ERD — CURRICULUM & ASSESSMENT

Source: draw.io page "14 Logical ERD — CURRICULUM & ASSESSMENT". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  learning_courses ||--o{ learning_course_offerings : "course_id"
  learning_courses ||--o{ learning_lessons : "course_id"
  learning_lessons ||--o{ learning_assignments : "lesson_id"
  learning_assignments ||--o{ learning_classroom_assignments : "assignment_id"
  learning_assignments ||--o{ learning_submissions : "assignment_id"
  learning_courses {
    string title
    string description
    string status
    datetime created_at
    datetime updated_at
  }
  learning_course_offerings {
    string code
    string title
    string academic_term
    integer academic_year
    datetime start_at
    datetime end_at
    datetime enrollment_open_at
    datetime enrollment_close_at
    integer max_students
    string status
    datetime created_at
    datetime updated_at
  }
  learning_lessons {
    string title
    json content
    integer ordinal
    datetime created_at
  }
  learning_assignments {
    string title
    string instructions
    json allowed_blocks
    json constraints
    datetime due_at
    datetime created_at
  }
  learning_classroom_assignments {
    datetime available_from
    datetime due_at
    datetime close_at
    integer max_attempts
    string status
    datetime created_at
  }
  learning_submissions {
    json submitted_workspace
    json submitted_program
    string reflection
    string status
    datetime submitted_at
    datetime created_at
  }
```

## 15 Logical ERD — ROBOTS & EXPERIMENTS

Source: draw.io page "15 Logical ERD — ROBOTS & EXPERIMENTS". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  robots |o--o{ org_entitlements : "robot_id"
  robots ||--o{ learning_classroom_robot_allocations : "robot_id"
  robots ||--o{ control_sessions : "robot_id"
  control_sessions |o--o{ learning_experiments : "control_session_id"
  learning_experiments ||--o{ learning_experiment_artifacts : "experiment_id"
  robots {
    string serial_no
    string name
    string model_name
    string firmware_version
    string status
    string notes
    datetime created_at
    datetime updated_at
  }
  org_entitlements {
    string resource_type
    integer seats
    datetime valid_from
    datetime valid_to
    datetime created_at
  }
  learning_classroom_robot_allocations {
    datetime created_at
  }
  control_sessions {
    json safety_profile_snapshot
    string state
    datetime started_at
    datetime ended_at
    string end_reason
    string stop_reason
    json summary
    string log_file_uri
    json metadata
    datetime created_at
  }
  learning_experiments {
    string method
    string execution_mode
    string status
    json input_snapshot
    json output_snapshot
    json metrics
    datetime started_at
    datetime ended_at
    datetime created_at
  }
  learning_experiment_artifacts {
    string artifact_type
    string storage_path
    string external_uri
    string mime_type
    json metadata
    datetime created_at
  }
```

## 16a Logical ERD — Programs & Assessment

Source: draw.io page "16a Logical ERD — Programs & Assessment". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  learning_assignments |o--o{ learning_programs : "assignment_id"
  users ||--o{ learning_programs : "owner_user_id"
  users |o--o{ learning_program_versions : "created_by"
  learning_programs ||--o{ learning_program_versions : "program_id"
  learning_assignments ||--o{ learning_submissions : "assignment_id"
  users ||--o{ learning_submissions : "learner_user_id"
  learning_programs |o--o{ learning_submissions : "program_id"
  learning_program_versions |o--o{ learning_submissions : "program_version_id"
  users |o--o{ learning_assessments : "reviewer_user_id"
  learning_submissions ||--o{ learning_assessments : "submission_id"
  users ||--o{ learning_feedback : "author_user_id"
  learning_feedback |o--o{ learning_feedback : "parent_feedback_id"
  learning_submissions |o--o{ learning_feedback : "submission_id"
  learning_assignments {
    string title
    string instructions
    json allowed_blocks
    json constraints
    datetime due_at
    datetime created_at
  }
  learning_programs {
    string title
    integer schema_version
    json workspace_json
    json robot_program
    json validation_result
    datetime created_at
    datetime updated_at
  }
  learning_program_versions {
    integer version_number
    json workspace_json
    json robot_program
    json validation_result
    string change_summary
    datetime created_at
  }
  learning_submissions {
    json submitted_workspace
    json submitted_program
    string reflection
    string status
    datetime submitted_at
    datetime created_at
  }
  learning_assessments {
    string overall_feedback
    datetime reviewed_at
    datetime created_at
  }
  users {
    string auth_user_id
    string email
    string password_hash
    string full_name
    string status
    string signup_method
    datetime email_verified_at
    datetime last_login_at
    datetime created_at
    datetime updated_at
  }
  learning_feedback {
    string feedback_type
    string content
    json metadata
    datetime created_at
  }
```

## 16b Logical ERD — AI & Datasets

Source: draw.io page "16b Logical ERD — AI & Datasets". Attributes are read from `services/education-api/prisma/schema.prisma`.

```mermaid
erDiagram
  users |o--o{ organizations : "personal_owner_user_id"
  organizations |o--o{ ai_models : "owner_organization_id"
  users |o--o{ ai_models : "owner_user_id"
  users |o--o{ dataset_versions : "created_by"
  organizations |o--o{ dataset_versions : "organization_id"
  dataset_versions ||--o{ training_runs : "dataset_version_id"
  users |o--o{ training_runs : "requested_by"
  ai_models ||--o{ model_checkpoints : "ai_model_id"
  training_runs |o--o{ model_checkpoints : "training_run_id"
  organizations {
    string name
    string type
    string segment
    string status
    date contract_start
    date contract_end
    datetime created_at
    datetime updated_at
  }
  users {
    string auth_user_id
    string email
    string password_hash
    string full_name
    string status
    string signup_method
    datetime email_verified_at
    datetime last_login_at
    datetime created_at
    datetime updated_at
  }
  ai_models {
    string name
    string description
    string owner_type
    string visibility
    string status
    datetime created_at
    datetime updated_at
  }
  dataset_versions {
    string name
    string version
    json split_definition
    string huggingface_repo
    string huggingface_revision
    json provenance
    boolean is_frozen
    datetime created_at
  }
  training_runs {
    string policy_name
    string status
    json configuration
    string compute_source
    json metrics
    datetime started_at
    datetime ended_at
    datetime created_at
  }
  model_checkpoints {
    string version
    integer step
    string huggingface_repo
    string huggingface_revision
    string artifact_uri
    json metrics
    datetime created_at
  }
```
