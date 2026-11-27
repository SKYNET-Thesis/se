# Database schema (generated from `schema.prisma` and the migration manifest)

PostgreSQL 17 (hosted Supabase). Schema DDL is owned by the SQL migration runner, not Prisma Migrate. 88 tables.

### `audit_logs` (identity)

`id PK`, `actor_user_id`, `organization_id`, `action`, `target_type`, `target_id`, `ip_address`, `details`, `created_at`

### `education_school_user_profiles` (identity)

`id PK`, `organization_id`, `user_id`, `person_type`, `employee_code`, `student_code`, `grade_level`, `guardian_email`, `account_state`, `password_change_required`, `password_changed_at`, `temporary_password_expires_at`, `provisioning_claim_token`, `provisioning_lease_until`, `created_at`, `updated_at`

### `licenses` (identity)

`id PK`, `organization_id`, `robot_id`, `license_key_hash`, `key_prefix`, `plan`, `max_installations`, `status`, `issued_at`, `expires_at`, `created_at`, `updated_at`

### `memberships` (identity)

`id PK`, `user_id`, `organization_id`, `role_id`, `safety_profile_id`, `status`, `starts_at`, `ends_at`, `created_at`, `updated_at`

### `organizations` (identity)

`id PK`, `name`, `school_code`, `type`, `segment`, `status`, `contract_start`, `contract_end`, `converted_from_lead_id`, `personal_owner_user_id`, `created_at`, `updated_at`

### `permissions` (identity)

`id PK`, `code`, `description`

### `role_permissions` (identity)

`role_id`, `permission_id`

### `roles` (identity)

`id PK`, `code`, `name`, `scope`, `default_safety_profile_id`, `created_at`

### `user_system_roles` (identity)

`user_id`, `role_id`, `granted_at`

### `users` (identity)

`id PK`, `auth_user_id`, `email`, `full_name`, `status`, `signup_method`, `email_verified_at`, `last_login_at`, `created_at`, `updated_at`

### `learning_activities` (learning)

`id PK`, `section_id`, `title`, `type`, `ordinal`, `required`, `content_ref`, `content`, `status`, `created_at`, `updated_at`

### `learning_activity_objectives` (learning)

`activity_id`, `objective_id`

### `learning_activity_progress` (learning)

`id PK`, `learner_user_id`, `lesson_id`, `activity_id`, `activity_definition_id`, `status`, `completion_method`, `completed_at`, `created_at`, `updated_at`

### `learning_assessment_scores` (learning)

`assessment_id`, `criterion_id`, `awarded_points`, `comment`

### `learning_assessments` (learning)

`id PK`, `submission_id`, `reviewer_user_id`, `overall_feedback`, `reviewed_at`, `created_at`

### `learning_assignment_attempts` (learning)

`id PK`, `classroom_assignment_id`, `learner_user_id`, `program_id`, `attempt_number`, `status`, `workspace_snapshot`, `program_snapshot`, `result_snapshot`, `score`, `started_at`, `submitted_at`, `created_at`, `draft_response`, `draft_saved_at`, `grading_released_at`, `grading_released_by`, `grading_release_origin`

### `learning_assignment_question_versions` (learning)

`assignment_id`, `question_id`, `question_version_id`, `ordinal`, `points`

### `learning_assignments` (learning)

`id PK`, `lesson_id`, `challenge_id`, `title`, `instructions`, `allowed_blocks`, `constraints`, `difficulty`, `assignment_type`, `pass_score`, `grading_method`, `learning_objectives`, `due_at`, `created_at`

### `learning_challenge_conditions` (learning)

`id PK`, `challenge_id`, `condition_type`, `rule_key`, `rule_config`, `description`, `ordinal`, `created_at`

### `learning_challenge_objects` (learning)

`id PK`, `challenge_id`, `object_key`, `object_type`, `label`, `properties`, `initial_pose`, `target_pose`, `metadata`, `created_at`

### `learning_challenges` (learning)

`id PK`, `title`, `description`, `creator_user_id`, `organization_id`, `tabletop_config`, `success_criteria`, `permitted_modes`, `status`, `created_at`, `updated_at`

### `learning_classroom_assignments` (learning)

`id PK`, `classroom_id`, `assignment_id`, `published_by`, `available_from`, `due_at`, `close_at`, `max_attempts`, `status`, `created_at`

### `learning_classroom_members` (learning)

`id PK`, `classroom_id`, `user_id`, `membership_id`, `classroom_role`, `status`, `joined_at`, `left_at`, `created_at`

### `learning_classroom_robot_allocations` (learning)

`id PK`, `classroom_id`, `robot_id`, `created_by_user_id`, `created_at`

### `learning_classrooms` (learning)

`id PK`, `organization_id`, `offering_id`, `name`, `code`, `description`, `capacity`, `status`, `self_enrollment_open`, `created_by`, `created_at`, `updated_at`

### `learning_competencies` (learning)

`id PK`, `code`, `title`, `description`, `domain`, `difficulty_level`, `created_at`

### `learning_competency_progress` (learning)

`id PK`, `learner_user_id`, `competency_id`, `mastery_score`, `evidence_count`, `last_evaluated_at`, `created_at`, `updated_at`

### `learning_course_offerings` (learning)

`id PK`, `course_id`, `organization_id`, `code`, `title`, `academic_term`, `academic_year`, `start_at`, `end_at`, `enrollment_open_at`, `enrollment_close_at`, `max_students`, `status`, `created_by`, `created_at`, `updated_at`

### `learning_courses` (learning)

`id PK`, `level_id`, `organization_id`, `tags`, `prerequisite_course_ids`, `title`, `description`, `status`, `created_by`, `created_at`, `updated_at`

### `learning_demonstration_annotations` (learning)

`id PK`, `demonstration_episode_id`, `author_user_id`, `start_ms`, `end_ms`, `label`, `notes`, `created_at`

### `learning_demonstration_segments` (learning)

`id PK`, `demonstration_episode_id`, `segment_index`, `start_ms`, `end_ms`, `semantic_action`, `arm_side`, `object_label`, `segment_data`, `created_at`

### `learning_enrollments` (learning)

`id PK`, `course_id`, `learner_user_id`, `status`, `enrolled_at`, `completed_at`, `offering_id`, `classroom_id`

### `learning_experiment_artifacts` (learning)

`id PK`, `experiment_id`, `artifact_type`, `storage_path`, `external_uri`, `mime_type`, `metadata`, `created_at`

### `learning_experiment_comparisons` (learning)

`id PK`, `learner_user_id`, `challenge_id`, `title`, `experiment_ids`, `comparison_metrics`, `conclusion`, `created_at`

### `learning_experiment_events` (learning)

`id PK`, `experiment_id`, `event_index`, `event_type`, `event_data`, `occurred_at`

### `learning_experiments` (learning)

`id PK`, `challenge_id`, `submission_id`, `learner_user_id`, `method`, `execution_mode`, `status`, `control_session_id`, `demonstration_episode_id`, `evaluation_run_id`, `input_snapshot`, `output_snapshot`, `metrics`, `started_at`, `ended_at`, `created_at`

### `learning_feedback` (learning)

`id PK`, `submission_id`, `attempt_id`, `author_user_id`, `parent_feedback_id`, `feedback_type`, `content`, `metadata`, `created_at`

### `learning_lesson_prerequisites` (learning)

`lesson_id`, `prerequisite_lesson_id`, `required`, `minimum_score`

### `learning_lesson_progress` (learning)

`id PK`, `learner_user_id`, `lesson_id`, `status`, `progress_percent`, `started_at`, `completed_at`, `created_at`, `updated_at`

### `learning_lessons` (learning)

`id PK`, `course_id`, `title`, `content`, `ordinal`, `created_at`

### `learning_levels` (learning)

`id PK`, `code`, `title`, `description`, `ordinal`, `created_at`

### `learning_media_assets` (learning)

`id PK`, `course_id`, `object_key`, `original_filename`, `mime_type`, `size_bytes`, `status`, `created_by`, `created_at`

### `learning_objective_competencies` (learning)

`objective_id`, `competency_id`, `weight`

### `learning_objectives` (learning)

`id PK`, `lesson_id`, `code`, `description`, `ordinal`

### `learning_program_versions` (learning)

`id PK`, `program_id`, `version_number`, `workspace_json`, `robot_program`, `validation_result`, `change_summary`, `created_by`, `created_at`

### `learning_programs` (learning)

`id PK`, `owner_user_id`, `assignment_id`, `title`, `schema_version`, `workspace_json`, `robot_program`, `validation_result`, `created_at`, `updated_at`

### `learning_question_version_objectives` (learning)

`question_version_id`, `objective_id`

### `learning_question_versions` (learning)

`id PK`, `question_id`, `version_number`, `type`, `difficulty`, `cognitive_level`, `stem`, `options`, `answer_key`, `explanation`, `source_reference`, `status`, `authored_by`, `reviewed_by`, `published_by`, `created_at`, `updated_at`

### `learning_questions` (learning)

`id PK`, `organization_id`, `code`, `course_id`, `lesson_id`, `domain`, `created_by`, `created_at`, `updated_at`

### `learning_quiz_attempt_grading` (learning)

`attempt_id PK`, `grading_snapshot`, `created_at`

### `learning_reflections` (learning)

`id PK`, `submission_id`, `experiment_id`, `learner_user_id`, `prompt_key`, `prompt_text`, `response_text`, `response_data`, `created_at`

### `learning_rubric_criteria` (learning)

`id PK`, `assignment_id`, `title`, `description`, `max_points`, `ordinal`

### `learning_sections` (learning)

`id PK`, `lesson_id`, `title`, `ordinal`, `status`, `created_at`, `updated_at`

### `learning_submission_backfill_audit` (learning)

`id PK`, `stage`, `submission_id`, `attempt_id`, `classification`, `grading_attribution_uncertain`, `detail`, `created_at`

### `learning_submission_files` (learning)

`id PK`, `attempt_id`, `assignment_id`, `learner_user_id`, `object_key`, `original_filename`, `mime_type`, `size_bytes`, `status`, `created_at`, `ready_at`, `removed_at`

### `learning_submissions` (learning)

`id PK`, `assignment_id`, `learner_user_id`, `program_id`, `program_version_id`, `submitted_workspace`, `submitted_program`, `reflection`, `status`, `submitted_at`, `created_at`, `attempt_id`, `origin`

### `learning_symbolic_evaluations` (learning)

`id PK`, `experiment_id`, `submission_id`, `program_version_id`, `requested_by_user_id`, `evaluator_version`, `schematic_schema_version`, `schematic_engine_version`, `program_hash`, `output_snapshot_hash`, `rule_set_schema_version`, `rule_set_hash`, `rule_set_snapshot`, `fingerprint`, `verdict`, `rule_results`, `metrics`, `created_at`

### `learning_vla_action_steps` (learning)

`id PK`, `interaction_id`, `step_index`, `arm_side`, `action_type`, `action_parameters`, `reasoning_summary`, `validation_status`, `execution_status`, `result`, `created_at`

### `learning_vla_interactions` (learning)

`id PK`, `experiment_id`, `learner_user_id`, `language_instruction`, `observation_snapshot`, `perceived_entities`, `generated_plan`, `proposed_actions`, `confidence`, `safety_validation`, `execution_authorized`, `execution_result`, `created_at`

### `app_installations` (robotics)

`id PK`, `user_id`, `license_id`, `machine_fingerprint`, `os`, `app_version`, `first_seen_at`, `last_seen_at`, `revoked_at`

### `arms` (robotics)

`id PK`, `robot_id`, `code`, `role`, `side`, `device_identity`, `model_name`, `serial_number`, `status`, `metadata`, `created_at`, `updated_at`

### `calibration_profiles` (robotics)

`id PK`, `arm_id`, `version`, `calibration_values`, `status`, `calibrated_by`, `calibrated_at`, `created_at`, `notes`

### `classroom_lab_sessions` (robotics)

`id PK`, `organization_id`, `classroom_id`, `robot_id`, `instructor_user_id`, `state`, `started_at`, `expires_at`, `extension_count`, `terminating_at`, `ended_at`, `ended_by_user_id`, `ended_by_role`, `end_reason`, `created_at`

### `control_modes` (robotics)

`id PK`, `code`, `description`

### `control_sessions` (robotics)

`id PK`, `organization_id`, `membership_id`, `robot_id`, `mode_id`, `safety_profile_id`, `safety_profile_snapshot`, `installation_id`, `readiness_check_id`, `state`, `started_at`, `ended_at`, `end_reason`, `stop_reason`, `summary`, `log_file_uri`, `metadata`, `created_at`, `model_checkpoint_id`

### `org_entitlements` (robotics)

`id PK`, `organization_id`, `resource_type`, `robot_id`, `ai_model_id`, `mode_id`, `seats`, `valid_from`, `valid_to`, `created_by`, `created_at`

### `readiness_check_calibrations` (robotics)

`readiness_check_id`, `calibration_profile_id`

### `readiness_checks` (robotics)

`id PK`, `robot_id`, `result`, `checks`, `performed_at`, `performed_by`, `failure_reason`, `created_at`

### `robots` (robotics)

`id PK`, `serial_no`, `name`, `model_name`, `firmware_version`, `status`, `owner_organization_id`, `notes`, `created_at`, `updated_at`

### `safety_events` (robotics)

`id PK`, `control_session_id`, `arm_id`, `event_type`, `severity`, `reason`, `details`, `occurred_at`, `acknowledged_at`, `acknowledged_by`

### `safety_profiles` (robotics)

`id PK`, `name`, `max_speed_pct`, `workspace_limit`, `max_session_minutes`, `require_estop_ack`, `allowed_modes`, `created_at`, `updated_at`

### `session_arms` (robotics)

`control_session_id`, `arm_id`, `channel`, `role`

### `ai_models` (ai)

`id PK`, `name`, `description`, `owner_type`, `owner_organization_id`, `owner_user_id`, `visibility`, `status`, `created_at`, `updated_at`

### `dataset_episodes` (ai)

`dataset_version_id`, `demonstration_episode_id`, `split`

### `dataset_versions` (ai)

`id PK`, `organization_id`, `created_by`, `name`, `version`, `split_definition`, `huggingface_repo`, `huggingface_revision`, `provenance`, `is_frozen`, `created_at`

### `demonstration_episodes` (ai)

`id PK`, `organization_id`, `recorded_by`, `benchmark_task_id`, `observation_configuration_id`, `control_session_id`, `simulation_scenario_id`, `source`, `instruction`, `outcome`, `started_at`, `ended_at`, `frame_count`, `storage_uri`, `checksum`, `provenance`, `metrics`, `created_at`

### `evaluation_runs` (ai)

`id PK`, `model_checkpoint_id`, `benchmark_task_id`, `simulation_scenario_id`, `control_session_id`, `requested_by`, `target_mode`, `status`, `outcome`, `trial_count`, `success_count`, `metrics`, `started_at`, `ended_at`, `created_at`

### `model_checkpoints` (ai)

`id PK`, `ai_model_id`, `training_run_id`, `version`, `step`, `huggingface_repo`, `huggingface_revision`, `artifact_uri`, `metrics`, `created_at`

### `training_runs` (ai)

`id PK`, `dataset_version_id`, `requested_by`, `policy_name`, `status`, `configuration`, `compute_source`, `metrics`, `started_at`, `ended_at`, `created_at`

### `api_keys` (other)

`id PK`, `user_id`, `name`, `key_hash`, `key_prefix`, `scopes`, `expires_at`, `revoked_at`, `last_used_at`, `created_at`

### `auth_tokens` (other)

`id PK`, `user_id`, `purpose`, `token_hash`, `expires_at`, `used_at`, `created_at`

### `benchmark_tasks` (other)

`id PK`, `code`, `name`, `object_type`, `target_container`, `instruction_template`, `pass_criterion`, `active`, `metadata`, `created_at`, `updated_at`

### `demo_bookings` (other)

`id PK`, `lead_id`, `scheduled_at`, `format`, `status`, `assigned_admin_id`, `notes`, `created_at`

### `leads` (other)

`id PK`, `full_name`, `email`, `phone`, `organization_name`, `lead_type`, `segment_interest`, `use_case`, `message`, `source`, `status`, `created_at`

### `observation_configurations` (other)

`id PK`, `name`, `version`, `camera_sources`, `robot_observation`, `arm_mapping`, `active`, `created_at`

### `port_assignments` (other)

`id PK`, `arm_id`, `installation_id`, `port_path`, `device_identity`, `assigned_at`, `released_at`, `status`, `notes`

### `simulation_scenarios` (other)

`id PK`, `benchmark_task_id`, `name`, `version`, `engine`, `object_configuration`, `randomization_configuration`, `created_at`

### `user_assignments` (other)

`id PK`, `organization_id`, `membership_id`, `entitlement_id`, `assigned_at`, `revoked_at`

## Release migrations (manifest order)

| # | Version |
|---|---|
| 1 | `20261110_d_activity_content` |
| 2 | `20261110_e_learning_media` |
| 3 | `20261111_f_global_question_scope` |
| 4 | `20261111_g_activity_progress_scope_guard` |
| 5 | `20261112_h_learning_media_audio_mpeg` |
| 6 | `20261113_i_attempt_submission_foundation` |
| 7 | `20261114_j_one_submission_per_attempt` |
| 8 | `20261116_k_course_authoring_capabilities` |
| 9 | `20261116_l_runtime_role` |
| 10 | `20261118_n_student_password_change_required` |
| 11 | `20261119_o_wf01_robot_allocation_permission` |
| 12 | `20261119_p_course_level_tags_prerequisites_assignment_difficulty` |
| 13 | `20261120_q_media_archive` |
| 14 | `20261127_s_classroom_lab_sessions` |

## Staged (not in the manifest)

- `20261116_m_revoke_public_temp_privilege.sql`
- `20261120_r_device_provisioning.sql`
