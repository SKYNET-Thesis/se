# Logical ERD (generated from `schema.prisma`)

88 tables. Only identifiers, foreign keys and status/state columns are drawn; every column is listed in `database-schema.md`. One diagram per domain; cross-domain foreign keys appear as an entity with `FK` attributes only. `classroom_lab_sessions` is released by migration S (not yet in the Production ledger).

## Identity domain (10 tables)

```mermaid
erDiagram
  audit_logs {
    String id PK
    String actor_user_id FK
    String organization_id FK
  }
  education_school_user_profiles {
    String id PK
    String organization_id FK
    String user_id FK
  }
  licenses {
    String id PK
    String organization_id FK
    String robot_id FK
    String license_key_hash UK
    String status
  }
  memberships {
    String id PK
    String user_id FK
    String organization_id FK
    String role_id FK
    String safety_profile_id FK
    String status
  }
  organizations {
    String id PK
    String name
    String school_code UK
    String status
    String converted_from_lead_id FK
    String personal_owner_user_id FK
  }
  permissions {
    String id PK
    String code UK
  }
  role_permissions {
    String role_id FK
    String permission_id FK
  }
  roles {
    String id PK
    String code UK
    String name
    String default_safety_profile_id FK
  }
  user_system_roles {
    String user_id FK
    String role_id FK
  }
  users {
    String id PK
    String auth_user_id UK
    String email
    String status
  }
  users |o--o{ audit_logs : "actor_user_id"
  organizations |o--o{ audit_logs : "organization_id"
  organizations ||--o{ education_school_user_profiles : "organization_id"
  users ||--o{ education_school_user_profiles : "user_id"
  organizations ||--o{ licenses : "organization_id"
  robots |o--o{ licenses : "robot_id"
  organizations ||--o{ memberships : "organization_id"
  roles ||--o{ memberships : "role_id"
  safety_profiles |o--o{ memberships : "safety_profile_id"
  users ||--o{ memberships : "user_id"
  leads |o--o{ organizations : "converted_from_lead_id"
  users |o--o{ organizations : "personal_owner_user_id"
  permissions ||--o{ role_permissions : "permission_id"
  roles ||--o{ role_permissions : "role_id"
  safety_profiles |o--o{ roles : "default_safety_profile_id"
  roles ||--o{ user_system_roles : "role_id"
  users ||--o{ user_system_roles : "user_id"
  leads {
    uuid id PK
  }
  robots {
    uuid id PK
  }
  safety_profiles {
    uuid id PK
  }
```

## Learning domain (49 tables)

```mermaid
erDiagram
  learning_activities {
    String id PK
    String section_id FK
    String title
    String status
  }
  learning_activity_objectives {
    String activity_id FK
    String objective_id FK
  }
  learning_activity_progress {
    String id PK
    String learner_user_id FK
    String lesson_id FK
    String activity_definition_id FK
    String status
  }
  learning_assessment_scores {
    String assessment_id FK
    String criterion_id FK
  }
  learning_assessments {
    String id PK
    String submission_id FK
    String reviewer_user_id FK
  }
  learning_assignment_attempts {
    String id PK
    String classroom_assignment_id FK
    String learner_user_id FK
    String program_id FK
    String status
    String grading_released_by FK
  }
  learning_assignment_question_versions {
    String assignment_id FK
    String question_id FK
    String question_version_id FK
  }
  learning_assignments {
    String id PK
    String lesson_id FK
    String challenge_id FK
    String title
  }
  learning_challenge_conditions {
    String id PK
    String challenge_id FK
  }
  learning_challenge_objects {
    String id PK
    String challenge_id FK
  }
  learning_challenges {
    String id PK
    String title
    String creator_user_id FK
    String organization_id FK
    String status
  }
  learning_classroom_assignments {
    String id PK
    String classroom_id FK
    String assignment_id FK
    String published_by FK
    String status
  }
  learning_classroom_members {
    String id PK
    String classroom_id FK
    String user_id FK
    String membership_id FK
    String status
  }
  learning_classroom_robot_allocations {
    String id PK
    String classroom_id FK
    String robot_id FK
    String created_by_user_id FK
  }
  learning_classrooms {
    String id PK
    String organization_id FK
    String offering_id FK
    String name
    String code
    String status
    String created_by FK
  }
  learning_competencies {
    String id PK
    String code UK
    String title
  }
  learning_competency_progress {
    String id PK
    String learner_user_id FK
    String competency_id FK
  }
  learning_course_offerings {
    String id PK
    String course_id FK
    String organization_id FK
    String code
    String title
    String status
    String created_by FK
  }
  learning_courses {
    String id PK
    String level_id FK
    String organization_id FK
    String title
    String status
    String created_by FK
  }
  learning_demonstration_annotations {
    String id PK
    String demonstration_episode_id FK
  }
  learning_demonstration_segments {
    String id PK
    String demonstration_episode_id FK
  }
  learning_enrollments {
    String id PK
    String course_id FK
    String learner_user_id FK
    String status
    String offering_id FK
    String classroom_id FK
  }
  learning_experiment_artifacts {
    String id PK
    String experiment_id FK
  }
  learning_experiment_comparisons {
    String id PK
    String learner_user_id FK
    String challenge_id FK
    String title
  }
  learning_experiment_events {
    BigInt id PK
    String experiment_id FK
  }
  learning_experiments {
    String id PK
    String challenge_id FK
    String submission_id FK
    String learner_user_id FK
    String status
    String control_session_id FK
    String demonstration_episode_id FK
    String evaluation_run_id FK
  }
  learning_feedback {
    String id PK
    String submission_id FK
    String attempt_id FK
    String author_user_id FK
    String parent_feedback_id FK
  }
  learning_lesson_prerequisites {
    String lesson_id FK
    String prerequisite_lesson_id FK
  }
  learning_lesson_progress {
    String id PK
    String learner_user_id FK
    String lesson_id FK
    String status
  }
  learning_lessons {
    String id PK
    String course_id FK
    String title
  }
  learning_levels {
    String id PK
    String code UK
    String title
    Int ordinal UK
  }
  learning_media_assets {
    String id PK
    String course_id FK
    String object_key UK
    String status
    String created_by FK
  }
  learning_objective_competencies {
    String objective_id FK
    String competency_id FK
  }
  learning_objectives {
    String id PK
    String lesson_id FK
    String code
  }
  learning_program_versions {
    String id PK
    String program_id FK
    String created_by FK
  }
  learning_programs {
    String id PK
    String owner_user_id FK
    String assignment_id FK
    String title
  }
  learning_question_version_objectives {
    String question_version_id FK
    String objective_id FK
  }
  learning_question_versions {
    String id PK
    String question_id FK
    String status
    String authored_by FK
    String reviewed_by FK
    String published_by FK
  }
  learning_questions {
    String id PK
    String organization_id FK
    String code
    String course_id FK
    String lesson_id FK
    String created_by FK
  }
  learning_quiz_attempt_grading {
    String attempt_id PK
  }
  learning_reflections {
    String id PK
    String submission_id FK
    String experiment_id FK
    String learner_user_id FK
  }
  learning_rubric_criteria {
    String id PK
    String assignment_id FK
    String title
  }
  learning_sections {
    String id PK
    String lesson_id FK
    String title
    String status
  }
  learning_submission_backfill_audit {
    String id PK
  }
  learning_submission_files {
    String id PK
    String attempt_id FK
    String assignment_id FK
    String learner_user_id FK
    String object_key UK
    String status
  }
  learning_submissions {
    String id PK
    String assignment_id FK
    String learner_user_id FK
    String program_id FK
    String program_version_id FK
    String status
    String attempt_id FK
  }
  learning_symbolic_evaluations {
    String id PK
    String experiment_id FK
    String submission_id FK
    String program_version_id FK
    String requested_by_user_id FK
    String fingerprint UK
  }
  learning_vla_action_steps {
    String id PK
    String interaction_id FK
  }
  learning_vla_interactions {
    String id PK
    String experiment_id FK
    String learner_user_id FK
  }
  learning_sections ||--o{ learning_activities : "section_id"
  learning_activities ||--o{ learning_activity_objectives : "activity_id"
  learning_objectives ||--o{ learning_activity_objectives : "objective_id"
  users ||--o{ learning_activity_progress : "learner_user_id"
  learning_lessons ||--o{ learning_activity_progress : "lesson_id"
  learning_activities |o--o{ learning_activity_progress : "activity_definition_id"
  learning_assessments ||--o{ learning_assessment_scores : "assessment_id"
  learning_rubric_criteria ||--o{ learning_assessment_scores : "criterion_id"
  users |o--o{ learning_assessments : "reviewer_user_id"
  learning_submissions ||--o{ learning_assessments : "submission_id"
  users |o--o{ learning_assignment_attempts : "grading_released_by"
  learning_classroom_assignments ||--o{ learning_assignment_attempts : "classroom_assignment_id"
  users ||--o{ learning_assignment_attempts : "learner_user_id"
  learning_programs |o--o{ learning_assignment_attempts : "program_id"
  learning_assignments ||--o{ learning_assignment_question_versions : "assignment_id"
  learning_question_versions ||--o{ learning_assignment_question_versions : "question_version_id"
  learning_questions ||--o{ learning_assignment_question_versions : "question_id"
  learning_challenges |o--o{ learning_assignments : "challenge_id"
  learning_lessons ||--o{ learning_assignments : "lesson_id"
  learning_challenges ||--o{ learning_challenge_conditions : "challenge_id"
  learning_challenges ||--o{ learning_challenge_objects : "challenge_id"
  users |o--o{ learning_challenges : "creator_user_id"
  organizations |o--o{ learning_challenges : "organization_id"
  learning_assignments ||--o{ learning_classroom_assignments : "assignment_id"
  learning_classrooms ||--o{ learning_classroom_assignments : "classroom_id"
  users |o--o{ learning_classroom_assignments : "published_by"
  learning_classrooms ||--o{ learning_classroom_members : "classroom_id"
  memberships |o--o{ learning_classroom_members : "membership_id"
  users ||--o{ learning_classroom_members : "user_id"
  learning_classrooms ||--o{ learning_classroom_robot_allocations : "classroom_id"
  robots ||--o{ learning_classroom_robot_allocations : "robot_id"
  users ||--o{ learning_classroom_robot_allocations : "created_by_user_id"
  users |o--o{ learning_classrooms : "created_by"
  learning_course_offerings ||--o{ learning_classrooms : "offering_id"
  organizations ||--o{ learning_classrooms : "organization_id"
  learning_competencies ||--o{ learning_competency_progress : "competency_id"
  users ||--o{ learning_competency_progress : "learner_user_id"
  learning_courses ||--o{ learning_course_offerings : "course_id"
  users |o--o{ learning_course_offerings : "created_by"
  organizations ||--o{ learning_course_offerings : "organization_id"
  users |o--o{ learning_courses : "created_by"
  learning_levels |o--o{ learning_courses : "level_id"
  organizations |o--o{ learning_courses : "organization_id"
  demonstration_episodes ||--o{ learning_demonstration_annotations : "demonstration_episode_id"
  demonstration_episodes ||--o{ learning_demonstration_segments : "demonstration_episode_id"
  learning_classrooms |o--o{ learning_enrollments : "classroom_id"
  learning_courses ||--o{ learning_enrollments : "course_id"
  learning_course_offerings |o--o{ learning_enrollments : "offering_id"
  users ||--o{ learning_enrollments : "learner_user_id"
  learning_experiments ||--o{ learning_experiment_artifacts : "experiment_id"
  learning_challenges |o--o{ learning_experiment_comparisons : "challenge_id"
  users |o--o{ learning_experiment_comparisons : "learner_user_id"
  learning_experiments ||--o{ learning_experiment_events : "experiment_id"
  learning_challenges |o--o{ learning_experiments : "challenge_id"
  control_sessions |o--o{ learning_experiments : "control_session_id"
  demonstration_episodes |o--o{ learning_experiments : "demonstration_episode_id"
  evaluation_runs |o--o{ learning_experiments : "evaluation_run_id"
  users ||--o{ learning_experiments : "learner_user_id"
  learning_submissions |o--o{ learning_experiments : "submission_id"
  learning_assignment_attempts |o--o{ learning_feedback : "attempt_id"
  users ||--o{ learning_feedback : "author_user_id"
  learning_feedback |o--o{ learning_feedback : "parent_feedback_id"
  learning_submissions |o--o{ learning_feedback : "submission_id"
  learning_lessons ||--o{ learning_lesson_prerequisites : "lesson_id"
  learning_lessons ||--o{ learning_lesson_prerequisites : "prerequisite_lesson_id"
  learning_lessons ||--o{ learning_lesson_progress : "lesson_id"
  users ||--o{ learning_lesson_progress : "learner_user_id"
  learning_courses ||--o{ learning_lessons : "course_id"
  learning_courses ||--o{ learning_media_assets : "course_id"
  users |o--o{ learning_media_assets : "created_by"
  learning_competencies ||--o{ learning_objective_competencies : "competency_id"
  learning_objectives ||--o{ learning_objective_competencies : "objective_id"
  learning_lessons ||--o{ learning_objectives : "lesson_id"
  users |o--o{ learning_program_versions : "created_by"
  learning_programs ||--o{ learning_program_versions : "program_id"
  learning_assignments |o--o{ learning_programs : "assignment_id"
  users ||--o{ learning_programs : "owner_user_id"
  learning_question_versions ||--o{ learning_question_version_objectives : "question_version_id"
  learning_objectives ||--o{ learning_question_version_objectives : "objective_id"
  learning_questions ||--o{ learning_question_versions : "question_id"
  users ||--o{ learning_question_versions : "authored_by"
  users |o--o{ learning_question_versions : "reviewed_by"
  users |o--o{ learning_question_versions : "published_by"
  organizations |o--o{ learning_questions : "organization_id"
  learning_courses ||--o{ learning_questions : "course_id"
  learning_lessons ||--o{ learning_questions : "lesson_id"
  users ||--o{ learning_questions : "created_by"
  learning_assignment_attempts ||--o{ learning_quiz_attempt_grading : "attempt_id"
  learning_experiments |o--o{ learning_reflections : "experiment_id"
  learning_submissions |o--o{ learning_reflections : "submission_id"
  users ||--o{ learning_reflections : "learner_user_id"
  learning_assignments ||--o{ learning_rubric_criteria : "assignment_id"
  learning_lessons ||--o{ learning_sections : "lesson_id"
  learning_assignment_attempts ||--o{ learning_submission_files : "attempt_id"
  learning_assignments ||--o{ learning_submission_files : "assignment_id"
  users ||--o{ learning_submission_files : "learner_user_id"
  learning_assignment_attempts |o--o{ learning_submissions : "attempt_id"
  learning_assignments ||--o{ learning_submissions : "assignment_id"
  users ||--o{ learning_submissions : "learner_user_id"
  learning_programs |o--o{ learning_submissions : "program_id"
  learning_program_versions |o--o{ learning_submissions : "program_version_id"
  learning_experiments ||--o{ learning_symbolic_evaluations : "experiment_id"
  learning_submissions ||--o{ learning_symbolic_evaluations : "submission_id"
  learning_program_versions ||--o{ learning_symbolic_evaluations : "program_version_id"
  users ||--o{ learning_symbolic_evaluations : "requested_by_user_id"
  learning_vla_interactions ||--o{ learning_vla_action_steps : "interaction_id"
  learning_experiments ||--o{ learning_vla_interactions : "experiment_id"
  users |o--o{ learning_vla_interactions : "learner_user_id"
  control_sessions {
    uuid id PK
  }
  demonstration_episodes {
    uuid id PK
  }
  evaluation_runs {
    uuid id PK
  }
  memberships {
    uuid id PK
  }
  organizations {
    uuid id PK
  }
  robots {
    uuid id PK
  }
  users {
    uuid id PK
  }
```

## Robotics domain (13 tables)

```mermaid
erDiagram
  app_installations {
    String id PK
    String user_id FK
    String license_id FK
  }
  arms {
    String id PK
    String robot_id FK
    String code
    String status
  }
  calibration_profiles {
    String id PK
    String arm_id FK
    String status
    String calibrated_by FK
  }
  classroom_lab_sessions {
    String id PK
    String state
  }
  control_modes {
    String id PK
    String code UK
  }
  control_sessions {
    String id PK
    String organization_id FK
    String membership_id FK
    String robot_id FK
    String mode_id FK
    String safety_profile_id FK
    String installation_id FK
    String readiness_check_id FK
    String state
    String model_checkpoint_id FK
  }
  org_entitlements {
    String id PK
    String organization_id FK
    String robot_id FK
    String ai_model_id FK
    String mode_id FK
    String created_by FK
  }
  readiness_check_calibrations {
    String readiness_check_id FK
    String calibration_profile_id FK
  }
  readiness_checks {
    String id PK
    String robot_id FK
    String performed_by FK
  }
  robots {
    String id PK
    String serial_no UK
    String name
    String status
    String owner_organization_id FK
  }
  safety_events {
    String id PK
    String control_session_id FK
    String arm_id FK
    String acknowledged_by FK
  }
  safety_profiles {
    String id PK
    String name UK
  }
  session_arms {
    String control_session_id FK
    String arm_id FK
  }
  licenses ||--o{ app_installations : "license_id"
  users ||--o{ app_installations : "user_id"
  robots ||--o{ arms : "robot_id"
  arms ||--o{ calibration_profiles : "arm_id"
  users |o--o{ calibration_profiles : "calibrated_by"
  app_installations |o--o{ control_sessions : "installation_id"
  memberships ||--o{ control_sessions : "membership_id,organization_id"
  control_modes ||--o{ control_sessions : "mode_id"
  model_checkpoints |o--o{ control_sessions : "model_checkpoint_id"
  readiness_checks |o--o{ control_sessions : "readiness_check_id"
  robots ||--o{ control_sessions : "robot_id"
  safety_profiles ||--o{ control_sessions : "safety_profile_id"
  ai_models |o--o{ org_entitlements : "ai_model_id"
  users |o--o{ org_entitlements : "created_by"
  control_modes |o--o{ org_entitlements : "mode_id"
  organizations ||--o{ org_entitlements : "organization_id"
  robots |o--o{ org_entitlements : "robot_id"
  calibration_profiles ||--o{ readiness_check_calibrations : "calibration_profile_id"
  readiness_checks ||--o{ readiness_check_calibrations : "readiness_check_id"
  users |o--o{ readiness_checks : "performed_by"
  robots ||--o{ readiness_checks : "robot_id"
  organizations |o--o{ robots : "owner_organization_id"
  users |o--o{ safety_events : "acknowledged_by"
  arms |o--o{ safety_events : "arm_id"
  control_sessions |o--o{ safety_events : "control_session_id"
  arms ||--o{ session_arms : "arm_id"
  control_sessions ||--o{ session_arms : "control_session_id"
  ai_models {
    uuid id PK
  }
  licenses {
    uuid id PK
  }
  memberships {
    uuid id PK
  }
  model_checkpoints {
    uuid id PK
  }
  organizations {
    uuid id PK
  }
  users {
    uuid id PK
  }
```

## Ai domain (7 tables)

```mermaid
erDiagram
  ai_models {
    String id PK
    String name
    String owner_organization_id FK
    String owner_user_id FK
    String status
  }
  dataset_episodes {
    String dataset_version_id FK
    String demonstration_episode_id FK
  }
  dataset_versions {
    String id PK
    String organization_id FK
    String created_by FK
    String name
  }
  demonstration_episodes {
    String id PK
    String organization_id FK
    String recorded_by FK
    String benchmark_task_id FK
    String observation_configuration_id FK
    String control_session_id FK
    String simulation_scenario_id FK
  }
  evaluation_runs {
    String id PK
    String model_checkpoint_id FK
    String benchmark_task_id FK
    String simulation_scenario_id FK
    String control_session_id FK
    String requested_by FK
    String status
  }
  model_checkpoints {
    String id PK
    String ai_model_id FK
    String training_run_id FK
  }
  training_runs {
    String id PK
    String dataset_version_id FK
    String requested_by FK
    String status
  }
  organizations |o--o{ ai_models : "owner_organization_id"
  users |o--o{ ai_models : "owner_user_id"
  dataset_versions ||--o{ dataset_episodes : "dataset_version_id"
  demonstration_episodes ||--o{ dataset_episodes : "demonstration_episode_id"
  users |o--o{ dataset_versions : "created_by"
  organizations |o--o{ dataset_versions : "organization_id"
  benchmark_tasks ||--o{ demonstration_episodes : "benchmark_task_id"
  control_sessions |o--o{ demonstration_episodes : "control_session_id"
  observation_configurations |o--o{ demonstration_episodes : "observation_configuration_id"
  organizations |o--o{ demonstration_episodes : "organization_id"
  users |o--o{ demonstration_episodes : "recorded_by"
  simulation_scenarios |o--o{ demonstration_episodes : "simulation_scenario_id"
  benchmark_tasks ||--o{ evaluation_runs : "benchmark_task_id"
  control_sessions |o--o{ evaluation_runs : "control_session_id"
  model_checkpoints ||--o{ evaluation_runs : "model_checkpoint_id"
  users |o--o{ evaluation_runs : "requested_by"
  simulation_scenarios |o--o{ evaluation_runs : "simulation_scenario_id"
  ai_models ||--o{ model_checkpoints : "ai_model_id"
  training_runs |o--o{ model_checkpoints : "training_run_id"
  dataset_versions ||--o{ training_runs : "dataset_version_id"
  users |o--o{ training_runs : "requested_by"
  benchmark_tasks {
    uuid id PK
  }
  control_sessions {
    uuid id PK
  }
  observation_configurations {
    uuid id PK
  }
  organizations {
    uuid id PK
  }
  simulation_scenarios {
    uuid id PK
  }
  users {
    uuid id PK
  }
```

## Other domain (9 tables)

```mermaid
erDiagram
  api_keys {
    String id PK
    String user_id FK
    String name
    String key_hash UK
  }
  auth_tokens {
    String id PK
    String user_id FK
    String token_hash UK
  }
  benchmark_tasks {
    String id PK
    String code UK
    String name
  }
  demo_bookings {
    String id PK
    String lead_id FK
    String status
    String assigned_admin_id FK
  }
  leads {
    String id PK
    String email
    String status
  }
  observation_configurations {
    String id PK
    String name
  }
  port_assignments {
    String id PK
    String arm_id FK
    String installation_id FK
    String status
  }
  simulation_scenarios {
    String id PK
    String benchmark_task_id FK
    String name
  }
  user_assignments {
    String id PK
    String organization_id FK
    String membership_id FK
    String entitlement_id FK
  }
  users ||--o{ api_keys : "user_id"
  users ||--o{ auth_tokens : "user_id"
  users |o--o{ demo_bookings : "assigned_admin_id"
  leads ||--o{ demo_bookings : "lead_id"
  arms ||--o{ port_assignments : "arm_id"
  app_installations |o--o{ port_assignments : "installation_id"
  benchmark_tasks ||--o{ simulation_scenarios : "benchmark_task_id"
  org_entitlements ||--o{ user_assignments : "entitlement_id,organization_id"
  memberships ||--o{ user_assignments : "membership_id,organization_id"
  app_installations {
    uuid id PK
  }
  arms {
    uuid id PK
  }
  memberships {
    uuid id PK
  }
  org_entitlements {
    uuid id PK
  }
  users {
    uuid id PK
  }
```
