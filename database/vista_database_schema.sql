-- Executable PostgreSQL schema generated from the supplied database schema.

-- Intended for a fresh database (not a migration for an existing schema).

-- Foreign keys are added after table creation to support forward references.



CREATE EXTENSION IF NOT EXISTS pgcrypto;



-- 1. Create tables



CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text,
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'invited'::text CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'disabled'::text])),
  signup_method text NOT NULL CHECK (signup_method = ANY (ARRAY['admin_created'::text, 'self_registered'::text])),
  email_verified_at timestamp with time zone,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  auth_user_id uuid UNIQUE,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);


CREATE TABLE public.auth_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purpose text NOT NULL CHECK (purpose = ANY (ARRAY['activation'::text, 'password_reset'::text, 'email_verify'::text])),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT auth_tokens_pkey PRIMARY KEY (id)
);


CREATE TABLE public.safety_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  max_speed_pct integer NOT NULL CHECK (max_speed_pct >= 1 AND max_speed_pct <= 100),
  workspace_limit jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_session_minutes integer CHECK (max_session_minutes IS NULL OR max_session_minutes > 0),
  require_estop_ack boolean NOT NULL DEFAULT true,
  allowed_modes TEXT[] NOT NULL DEFAULT ARRAY['manual'::text],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT safety_profiles_pkey PRIMARY KEY (id)
);


CREATE TABLE public.roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  scope text NOT NULL CHECK (scope = ANY (ARRAY['system'::text, 'organization'::text])),
  default_safety_profile_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);


CREATE TABLE public.permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  CONSTRAINT permissions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id)
);


CREATE TABLE public.user_system_roles (
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_system_roles_pkey PRIMARY KEY (user_id, role_id)
);


CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  organization_name text,
  lead_type text NOT NULL CHECK (lead_type = ANY (ARRAY['institution'::text, 'individual'::text, 'developer'::text, 'caregiver'::text])),
  segment_interest text CHECK (segment_interest = ANY (ARRAY['education'::text, 'research'::text, 'assistive'::text, 'hobby'::text])),
  use_case text,
  message text,
  source text,
  status text NOT NULL DEFAULT 'new'::text CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'lost'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT leads_pkey PRIMARY KEY (id)
);


CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['institution'::text, 'personal'::text])),
  segment text NOT NULL CHECK (segment = ANY (ARRAY['education'::text, 'research'::text, 'assistive'::text, 'hobby'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text])),
  contract_start date,
  contract_end date,
  converted_from_lead_id uuid,
  personal_owner_user_id uuid UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);


CREATE TABLE public.memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  role_id uuid NOT NULL,
  safety_profile_id uuid,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text])),
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT memberships_pkey PRIMARY KEY (id)
);


CREATE TABLE public.demo_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  scheduled_at timestamp with time zone,
  format text NOT NULL DEFAULT 'online'::text CHECK (format = ANY (ARRAY['online'::text, 'onsite'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'done'::text, 'cancelled'::text])),
  assigned_admin_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT demo_bookings_pkey PRIMARY KEY (id)
);


CREATE TABLE public.robots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  serial_no text NOT NULL UNIQUE,
  name text NOT NULL,
  model_name text NOT NULL DEFAULT 'SO-101'::text,
  firmware_version text,
  status text NOT NULL DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'in_use'::text, 'maintenance'::text, 'retired'::text])),
  owner_organization_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT robots_pkey PRIMARY KEY (id)
);


CREATE TABLE public.control_modes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = ANY (ARRAY['manual'::text, 'ai'::text, 'vr'::text, 'remote'::text, 'blockly'::text])),
  description text,
  CONSTRAINT control_modes_pkey PRIMARY KEY (id)
);


CREATE TABLE public.ai_models (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_type text NOT NULL CHECK (owner_type = ANY (ARRAY['system'::text, 'organization'::text, 'developer'::text])),
  owner_organization_id uuid,
  owner_user_id uuid,
  visibility text NOT NULL DEFAULT 'private'::text CHECK (visibility = ANY (ARRAY['public'::text, 'private'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_models_pkey PRIMARY KEY (id)
);


CREATE TABLE public.org_entitlements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type = ANY (ARRAY['robot'::text, 'model'::text, 'mode'::text])),
  robot_id uuid,
  ai_model_id uuid,
  mode_id uuid,
  seats integer CHECK (seats IS NULL OR seats > 0),
  valid_from timestamp with time zone NOT NULL DEFAULT now(),
  valid_to timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT org_entitlements_pkey PRIMARY KEY (id)
);


CREATE TABLE public.user_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  entitlement_id uuid NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT user_assignments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.licenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  robot_id uuid,
  license_key_hash text NOT NULL UNIQUE,
  key_prefix text,
  plan text NOT NULL,
  max_installations integer NOT NULL DEFAULT 1 CHECK (max_installations > 0),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text])),
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT licenses_pkey PRIMARY KEY (id)
);


CREATE TABLE public.app_installations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  license_id uuid NOT NULL,
  machine_fingerprint text NOT NULL,
  os text,
  app_version text,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone,
  revoked_at timestamp with time zone,
  CONSTRAINT app_installations_pkey PRIMARY KEY (id)
);


CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text,
  key_hash text NOT NULL UNIQUE,
  key_prefix text,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id)
);


CREATE TABLE public.arms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  robot_id uuid NOT NULL,
  code text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['leader'::text, 'follower'::text])),
  side text NOT NULL CHECK (side = ANY (ARRAY['left'::text, 'right'::text])),
  device_identity text,
  model_name text NOT NULL DEFAULT 'SO-101'::text,
  serial_number text,
  status text NOT NULL DEFAULT 'disconnected'::text CHECK (status = ANY (ARRAY['disconnected'::text, 'port_discovered'::text, 'port_assigned'::text, 'calibrating'::text, 'calibrated'::text, 'checking'::text, 'ready'::text, 'teleoperating'::text, 'inferencing'::text, 'hold'::text, 'stopped'::text, 'emergency_locked'::text, 'fault'::text])),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT arms_pkey PRIMARY KEY (id)
);


CREATE TABLE public.port_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  arm_id uuid NOT NULL,
  installation_id uuid,
  port_path text NOT NULL,
  device_identity text,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  released_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'released'::text, 'invalid'::text])),
  notes text,
  CONSTRAINT port_assignments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.calibration_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  arm_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  calibration_values jsonb NOT NULL,
  status text NOT NULL DEFAULT 'valid'::text CHECK (status = ANY (ARRAY['draft'::text, 'valid'::text, 'invalid'::text, 'superseded'::text])),
  calibrated_by uuid,
  calibrated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  CONSTRAINT calibration_profiles_pkey PRIMARY KEY (id)
);


CREATE TABLE public.readiness_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  robot_id uuid NOT NULL,
  result text NOT NULL CHECK (result = ANY (ARRAY['passed'::text, 'failed'::text])),
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_at timestamp with time zone NOT NULL DEFAULT now(),
  performed_by uuid,
  failure_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT readiness_checks_pkey PRIMARY KEY (id)
);


CREATE TABLE public.readiness_check_calibrations (
  readiness_check_id uuid NOT NULL,
  calibration_profile_id uuid NOT NULL,
  CONSTRAINT readiness_check_calibrations_pkey PRIMARY KEY (readiness_check_id, calibration_profile_id)
);


CREATE TABLE public.benchmark_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  object_type text NOT NULL,
  target_container text NOT NULL,
  instruction_template text,
  pass_criterion text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_tasks_pkey PRIMARY KEY (id)
);


CREATE TABLE public.observation_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  camera_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  robot_observation jsonb NOT NULL DEFAULT '{}'::jsonb,
  arm_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT observation_configurations_pkey PRIMARY KEY (id)
);


CREATE TABLE public.simulation_scenarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  benchmark_task_id uuid NOT NULL,
  name text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  engine text NOT NULL DEFAULT 'mujoco'::text,
  object_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  randomization_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT simulation_scenarios_pkey PRIMARY KEY (id)
);


CREATE TABLE public.control_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  robot_id uuid NOT NULL,
  mode_id uuid NOT NULL,
  safety_profile_id uuid NOT NULL,
  safety_profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  installation_id uuid,
  readiness_check_id uuid,
  state text NOT NULL DEFAULT 'created'::text CHECK (state = ANY (ARRAY['created'::text, 'ready'::text, 'active'::text, 'hold'::text, 'stopped'::text, 'emergency_locked'::text, 'fault'::text, 'completed'::text])),
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  end_reason text CHECK (end_reason = ANY (ARRAY['completed'::text, 'user_stop'::text, 'emergency_stop'::text, 'error'::text, 'timeout'::text])),
  stop_reason text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  log_file_uri text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  model_checkpoint_id uuid,
  CONSTRAINT control_sessions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.session_arms (
  control_session_id uuid NOT NULL,
  arm_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel = ANY (ARRAY['left'::text, 'right'::text])),
  role text NOT NULL CHECK (role = ANY (ARRAY['leader'::text, 'follower'::text])),
  CONSTRAINT session_arms_pkey PRIMARY KEY (control_session_id, arm_id)
);


CREATE TABLE public.safety_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  control_session_id uuid,
  arm_id uuid,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY['hold'::text, 'input_timeout'::text, 'tracking_lost'::text, 'clutch_released'::text, 'stop'::text, 'emergency_stop'::text, 'unlock'::text, 'input_rejected'::text, 'joint_limit'::text, 'workspace_limit'::text, 'rate_limit'::text, 'hardware_fault'::text, 'mode_change'::text, 'session_error'::text])),
  severity text NOT NULL DEFAULT 'warning'::text CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])),
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged_at timestamp with time zone,
  acknowledged_by uuid,
  CONSTRAINT safety_events_pkey PRIMARY KEY (id)
);


CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  organization_id uuid,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  ip_address inet,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);


CREATE TABLE public.demonstration_episodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  recorded_by uuid,
  benchmark_task_id uuid NOT NULL,
  observation_configuration_id uuid,
  control_session_id uuid,
  simulation_scenario_id uuid,
  source text NOT NULL CHECK (source = ANY (ARRAY['real'::text, 'simulation'::text])),
  instruction text NOT NULL,
  outcome text NOT NULL CHECK (outcome = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'aborted'::text])),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  frame_count integer CHECK (frame_count IS NULL OR frame_count >= 0),
  storage_uri text,
  checksum text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT demonstration_episodes_pkey PRIMARY KEY (id)
);


CREATE TABLE public.dataset_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  created_by uuid,
  name text NOT NULL,
  version text NOT NULL,
  split_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  huggingface_repo text,
  huggingface_revision text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_frozen boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dataset_versions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.dataset_episodes (
  dataset_version_id uuid NOT NULL,
  demonstration_episode_id uuid NOT NULL,
  split text NOT NULL CHECK (split = ANY (ARRAY['train'::text, 'validation'::text, 'test'::text])),
  CONSTRAINT dataset_episodes_pkey PRIMARY KEY (dataset_version_id, demonstration_episode_id)
);


CREATE TABLE public.training_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL,
  requested_by uuid,
  policy_name text NOT NULL DEFAULT 'SmolVLA'::text,
  status text NOT NULL DEFAULT 'queued'::text CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  compute_source text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT training_runs_pkey PRIMARY KEY (id)
);


CREATE TABLE public.model_checkpoints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ai_model_id uuid NOT NULL,
  training_run_id uuid,
  version text NOT NULL,
  step integer CHECK (step IS NULL OR step >= 0),
  huggingface_repo text,
  huggingface_revision text,
  artifact_uri text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT model_checkpoints_pkey PRIMARY KEY (id)
);


CREATE TABLE public.evaluation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_checkpoint_id uuid NOT NULL,
  benchmark_task_id uuid NOT NULL,
  simulation_scenario_id uuid,
  control_session_id uuid,
  requested_by uuid,
  target_mode text NOT NULL CHECK (target_mode = ANY (ARRAY['simulation'::text, 'hardware'::text])),
  status text NOT NULL DEFAULT 'queued'::text CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])),
  outcome text CHECK (outcome = ANY (ARRAY['passed'::text, 'failed'::text, 'inconclusive'::text])),
  trial_count integer NOT NULL DEFAULT 0 CHECK (trial_count >= 0),
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_runs_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_levels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  ordinal integer NOT NULL UNIQUE CHECK (ordinal >= 1 AND ordinal <= 20),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_levels_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  level_id uuid,
  organization_id uuid,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_courses_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_lessons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_lessons_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_objectives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  code text NOT NULL,
  description text NOT NULL,
  ordinal integer NOT NULL DEFAULT 1,
  CONSTRAINT learning_objectives_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  learner_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'withdrawn'::text])),
  enrolled_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  offering_id uuid,
  classroom_id uuid,
  CONSTRAINT learning_enrollments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_challenges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  creator_user_id uuid,
  organization_id uuid,
  tabletop_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  success_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  permitted_modes TEXT[] NOT NULL DEFAULT ARRAY['blockly'::text],
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_challenges_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  challenge_id uuid,
  title text NOT NULL,
  instructions text NOT NULL DEFAULT ''::text,
  allowed_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_assignments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_programs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  assignment_id uuid,
  title text NOT NULL DEFAULT 'Untitled program'::text,
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  workspace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  robot_program jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_programs_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  learner_user_id uuid NOT NULL,
  program_id uuid,
  submitted_workspace jsonb,
  submitted_program jsonb,
  reflection text,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'reviewed'::text])),
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  program_version_id uuid,
  CONSTRAINT learning_submissions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_experiments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenge_id uuid,
  submission_id uuid,
  learner_user_id uuid NOT NULL,
  method text NOT NULL CHECK (method = ANY (ARRAY['blockly'::text, 'demonstration'::text, 'vla'::text, 'manual'::text, 'flow'::text])),
  execution_mode text NOT NULL CHECK (execution_mode = ANY (ARRAY['schematic'::text, 'simulation'::text, 'real_robot'::text, 'offline_replay'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'stopped'::text, 'cancelled'::text])),
  control_session_id uuid,
  demonstration_episode_id uuid,
  evaluation_run_id uuid,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_experiments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_experiment_events (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  experiment_id uuid NOT NULL,
  event_index integer NOT NULL CHECK (event_index >= 0),
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_experiment_events_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_rubric_criteria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  max_points numeric NOT NULL CHECK (max_points > 0::numeric),
  ordinal integer NOT NULL DEFAULT 1,
  CONSTRAINT learning_rubric_criteria_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_assessments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE,
  reviewer_user_id uuid,
  overall_feedback text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_assessments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_assessment_scores (
  assessment_id uuid NOT NULL,
  criterion_id uuid NOT NULL,
  awarded_points numeric NOT NULL CHECK (awarded_points >= 0::numeric),
  comment text,
  CONSTRAINT learning_assessment_scores_pkey PRIMARY KEY (assessment_id, criterion_id)
);


CREATE TABLE public.learning_demonstration_annotations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  demonstration_episode_id uuid NOT NULL,
  author_user_id uuid,
  start_ms bigint NOT NULL CHECK (start_ms >= 0),
  end_ms bigint NOT NULL,
  label text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_demonstration_annotations_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_competencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  domain text NOT NULL CHECK (domain = ANY (ARRAY['computational_thinking'::text, 'programming'::text, 'robotics'::text, 'dual_arm_coordination'::text, 'computer_vision'::text, 'ai_vla'::text, 'experimentation'::text, 'safety'::text, 'debugging'::text])),
  difficulty_level integer NOT NULL DEFAULT 1 CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_competencies_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_objective_competencies (
  objective_id uuid NOT NULL,
  competency_id uuid NOT NULL,
  weight numeric NOT NULL DEFAULT 1 CHECK (weight > 0::numeric),
  CONSTRAINT learning_objective_competencies_pkey PRIMARY KEY (objective_id, competency_id)
);


CREATE TABLE public.learning_competency_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL,
  competency_id uuid NOT NULL,
  mastery_score numeric NOT NULL DEFAULT 0 CHECK (mastery_score >= 0::numeric AND mastery_score <= 100::numeric),
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  last_evaluated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_competency_progress_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_lesson_prerequisites (
  lesson_id uuid NOT NULL,
  prerequisite_lesson_id uuid NOT NULL,
  required boolean NOT NULL DEFAULT true,
  minimum_score numeric CHECK (minimum_score IS NULL OR minimum_score >= 0::numeric AND minimum_score <= 100::numeric),
  CONSTRAINT learning_lesson_prerequisites_pkey PRIMARY KEY (lesson_id, prerequisite_lesson_id)
);


CREATE TABLE public.learning_lesson_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'not_started'::text CHECK (status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'locked'::text])),
  progress_percent numeric NOT NULL DEFAULT 0 CHECK (progress_percent >= 0::numeric AND progress_percent <= 100::numeric),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_lesson_progress_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_program_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  workspace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  robot_program jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_summary text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_program_versions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_challenge_objects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL,
  object_key text NOT NULL,
  object_type text NOT NULL,
  label text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  initial_pose jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_pose jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_challenge_objects_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_challenge_conditions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL,
  condition_type text NOT NULL CHECK (condition_type = ANY (ARRAY['success'::text, 'failure'::text, 'constraint'::text, 'safety'::text])),
  rule_key text NOT NULL,
  rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  ordinal integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_challenge_conditions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_experiment_artifacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL,
  artifact_type text NOT NULL CHECK (artifact_type = ANY (ARRAY['image'::text, 'video'::text, 'trajectory'::text, 'log'::text, 'program'::text, 'observation'::text, 'metrics'::text, 'other'::text])),
  storage_path text,
  external_uri text,
  mime_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_experiment_artifacts_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_experiment_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  learner_user_id uuid,
  challenge_id uuid,
  title text NOT NULL,
  experiment_ids UUID[] NOT NULL CHECK (cardinality(experiment_ids) >= 2),
  comparison_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  conclusion text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_experiment_comparisons_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_vla_interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL,
  learner_user_id uuid,
  language_instruction text NOT NULL,
  observation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  perceived_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  safety_validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_authorized boolean NOT NULL DEFAULT false,
  execution_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_vla_interactions_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_vla_action_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL,
  step_index integer NOT NULL CHECK (step_index >= 0),
  arm_side text CHECK (arm_side IS NULL OR (arm_side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))),
  action_type text NOT NULL,
  action_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasoning_summary text,
  validation_status text NOT NULL DEFAULT 'pending'::text CHECK (validation_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'modified'::text])),
  execution_status text NOT NULL DEFAULT 'pending'::text CHECK (execution_status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_vla_action_steps_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_demonstration_segments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  demonstration_episode_id uuid NOT NULL,
  segment_index integer NOT NULL CHECK (segment_index >= 0),
  start_ms bigint NOT NULL CHECK (start_ms >= 0),
  end_ms bigint NOT NULL,
  semantic_action text,
  arm_side text CHECK (arm_side IS NULL OR (arm_side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text]))),
  object_label text,
  segment_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_demonstration_segments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_reflections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid,
  experiment_id uuid,
  learner_user_id uuid NOT NULL,
  prompt_key text NOT NULL,
  prompt_text text NOT NULL,
  response_text text,
  response_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_reflections_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_course_offerings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  code text NOT NULL,
  title text,
  academic_term text,
  academic_year integer CHECK (academic_year IS NULL OR academic_year >= 2000 AND academic_year <= 2200),
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  enrollment_open_at timestamp with time zone,
  enrollment_close_at timestamp with time zone,
  max_students integer CHECK (max_students IS NULL OR max_students > 0),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'open'::text, 'active'::text, 'completed'::text, 'archived'::text, 'cancelled'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_course_offerings_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_classrooms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  offering_id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'archived'::text])),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_classrooms_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_classroom_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL,
  user_id uuid NOT NULL,
  membership_id uuid,
  classroom_role text NOT NULL CHECK (classroom_role = ANY (ARRAY['student'::text, 'teacher'::text, 'teaching_assistant'::text, 'observer'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['invited'::text, 'active'::text, 'inactive'::text, 'completed'::text, 'removed'::text])),
  joined_at timestamp with time zone,
  left_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_classroom_members_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_classroom_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  published_by uuid,
  available_from timestamp with time zone,
  due_at timestamp with time zone,
  close_at timestamp with time zone,
  max_attempts integer CHECK (max_attempts IS NULL OR max_attempts > 0),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text, 'archived'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_classroom_assignments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_assignment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  classroom_assignment_id uuid NOT NULL,
  learner_user_id uuid NOT NULL,
  program_id uuid,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'in_progress'::text CHECK (status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'evaluated'::text, 'abandoned'::text])),
  workspace_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  program_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_assignment_attempts_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid,
  attempt_id uuid,
  author_user_id uuid NOT NULL,
  parent_feedback_id uuid,
  feedback_type text NOT NULL DEFAULT 'comment'::text CHECK (feedback_type = ANY (ARRAY['comment'::text, 'hint'::text, 'correction'::text, 'praise'::text, 'question'::text, 'system'::text])),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_feedback_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_symbolic_evaluations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  program_version_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  evaluator_version text NOT NULL,
  schematic_schema_version integer NOT NULL,
  schematic_engine_version text NOT NULL,
  program_hash text NOT NULL,
  output_snapshot_hash text NOT NULL,
  rule_set_schema_version integer NOT NULL,
  rule_set_hash text NOT NULL,
  rule_set_snapshot jsonb NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  verdict text NOT NULL CHECK (verdict = ANY (ARRAY['passed'::text, 'failed'::text])),
  rule_results jsonb NOT NULL,
  metrics jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_symbolic_evaluations_pkey PRIMARY KEY (id)
);


CREATE TABLE public._prisma_migrations (
  id character varying NOT NULL,
  checksum character varying NOT NULL,
  finished_at timestamp with time zone,
  migration_name character varying NOT NULL,
  logs text,
  rolled_back_at timestamp with time zone,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  applied_steps_count integer NOT NULL DEFAULT 0,
  CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id)
);


CREATE TABLE public.learning_classroom_robot_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL UNIQUE,
  robot_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT learning_classroom_robot_allocations_pkey PRIMARY KEY (id)
);


CREATE TABLE public.education_school_user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  person_type text NOT NULL CHECK (person_type = ANY (ARRAY['teacher'::text, 'student'::text])),
  employee_code text,
  student_code text,
  grade_level text,
  guardian_email text,
  account_state text NOT NULL CHECK (account_state = ANY (ARRAY['invited'::text, 'active'::text, 'account_setup_pending'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT education_school_user_profiles_pkey PRIMARY KEY (id)
);


-- 2. Unique keys required by composite organization-scoped foreign keys

ALTER TABLE public.memberships

  ADD CONSTRAINT memberships_id_organization_id_key UNIQUE (id, organization_id);



ALTER TABLE public.org_entitlements

  ADD CONSTRAINT org_entitlements_id_organization_id_key UNIQUE (id, organization_id);



-- 3. Add foreign keys after all referenced tables exist

ALTER TABLE public.auth_tokens
  ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.roles
  ADD CONSTRAINT roles_default_safety_profile_id_fkey FOREIGN KEY (default_safety_profile_id) REFERENCES public.safety_profiles(id);

ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);

ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id);

ALTER TABLE public.user_system_roles
  ADD CONSTRAINT user_system_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.user_system_roles
  ADD CONSTRAINT user_system_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_converted_from_lead_id_fkey FOREIGN KEY (converted_from_lead_id) REFERENCES public.leads(id);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_personal_owner_user_id_fkey FOREIGN KEY (personal_owner_user_id) REFERENCES public.users(id);

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_safety_profile_id_fkey FOREIGN KEY (safety_profile_id) REFERENCES public.safety_profiles(id);

ALTER TABLE public.demo_bookings
  ADD CONSTRAINT demo_bookings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);

ALTER TABLE public.demo_bookings
  ADD CONSTRAINT demo_bookings_assigned_admin_id_fkey FOREIGN KEY (assigned_admin_id) REFERENCES public.users(id);

ALTER TABLE public.robots
  ADD CONSTRAINT robots_owner_organization_id_fkey FOREIGN KEY (owner_organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_owner_organization_id_fkey FOREIGN KEY (owner_organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.ai_models
  ADD CONSTRAINT ai_models_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);

ALTER TABLE public.org_entitlements
  ADD CONSTRAINT org_entitlements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.org_entitlements
  ADD CONSTRAINT org_entitlements_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);

ALTER TABLE public.org_entitlements
  ADD CONSTRAINT org_entitlements_ai_model_id_fkey FOREIGN KEY (ai_model_id) REFERENCES public.ai_models(id);

ALTER TABLE public.org_entitlements
  ADD CONSTRAINT org_entitlements_mode_id_fkey FOREIGN KEY (mode_id) REFERENCES public.control_modes(id);

ALTER TABLE public.org_entitlements
  ADD CONSTRAINT org_entitlements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.licenses
  ADD CONSTRAINT licenses_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);

ALTER TABLE public.licenses
  ADD CONSTRAINT licenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.app_installations
  ADD CONSTRAINT app_installations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.app_installations
  ADD CONSTRAINT app_installations_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.licenses(id);

ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.arms
  ADD CONSTRAINT arms_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);

ALTER TABLE public.port_assignments
  ADD CONSTRAINT port_assignments_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id);

ALTER TABLE public.port_assignments
  ADD CONSTRAINT port_assignments_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.app_installations(id);

ALTER TABLE public.calibration_profiles
  ADD CONSTRAINT calibration_profiles_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id);

ALTER TABLE public.calibration_profiles
  ADD CONSTRAINT calibration_profiles_calibrated_by_fkey FOREIGN KEY (calibrated_by) REFERENCES public.users(id);

ALTER TABLE public.readiness_checks
  ADD CONSTRAINT readiness_checks_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);

ALTER TABLE public.readiness_checks
  ADD CONSTRAINT readiness_checks_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);

ALTER TABLE public.readiness_check_calibrations
  ADD CONSTRAINT readiness_check_calibrations_readiness_check_id_fkey FOREIGN KEY (readiness_check_id) REFERENCES public.readiness_checks(id);

ALTER TABLE public.readiness_check_calibrations
  ADD CONSTRAINT readiness_check_calibrations_calibration_profile_id_fkey FOREIGN KEY (calibration_profile_id) REFERENCES public.calibration_profiles(id);

ALTER TABLE public.simulation_scenarios
  ADD CONSTRAINT simulation_scenarios_benchmark_task_id_fkey FOREIGN KEY (benchmark_task_id) REFERENCES public.benchmark_tasks(id);

ALTER TABLE public.control_sessions
  ADD CONSTRAINT control_sessions_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);

ALTER TABLE public.control_sessions
  ADD CONSTRAINT control_sessions_mode_id_fkey FOREIGN KEY (mode_id) REFERENCES public.control_modes(id);

ALTER TABLE public.control_sessions
  ADD CONSTRAINT control_sessions_safety_profile_id_fkey FOREIGN KEY (safety_profile_id) REFERENCES public.safety_profiles(id);

ALTER TABLE public.control_sessions
  ADD CONSTRAINT control_sessions_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.app_installations(id);

ALTER TABLE public.control_sessions
  ADD CONSTRAINT control_sessions_readiness_check_id_fkey FOREIGN KEY (readiness_check_id) REFERENCES public.readiness_checks(id);

ALTER TABLE public.control_sessions
  ADD CONSTRAINT control_sessions_model_checkpoint_id_fkey FOREIGN KEY (model_checkpoint_id) REFERENCES public.model_checkpoints(id);

ALTER TABLE public.session_arms
  ADD CONSTRAINT session_arms_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id);

ALTER TABLE public.session_arms
  ADD CONSTRAINT session_arms_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id);

ALTER TABLE public.safety_events
  ADD CONSTRAINT safety_events_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id);

ALTER TABLE public.safety_events
  ADD CONSTRAINT safety_events_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id);

ALTER TABLE public.safety_events
  ADD CONSTRAINT safety_events_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(id);

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.demonstration_episodes
  ADD CONSTRAINT demonstration_episodes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.demonstration_episodes
  ADD CONSTRAINT demonstration_episodes_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);

ALTER TABLE public.demonstration_episodes
  ADD CONSTRAINT demonstration_episodes_benchmark_task_id_fkey FOREIGN KEY (benchmark_task_id) REFERENCES public.benchmark_tasks(id);

ALTER TABLE public.demonstration_episodes
  ADD CONSTRAINT demonstration_episodes_observation_configuration_id_fkey FOREIGN KEY (observation_configuration_id) REFERENCES public.observation_configurations(id);

ALTER TABLE public.demonstration_episodes
  ADD CONSTRAINT demonstration_episodes_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id);

ALTER TABLE public.demonstration_episodes
  ADD CONSTRAINT demonstration_episodes_simulation_scenario_id_fkey FOREIGN KEY (simulation_scenario_id) REFERENCES public.simulation_scenarios(id);

ALTER TABLE public.dataset_versions
  ADD CONSTRAINT dataset_versions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.dataset_versions
  ADD CONSTRAINT dataset_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.dataset_episodes
  ADD CONSTRAINT dataset_episodes_dataset_version_id_fkey FOREIGN KEY (dataset_version_id) REFERENCES public.dataset_versions(id);

ALTER TABLE public.dataset_episodes
  ADD CONSTRAINT dataset_episodes_demonstration_episode_id_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id);

ALTER TABLE public.training_runs
  ADD CONSTRAINT training_runs_dataset_version_id_fkey FOREIGN KEY (dataset_version_id) REFERENCES public.dataset_versions(id);

ALTER TABLE public.training_runs
  ADD CONSTRAINT training_runs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);

ALTER TABLE public.model_checkpoints
  ADD CONSTRAINT model_checkpoints_ai_model_id_fkey FOREIGN KEY (ai_model_id) REFERENCES public.ai_models(id);

ALTER TABLE public.model_checkpoints
  ADD CONSTRAINT model_checkpoints_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES public.training_runs(id);

ALTER TABLE public.evaluation_runs
  ADD CONSTRAINT evaluation_runs_model_checkpoint_id_fkey FOREIGN KEY (model_checkpoint_id) REFERENCES public.model_checkpoints(id);

ALTER TABLE public.evaluation_runs
  ADD CONSTRAINT evaluation_runs_benchmark_task_id_fkey FOREIGN KEY (benchmark_task_id) REFERENCES public.benchmark_tasks(id);

ALTER TABLE public.evaluation_runs
  ADD CONSTRAINT evaluation_runs_simulation_scenario_id_fkey FOREIGN KEY (simulation_scenario_id) REFERENCES public.simulation_scenarios(id);

ALTER TABLE public.evaluation_runs
  ADD CONSTRAINT evaluation_runs_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id);

ALTER TABLE public.evaluation_runs
  ADD CONSTRAINT evaluation_runs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);

ALTER TABLE public.learning_courses
  ADD CONSTRAINT learning_courses_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.learning_levels(id);

ALTER TABLE public.learning_courses
  ADD CONSTRAINT learning_courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.learning_courses
  ADD CONSTRAINT learning_courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.learning_lessons
  ADD CONSTRAINT learning_lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.learning_courses(id);

ALTER TABLE public.learning_objectives
  ADD CONSTRAINT learning_objectives_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id);

ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.learning_courses(id);

ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_offering_fkey FOREIGN KEY (offering_id) REFERENCES public.learning_course_offerings(id);

ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_classroom_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id);

ALTER TABLE public.learning_challenges
  ADD CONSTRAINT learning_challenges_creator_user_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_challenges
  ADD CONSTRAINT learning_challenges_organization_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.learning_assignments
  ADD CONSTRAINT learning_assignments_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id);

ALTER TABLE public.learning_assignments
  ADD CONSTRAINT learning_assignments_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id);

ALTER TABLE public.learning_programs
  ADD CONSTRAINT learning_programs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id);

ALTER TABLE public.learning_programs
  ADD CONSTRAINT learning_programs_owner_user_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_submissions
  ADD CONSTRAINT learning_submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id);

ALTER TABLE public.learning_submissions
  ADD CONSTRAINT learning_submissions_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.learning_programs(id);

ALTER TABLE public.learning_submissions
  ADD CONSTRAINT learning_submissions_learner_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_submissions
  ADD CONSTRAINT learning_submissions_program_version_id_fkey FOREIGN KEY (program_version_id) REFERENCES public.learning_program_versions(id);

ALTER TABLE public.learning_experiments
  ADD CONSTRAINT learning_experiments_demonstration_episode_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id);

ALTER TABLE public.learning_experiments
  ADD CONSTRAINT learning_experiments_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id);

ALTER TABLE public.learning_experiments
  ADD CONSTRAINT learning_experiments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id);

ALTER TABLE public.learning_experiments
  ADD CONSTRAINT learning_experiments_learner_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_experiments
  ADD CONSTRAINT learning_experiments_control_session_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id);

ALTER TABLE public.learning_experiments
  ADD CONSTRAINT learning_experiments_evaluation_run_fkey FOREIGN KEY (evaluation_run_id) REFERENCES public.evaluation_runs(id);

ALTER TABLE public.learning_experiment_events
  ADD CONSTRAINT learning_experiment_events_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id);

ALTER TABLE public.learning_rubric_criteria
  ADD CONSTRAINT learning_rubric_criteria_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id);

ALTER TABLE public.learning_assessments
  ADD CONSTRAINT learning_assessments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id);

ALTER TABLE public.learning_assessments
  ADD CONSTRAINT learning_assessments_reviewer_user_fkey FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_assessment_scores
  ADD CONSTRAINT learning_assessment_scores_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.learning_assessments(id);

ALTER TABLE public.learning_assessment_scores
  ADD CONSTRAINT learning_assessment_scores_criterion_id_fkey FOREIGN KEY (criterion_id) REFERENCES public.learning_rubric_criteria(id);

ALTER TABLE public.learning_demonstration_annotations
  ADD CONSTRAINT learning_demo_annotations_episode_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id);

ALTER TABLE public.learning_objective_competencies
  ADD CONSTRAINT learning_objective_competencies_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id);

ALTER TABLE public.learning_objective_competencies
  ADD CONSTRAINT learning_objective_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.learning_competencies(id);

ALTER TABLE public.learning_competency_progress
  ADD CONSTRAINT learning_competency_progress_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.learning_competencies(id);

ALTER TABLE public.learning_competency_progress
  ADD CONSTRAINT learning_competency_progress_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_lesson_prerequisites
  ADD CONSTRAINT learning_lesson_prerequisites_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id);

ALTER TABLE public.learning_lesson_prerequisites
  ADD CONSTRAINT learning_lesson_prerequisites_prerequisite_lesson_id_fkey FOREIGN KEY (prerequisite_lesson_id) REFERENCES public.learning_lessons(id);

ALTER TABLE public.learning_lesson_progress
  ADD CONSTRAINT learning_lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id);

ALTER TABLE public.learning_lesson_progress
  ADD CONSTRAINT learning_lesson_progress_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_program_versions
  ADD CONSTRAINT learning_program_versions_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.learning_programs(id);

ALTER TABLE public.learning_program_versions
  ADD CONSTRAINT learning_program_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.learning_challenge_objects
  ADD CONSTRAINT learning_challenge_objects_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id);

ALTER TABLE public.learning_challenge_conditions
  ADD CONSTRAINT learning_challenge_conditions_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id);

ALTER TABLE public.learning_experiment_artifacts
  ADD CONSTRAINT learning_experiment_artifacts_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id);

ALTER TABLE public.learning_experiment_comparisons
  ADD CONSTRAINT learning_experiment_comparisons_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id);

ALTER TABLE public.learning_experiment_comparisons
  ADD CONSTRAINT learning_experiment_comparisons_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_vla_interactions
  ADD CONSTRAINT learning_vla_interactions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id);

ALTER TABLE public.learning_vla_interactions
  ADD CONSTRAINT learning_vla_interactions_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_vla_action_steps
  ADD CONSTRAINT learning_vla_action_steps_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES public.learning_vla_interactions(id);

ALTER TABLE public.learning_demonstration_segments
  ADD CONSTRAINT learning_demo_segments_episode_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id);

ALTER TABLE public.learning_reflections
  ADD CONSTRAINT learning_reflections_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id);

ALTER TABLE public.learning_reflections
  ADD CONSTRAINT learning_reflections_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id);

ALTER TABLE public.learning_reflections
  ADD CONSTRAINT learning_reflections_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_course_offerings
  ADD CONSTRAINT learning_course_offerings_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.learning_courses(id);

ALTER TABLE public.learning_course_offerings
  ADD CONSTRAINT learning_course_offerings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.learning_course_offerings
  ADD CONSTRAINT learning_course_offerings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.learning_classrooms
  ADD CONSTRAINT learning_classrooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.learning_classrooms
  ADD CONSTRAINT learning_classrooms_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.learning_course_offerings(id);

ALTER TABLE public.learning_classrooms
  ADD CONSTRAINT learning_classrooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE public.learning_classroom_members
  ADD CONSTRAINT learning_classroom_members_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id);

ALTER TABLE public.learning_classroom_members
  ADD CONSTRAINT learning_classroom_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_classroom_members
  ADD CONSTRAINT learning_classroom_members_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id);

ALTER TABLE public.learning_classroom_assignments
  ADD CONSTRAINT learning_classroom_assignments_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id);

ALTER TABLE public.learning_classroom_assignments
  ADD CONSTRAINT learning_classroom_assignments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id);

ALTER TABLE public.learning_classroom_assignments
  ADD CONSTRAINT learning_classroom_assignments_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id);

ALTER TABLE public.learning_assignment_attempts
  ADD CONSTRAINT learning_assignment_attempts_classroom_assignment_id_fkey FOREIGN KEY (classroom_assignment_id) REFERENCES public.learning_classroom_assignments(id);

ALTER TABLE public.learning_assignment_attempts
  ADD CONSTRAINT learning_assignment_attempts_learner_user_id_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_assignment_attempts
  ADD CONSTRAINT learning_assignment_attempts_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.learning_programs(id);

ALTER TABLE public.learning_feedback
  ADD CONSTRAINT learning_feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id);

ALTER TABLE public.learning_feedback
  ADD CONSTRAINT learning_feedback_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.learning_assignment_attempts(id);

ALTER TABLE public.learning_feedback
  ADD CONSTRAINT learning_feedback_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_feedback
  ADD CONSTRAINT learning_feedback_parent_feedback_id_fkey FOREIGN KEY (parent_feedback_id) REFERENCES public.learning_feedback(id);

ALTER TABLE public.learning_symbolic_evaluations
  ADD CONSTRAINT learning_symbolic_evaluations_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id);

ALTER TABLE public.learning_symbolic_evaluations
  ADD CONSTRAINT learning_symbolic_evaluations_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id);

ALTER TABLE public.learning_symbolic_evaluations
  ADD CONSTRAINT learning_symbolic_evaluations_program_version_id_fkey FOREIGN KEY (program_version_id) REFERENCES public.learning_program_versions(id);

ALTER TABLE public.learning_symbolic_evaluations
  ADD CONSTRAINT learning_symbolic_evaluations_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id);

ALTER TABLE public.learning_classroom_robot_allocations
  ADD CONSTRAINT learning_classroom_robot_allocations_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id);

ALTER TABLE public.learning_classroom_robot_allocations
  ADD CONSTRAINT learning_classroom_robot_allocations_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);

ALTER TABLE public.learning_classroom_robot_allocations
  ADD CONSTRAINT learning_classroom_robot_allocations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);

ALTER TABLE public.education_school_user_profiles
  ADD CONSTRAINT education_school_user_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.education_school_user_profiles
  ADD CONSTRAINT education_school_user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

ALTER TABLE public.user_assignments
  ADD CONSTRAINT user_assignments_membership_org_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.memberships(id, organization_id);

ALTER TABLE public.user_assignments
  ADD CONSTRAINT user_assignments_entitlement_org_fkey FOREIGN KEY (entitlement_id, organization_id) REFERENCES public.org_entitlements(id, organization_id);

ALTER TABLE public.control_sessions
  ADD CONSTRAINT control_sessions_membership_org_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.memberships(id, organization_id);
