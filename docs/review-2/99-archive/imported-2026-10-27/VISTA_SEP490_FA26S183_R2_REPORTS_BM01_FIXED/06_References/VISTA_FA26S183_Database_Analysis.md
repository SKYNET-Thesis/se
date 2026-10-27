# VISTA DATABASE ANALYSIS

## Database overview
- 76 tables, 677 columns, 163 exported FK rows.
- 154 FK constraints after grouping composite multi-column FKs.
- Two CSV exports are schema snapshots; they do **not** provide row counts, CHECK constraints, PK/UNIQUE constraints, actual enum values, implementation status, or runtime API behavior.

## Domain classification
See `database_classification_76_tables.csv` for all 76 tables with keep/exclude decision and reason.

## Tables included in Master Logical ERD

### Identity & school
`users`, `roles`, `memberships`, `organizations`, `learning_classrooms`, `learning_classroom_members`

### Learning
`learning_courses`, `learning_course_offerings`, `learning_lessons`, `learning_assignments`, `learning_classroom_assignments`, `learning_programs`, `learning_program_versions`

### Assessment
`learning_submissions`, `learning_assessments`, `learning_feedback`

### Robot resources
`robots`, `org_entitlements`, `learning_classroom_robot_allocations`

### Execution & experiment
`control_sessions`, `learning_experiments`, `learning_experiment_artifacts`, `demonstration_episodes`

### AI & datasets
`dataset_versions`, `dataset_episodes`, `ai_models`, `model_checkpoints`, `training_runs`, `evaluation_runs`

## Tables excluded from Master
Technical tables such as `_prisma_migrations`, `api_keys`, `auth_tokens`, `audit_logs`, installations and licensing are omitted from the MASTER view (though some have legitimate supporting business value). Other learning/detail tables remain in the schema and can be included in dedicated detailed ERDs; omission does not mean deletion.

## Core entities and logical attributes
Database column names below are exact observed names (trimmed for diagram legibility):
- `users`: `id`, `status`, `auth_user_id`
- `roles`: `id`, `code`, `name`, `default_safety_profile_id`
- `memberships`: `id`, `user_id`, `organization_id`, `role_id`, `safety_profile_id`, `status`
- `organizations`: `id`, `name`, `status`, `converted_from_lead_id`, `personal_owner_user_id`
- `learning_classrooms`: `id`, `organization_id`, `offering_id`, `name`, `code`, `status`
- `learning_classroom_members`: `id`, `classroom_id`, `user_id`, `membership_id`, `status`
- `learning_courses`: `id`, `level_id`, `organization_id`, `title`, `status`
- `learning_course_offerings`: `id`, `course_id`, `organization_id`, `code`, `title`, `status`
- `learning_lessons`: `id`, `course_id`, `title`
- `learning_assignments`: `id`, `lesson_id`, `challenge_id`, `title`
- `learning_classroom_assignments`: `id`, `classroom_id`, `assignment_id`, `status`
- `learning_programs`: `id`, `owner_user_id`, `assignment_id`, `title`
- `learning_program_versions`: `id`, `program_id`
- `learning_submissions`: `id`, `assignment_id`, `learner_user_id`, `program_id`, `status`, `program_version_id`
- `learning_assessments`: `id`, `submission_id`, `reviewer_user_id`
- `learning_feedback`: `id`, `submission_id`, `attempt_id`, `author_user_id`, `parent_feedback_id`
- `robots`: `id`, `name`, `status`, `owner_organization_id`
- `org_entitlements`: `id`, `organization_id`, `robot_id`, `ai_model_id`, `mode_id`
- `learning_classroom_robot_allocations`: `id`, `classroom_id`, `robot_id`, `created_by_user_id`
- `control_sessions`: `id`, `organization_id`, `membership_id`, `robot_id`, `mode_id`, `safety_profile_id`, `installation_id`, `readiness_check_id`, `state`
- `learning_experiments`: `id`, `challenge_id`, `submission_id`, `learner_user_id`, `status`, `control_session_id`, `demonstration_episode_id`, `evaluation_run_id`
- `learning_experiment_artifacts`: `id`, `experiment_id`
- `demonstration_episodes`: `id`, `organization_id`, `benchmark_task_id`, `observation_configuration_id`, `control_session_id`, `simulation_scenario_id`
- `dataset_versions`: `id`, `organization_id`, `name`, `version`
- `dataset_episodes`: `dataset_version_id`, `demonstration_episode_id`
- `ai_models`: `id`, `name`, `owner_organization_id`, `owner_user_id`, `status`
- `model_checkpoints`: `id`, `ai_model_id`, `training_run_id`, `version`
- `training_runs`: `id`, `dataset_version_id`, `status`
- `evaluation_runs`: `id`, `model_checkpoint_id`, `benchmark_task_id`, `simulation_scenario_id`, `control_session_id`, `status`

## Relationships / cardinality / junctions
- There are 65 FK constraints among the 29 Master entities, represented as logical FK-dependent to referenced-entity links.
- FK alone supports many-to-one *references*; it does not prove maximum 1:1 without UNIQUE and PK metadata. Optionality is inferred only when FK column nullability is available; composite FKs require review.
- Business junctions retained: `memberships`, `learning_classroom_members`, `learning_classroom_robot_allocations`, `org_entitlements`, `learning_classroom_assignments`, `dataset_episodes`.
- Exact source/target attributes and constraint names are in `foreign_key_constraints_grouped.csv`.

## Important modeling decisions
- `org_entitlements` establishes organization entitlement to a robot; `learning_classroom_robot_allocations` links classroom to robot.
- `control_sessions` models control sessions and `learning_experiments` models educational experiments. They must not be merged with classroom allocation.
- `learning_submissions` and `learning_assessments` capture assessment separately from robot execution.
- `training_runs`, `model_checkpoints`, and `evaluation_runs` are separate AI lifecycle concepts; the database proves structures exist, not that model training runs successfully.

## Potential schema anomalies and missing verification
- **SCHEMA REVIEW REQUIRED:** `control_sessions`.`control_sessions_membership_id_organization_id_fkey` composite source `membership_id + membership_id + organization_id + organization_id` → `memberships` (`organization_id + id + id + organization_id`); exported ordering may not preserve FK column pair order.
- **SCHEMA REVIEW REQUIRED:** `user_assignments`.`user_assignments_entitlement_id_organization_id_fkey` composite source `entitlement_id + entitlement_id + organization_id + organization_id` → `org_entitlements` (`id + organization_id + organization_id + id`); exported ordering may not preserve FK column pair order.
- **SCHEMA REVIEW REQUIRED:** `user_assignments`.`user_assignments_membership_id_organization_id_fkey` composite source `membership_id + membership_id + organization_id + organization_id` → `memberships` (`organization_id + id + id + organization_id`); exported ordering may not preserve FK column pair order.
- `learning_experiment_comparisons.experiment_ids` is not represented by exported FKs; avoid drawing direct FK relationships to experiments without independent schema evidence.
- State diagrams use placeholder transitions because column metadata does not disclose valid values or guards; verify Prisma enums, CHECK constraints and NestJS guards.
- Relationship multiplicity/uniqueness and status values need PK/UNIQUE/CHECK metadata.
- C4 diagram is an edited conceptual rendition of the uploaded images, not a direct edit of the original draw.io source.

## Output files
- `VISTA_Review2_Diagrams.drawio`: 3 reviewed C4, 4 proposed Activity, 4 proposed State, Master Logical ERD + 6 domain ERDs.
- `database_classification_76_tables.csv`: classification.
- `foreign_key_constraints_grouped.csv`: FK groups, composite flags.

## Acceptance before submitting Review 2
1. Verify actor naming: School Admin vs System Admin in registration/SRS, RBAC and UI.
2. Compare all Activity steps against real FRs, controllers and state rules.
3. Compare logical relationships with PK/UNIQUE/constraints and current migrations.
4. Validate all state transitions against code; proposed placeholders must not be submitted as verified truth.
5. Store equivalent Mermaid/PlantUML sources in repository, as Review 2 guidance specifically requires.