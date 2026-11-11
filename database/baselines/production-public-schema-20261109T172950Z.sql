--
-- PostgreSQL database dump
--

\restrict IrOmjXPTZ5sjayul8PfZ7seWeuYU6RkPFkJIKL80bpt3JmdCRKOmvAA2081uLzh

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: lead_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_type AS ENUM (
    'INSTITUTION',
    'INDIVIDUAL',
    'DEVELOPER',
    'CAREGIVER'
);


--
-- Name: TYPE lead_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.lead_type IS 'a type enum for lead table';


--
-- Name: check_learning_question_objective(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_learning_question_objective() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.learning_question_versions v
    JOIN public.learning_questions q ON q.id=v.question_id JOIN public.learning_objectives o ON o.id=NEW.objective_id
    JOIN public.learning_lessons l ON l.id=o.lesson_id JOIN public.learning_courses c ON c.id=l.course_id
    WHERE v.id=NEW.question_version_id AND o.lesson_id=q.lesson_id AND c.organization_id=q.organization_id) THEN
    RAISE EXCEPTION 'Question objective must belong to the question lesson and organization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: check_learning_question_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_learning_question_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.course_id,NEW.lesson_id,NEW.code) IS DISTINCT FROM
      (OLD.organization_id,OLD.course_id,OLD.lesson_id,OLD.code) AND
      EXISTS (SELECT 1 FROM public.learning_question_versions WHERE question_id=OLD.id) THEN
    RAISE EXCEPTION 'Versioned question identity and scope are immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_lessons l JOIN public.learning_courses c ON c.id=l.course_id
    WHERE l.id=NEW.lesson_id AND c.id=NEW.course_id AND c.organization_id=NEW.organization_id) THEN
    RAISE EXCEPTION 'Question lesson, course and organization must match' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: forbid_frozen_dataset_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.forbid_frozen_dataset_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE v_id uuid; frozen boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.dataset_version_id;
  ELSE
    v_id := NEW.dataset_version_id;
  END IF;
  SELECT is_frozen INTO frozen FROM dataset_versions WHERE id = v_id;
  IF frozen THEN
    RAISE EXCEPTION 'dataset_version % is frozen', v_id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_learning_assignment_question(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_learning_assignment_question() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE aid uuid;
BEGIN
  aid := CASE WHEN TG_OP='DELETE' THEN OLD.assignment_id ELSE NEW.assignment_id END;
  PERFORM 1 FROM public.learning_assignments WHERE id=aid FOR UPDATE;
  IF TG_OP='UPDATE' AND (OLD.assignment_id,OLD.question_id,OLD.question_version_id) IS DISTINCT FROM
      (NEW.assignment_id,NEW.question_id,NEW.question_version_id) THEN
    RAISE EXCEPTION 'Assignment question identity and pinned version are immutable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_classroom_assignments ca WHERE ca.assignment_id=aid AND ca.status <> 'draft') OR
     EXISTS (SELECT 1 FROM public.learning_assignment_attempts att JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id WHERE ca.assignment_id=aid) THEN
    RAISE EXCEPTION 'Delivered assignment question versions are pinned' USING ERRCODE='23514';
  END IF;
  IF TG_OP <> 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.learning_assignments a JOIN public.learning_question_versions v ON v.id=NEW.question_version_id
    JOIN public.learning_questions q ON q.id=v.question_id
    WHERE a.id=NEW.assignment_id AND q.id=NEW.question_id AND q.lesson_id=a.lesson_id
      AND (TG_OP='UPDATE' OR v.status='published')
      AND EXISTS (SELECT 1 FROM public.learning_question_version_objectives o WHERE o.question_version_id=v.id)
  ) THEN RAISE EXCEPTION 'Assignment requires a published version with matching lesson outcomes' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_learning_question_objective(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_learning_question_objective() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE target_id uuid;
BEGIN
  target_id := CASE WHEN TG_OP='DELETE' THEN OLD.question_version_id ELSE NEW.question_version_id END;
  IF TG_OP='UPDATE' AND OLD.question_version_id <> NEW.question_version_id AND
     EXISTS (SELECT 1 FROM public.learning_question_versions WHERE id=OLD.question_version_id AND status <> 'draft') THEN
    RAISE EXCEPTION 'Published objective mapping is immutable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_question_versions WHERE id=target_id AND status <> 'draft') OR
     EXISTS (SELECT 1 FROM public.learning_assignment_question_versions WHERE question_version_id=target_id) THEN
    RAISE EXCEPTION 'Only unassigned draft objective mappings may change' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_learning_question_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_learning_question_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Question version deletion is not allowed' USING ERRCODE='23514'; END IF;
  IF OLD.status IN ('published','archived') THEN
    IF OLD.status='published' AND NEW.status='archived' AND
       (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Published and archived question versions are immutable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_assignment_question_versions a WHERE a.question_version_id=OLD.id) THEN
    RAISE EXCEPTION 'Assigned question versions are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.status='published' AND (
      OLD.status <> 'in_review' OR length(btrim(COALESCE(NEW.explanation,'')))=0 OR
      NOT EXISTS (SELECT 1 FROM public.learning_question_version_objectives WHERE question_version_id=OLD.id)
    ) THEN RAISE EXCEPTION 'Publication requires review, explanation and Learning Outcome' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;


--
-- Name: guard_question_bank_quiz_grading(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_question_bank_quiz_grading() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Issued quiz answer keys are immutable' USING ERRCODE='23514';
END $$;


--
-- Name: guard_question_bank_quiz_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_question_bank_quiz_snapshot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.workspace_snapshot->>'kind'='question_bank_quiz' AND
     NEW.workspace_snapshot IS DISTINCT FROM OLD.workspace_snapshot THEN
    RAISE EXCEPTION 'Issued quiz questions are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: handle_new_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  resolved_full_name TEXT;
BEGIN
  resolved_full_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '');

  INSERT INTO public.users (
    auth_user_id, email, full_name, status, signup_method, email_verified_at
  )
  VALUES (
    NEW.id, NEW.email, COALESCE(resolved_full_name, 'VISTA User'),
    'active', 'self_registered', NEW.email_confirmed_at
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: lock_learning_assignment_questions_on_attempt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_learning_assignment_questions_on_attempt() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM 1 FROM public.learning_assignments a JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id
    WHERE ca.id=NEW.classroom_assignment_id FOR UPDATE OF a;
  RETURN NEW;
END $$;


--
-- Name: lock_learning_assignment_questions_on_delivery(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lock_learning_assignment_questions_on_delivery() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM 1 FROM public.learning_assignments WHERE id=NEW.assignment_id FOR UPDATE;
  RETURN NEW;
END $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: ai_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    owner_type text NOT NULL,
    owner_organization_id uuid,
    owner_user_id uuid,
    visibility text DEFAULT 'private'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_models_check CHECK ((((owner_type = 'system'::text) AND (owner_organization_id IS NULL) AND (owner_user_id IS NULL)) OR ((owner_type = 'organization'::text) AND (owner_organization_id IS NOT NULL)) OR ((owner_type = 'developer'::text) AND (owner_user_id IS NOT NULL)))),
    CONSTRAINT ai_models_owner_type_check CHECK ((owner_type = ANY (ARRAY['system'::text, 'organization'::text, 'developer'::text]))),
    CONSTRAINT ai_models_status_check CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text]))),
    CONSTRAINT ai_models_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text,
    key_hash text NOT NULL,
    key_prefix text,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_installations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_installations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    license_id uuid NOT NULL,
    machine_fingerprint text NOT NULL,
    os text,
    app_version text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    revoked_at timestamp with time zone
);


--
-- Name: arms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    robot_id uuid NOT NULL,
    code text NOT NULL,
    role text NOT NULL,
    side text NOT NULL,
    device_identity text,
    model_name text DEFAULT 'SO-101'::text NOT NULL,
    serial_number text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arms_role_check CHECK ((role = ANY (ARRAY['leader'::text, 'follower'::text]))),
    CONSTRAINT arms_side_check CHECK ((side = ANY (ARRAY['left'::text, 'right'::text]))),
    CONSTRAINT arms_status_check CHECK ((status = ANY (ARRAY['disconnected'::text, 'port_discovered'::text, 'port_assigned'::text, 'calibrating'::text, 'calibrated'::text, 'checking'::text, 'ready'::text, 'teleoperating'::text, 'inferencing'::text, 'hold'::text, 'stopped'::text, 'emergency_locked'::text, 'fault'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    organization_id uuid,
    action text NOT NULL,
    target_type text,
    target_id uuid,
    ip_address inet,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    purpose text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_tokens_purpose_check CHECK ((purpose = ANY (ARRAY['activation'::text, 'password_reset'::text, 'email_verify'::text, 'student_setup'::text])))
);


--
-- Name: benchmark_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.benchmark_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    object_type text NOT NULL,
    target_container text NOT NULL,
    instruction_template text,
    pass_criterion text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: calibration_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calibration_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    arm_id uuid NOT NULL,
    version integer NOT NULL,
    calibration_values jsonb NOT NULL,
    status text DEFAULT 'valid'::text NOT NULL,
    calibrated_by uuid,
    calibrated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT calibration_profiles_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'valid'::text, 'invalid'::text, 'superseded'::text]))),
    CONSTRAINT calibration_profiles_version_check CHECK ((version > 0))
);


--
-- Name: control_modes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_modes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    CONSTRAINT control_modes_code_check CHECK ((code = ANY (ARRAY['manual'::text, 'ai'::text, 'vr'::text, 'remote'::text, 'blockly'::text])))
);


--
-- Name: control_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.control_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    robot_id uuid NOT NULL,
    mode_id uuid NOT NULL,
    safety_profile_id uuid NOT NULL,
    safety_profile_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    installation_id uuid,
    readiness_check_id uuid,
    state text DEFAULT 'created'::text NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    end_reason text,
    stop_reason text,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    log_file_uri text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    model_checkpoint_id uuid,
    CONSTRAINT control_sessions_check CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT control_sessions_end_reason_check CHECK ((end_reason = ANY (ARRAY['completed'::text, 'user_stop'::text, 'emergency_stop'::text, 'error'::text, 'timeout'::text]))),
    CONSTRAINT control_sessions_state_check CHECK ((state = ANY (ARRAY['created'::text, 'ready'::text, 'active'::text, 'hold'::text, 'stopped'::text, 'emergency_locked'::text, 'fault'::text, 'completed'::text])))
);


--
-- Name: dataset_episodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dataset_episodes (
    dataset_version_id uuid NOT NULL,
    demonstration_episode_id uuid NOT NULL,
    split text NOT NULL,
    CONSTRAINT dataset_episodes_split_check CHECK ((split = ANY (ARRAY['train'::text, 'validation'::text, 'test'::text])))
);


--
-- Name: dataset_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dataset_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    created_by uuid,
    name text NOT NULL,
    version text NOT NULL,
    split_definition jsonb DEFAULT '{}'::jsonb NOT NULL,
    huggingface_repo text,
    huggingface_revision text,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_frozen boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: demo_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    scheduled_at timestamp with time zone,
    format text DEFAULT 'online'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_admin_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT demo_bookings_format_check CHECK ((format = ANY (ARRAY['online'::text, 'onsite'::text]))),
    CONSTRAINT demo_bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'done'::text, 'cancelled'::text])))
);


--
-- Name: demonstration_episodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demonstration_episodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    recorded_by uuid,
    benchmark_task_id uuid NOT NULL,
    observation_configuration_id uuid,
    control_session_id uuid,
    simulation_scenario_id uuid,
    source text NOT NULL,
    instruction text NOT NULL,
    outcome text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    frame_count integer,
    storage_uri text,
    checksum text,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT demonstration_episodes_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT demonstration_episodes_check1 CHECK ((((source = 'real'::text) AND (simulation_scenario_id IS NULL)) OR ((source = 'simulation'::text) AND (simulation_scenario_id IS NOT NULL)))),
    CONSTRAINT demonstration_episodes_frame_count_check CHECK (((frame_count IS NULL) OR (frame_count >= 0))),
    CONSTRAINT demonstration_episodes_outcome_check CHECK ((outcome = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'aborted'::text]))),
    CONSTRAINT demonstration_episodes_source_check CHECK ((source = ANY (ARRAY['real'::text, 'simulation'::text])))
);


--
-- Name: education_school_user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.education_school_user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid NOT NULL,
    person_type text NOT NULL,
    employee_code text,
    student_code text,
    grade_level text,
    guardian_email text,
    account_state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT education_school_user_profiles_account_state_check CHECK ((account_state = ANY (ARRAY['invited'::text, 'active'::text, 'account_setup_pending'::text]))),
    CONSTRAINT education_school_user_profiles_check CHECK ((((person_type = 'teacher'::text) AND (employee_code IS NOT NULL) AND (student_code IS NULL)) OR ((person_type = 'student'::text) AND (student_code IS NOT NULL) AND (employee_code IS NULL)))),
    CONSTRAINT education_school_user_profiles_person_type_check CHECK ((person_type = ANY (ARRAY['teacher'::text, 'student'::text])))
);


--
-- Name: evaluation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    model_checkpoint_id uuid NOT NULL,
    benchmark_task_id uuid NOT NULL,
    simulation_scenario_id uuid,
    control_session_id uuid,
    requested_by uuid,
    target_mode text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    outcome text,
    trial_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT evaluation_runs_check CHECK ((success_count <= trial_count)),
    CONSTRAINT evaluation_runs_check1 CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT evaluation_runs_check2 CHECK ((((target_mode = 'hardware'::text) AND (simulation_scenario_id IS NULL)) OR ((target_mode = 'simulation'::text) AND (simulation_scenario_id IS NOT NULL)))),
    CONSTRAINT evaluation_runs_outcome_check CHECK ((outcome = ANY (ARRAY['passed'::text, 'failed'::text, 'inconclusive'::text]))),
    CONSTRAINT evaluation_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT evaluation_runs_success_count_check CHECK ((success_count >= 0)),
    CONSTRAINT evaluation_runs_target_mode_check CHECK ((target_mode = ANY (ARRAY['simulation'::text, 'hardware'::text]))),
    CONSTRAINT evaluation_runs_trial_count_check CHECK ((trial_count >= 0))
);


--
-- Name: iot_command_lifecycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iot_command_lifecycles (
    command_id uuid NOT NULL,
    experiment_id uuid NOT NULL,
    control_session_id uuid NOT NULL,
    robot_id uuid NOT NULL,
    state text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    acknowledged_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_code text,
    last_sequence bigint DEFAULT '-1'::integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    command_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    publish_attempts integer DEFAULT 0 NOT NULL,
    publish_owner text,
    publish_lease_until timestamp with time zone,
    publish_started_at timestamp with time zone,
    publish_error text,
    CONSTRAINT iot_command_lifecycles_expiry_check CHECK ((expires_at > issued_at)),
    CONSTRAINT iot_command_lifecycles_state_check CHECK ((state = ANY (ARRAY['pending_publish'::text, 'publishing'::text, 'queued'::text, 'acknowledged'::text, 'executing'::text, 'completed'::text, 'failed'::text, 'timed_out'::text, 'publish_failed'::text, 'reconciliation_required'::text])))
);


--
-- Name: iot_inbound_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iot_inbound_events (
    event_id text NOT NULL,
    command_id uuid,
    robot_id uuid NOT NULL,
    kind text NOT NULL,
    sequence bigint NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT iot_inbound_events_kind_check CHECK ((kind = ANY (ARRAY['ack'::text, 'status'::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    phone text,
    organization_name text,
    lead_type text NOT NULL,
    segment_interest text,
    use_case text,
    message text,
    source text,
    status text DEFAULT 'new'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_lead_type_check CHECK ((lead_type = ANY (ARRAY['institution'::text, 'individual'::text, 'developer'::text, 'caregiver'::text]))),
    CONSTRAINT leads_segment_interest_check CHECK ((segment_interest = ANY (ARRAY['education'::text, 'research'::text, 'assistive'::text, 'hobby'::text]))),
    CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'lost'::text])))
);


--
-- Name: learning_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    ordinal integer NOT NULL,
    required boolean DEFAULT true NOT NULL,
    content_ref jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_activities_content_ref_check CHECK ((jsonb_typeof(content_ref) = 'object'::text)),
    CONSTRAINT learning_activities_ordinal_check CHECK ((ordinal > 0)),
    CONSTRAINT learning_activities_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
    CONSTRAINT learning_activities_type_check CHECK ((type = ANY (ARRAY['reading'::text, 'video'::text, 'demonstration'::text, 'guided_practice'::text, 'knowledge_check'::text, 'simulation'::text, 'challenge'::text, 'physical_lab'::text, 'result'::text, 'reflection'::text])))
);


--
-- Name: learning_activity_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_activity_objectives (
    activity_id uuid NOT NULL,
    objective_id uuid NOT NULL
);


--
-- Name: learning_activity_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_activity_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learner_user_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    activity_id text NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    completion_method text DEFAULT 'self_report'::text NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_definition_id uuid,
    CONSTRAINT learning_activity_progress_activity_slot_check CHECK ((((activity_definition_id IS NULL) AND (((activity_id = ((lesson_id)::text || '-reading-1'::text)) OR (activity_id = ((lesson_id)::text || '-reading-2'::text))) OR (activity_id = ((lesson_id)::text || '-demonstration'::text)))) OR ((activity_definition_id IS NOT NULL) AND (activity_id = (activity_definition_id)::text)))),
    CONSTRAINT learning_activity_progress_completion_method_check CHECK ((completion_method = 'self_report'::text)),
    CONSTRAINT learning_activity_progress_status_check CHECK ((status = 'completed'::text))
);


--
-- Name: learning_assessment_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_assessment_scores (
    assessment_id uuid NOT NULL,
    criterion_id uuid NOT NULL,
    awarded_points numeric(7,2) NOT NULL,
    comment text,
    CONSTRAINT learning_assessment_scores_awarded_points_check CHECK ((awarded_points >= (0)::numeric))
);


--
-- Name: learning_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid NOT NULL,
    reviewer_user_id uuid,
    overall_feedback text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: learning_assignment_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_assignment_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    classroom_assignment_id uuid NOT NULL,
    learner_user_id uuid NOT NULL,
    program_id uuid,
    attempt_number integer NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    workspace_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    program_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    result_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    score numeric(7,2),
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_assignment_attempts_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT learning_assignment_attempts_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'submitted'::text, 'evaluated'::text, 'abandoned'::text])))
);


--
-- Name: learning_assignment_question_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_assignment_question_versions (
    assignment_id uuid NOT NULL,
    question_id uuid NOT NULL,
    question_version_id uuid NOT NULL,
    ordinal integer NOT NULL,
    points numeric(7,2) NOT NULL,
    CONSTRAINT learning_assignment_question_versions_ordinal_check CHECK ((ordinal > 0)),
    CONSTRAINT learning_assignment_question_versions_points_check CHECK ((points > (0)::numeric))
);


--
-- Name: learning_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    challenge_id uuid,
    title text NOT NULL,
    instructions text DEFAULT ''::text NOT NULL,
    allowed_blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    constraints jsonb DEFAULT '{}'::jsonb NOT NULL,
    due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: learning_challenge_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_challenge_conditions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id uuid NOT NULL,
    condition_type text NOT NULL,
    rule_key text NOT NULL,
    rule_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    description text,
    ordinal integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_challenge_conditions_condition_type_check CHECK ((condition_type = ANY (ARRAY['success'::text, 'failure'::text, 'constraint'::text, 'safety'::text])))
);


--
-- Name: learning_challenge_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_challenge_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id uuid NOT NULL,
    object_key text NOT NULL,
    object_type text NOT NULL,
    label text,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    initial_pose jsonb DEFAULT '{}'::jsonb NOT NULL,
    target_pose jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: learning_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    creator_user_id uuid,
    organization_id uuid,
    tabletop_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    success_criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    permitted_modes text[] DEFAULT ARRAY['blockly'::text] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_challenges_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: learning_classroom_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_classroom_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    classroom_id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    published_by uuid,
    available_from timestamp with time zone,
    due_at timestamp with time zone,
    close_at timestamp with time zone,
    max_attempts integer,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_classroom_assignments_check CHECK (((due_at IS NULL) OR (available_from IS NULL) OR (due_at >= available_from))),
    CONSTRAINT learning_classroom_assignments_check1 CHECK (((close_at IS NULL) OR (due_at IS NULL) OR (close_at >= due_at))),
    CONSTRAINT learning_classroom_assignments_max_attempts_check CHECK (((max_attempts IS NULL) OR (max_attempts > 0))),
    CONSTRAINT learning_classroom_assignments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text, 'archived'::text])))
);


--
-- Name: learning_classroom_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_classroom_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    classroom_id uuid NOT NULL,
    user_id uuid NOT NULL,
    membership_id uuid,
    classroom_role text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at timestamp with time zone,
    left_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_classroom_members_check CHECK (((left_at IS NULL) OR (joined_at IS NULL) OR (left_at >= joined_at))),
    CONSTRAINT learning_classroom_members_classroom_role_check CHECK ((classroom_role = ANY (ARRAY['student'::text, 'teacher'::text, 'teaching_assistant'::text, 'observer'::text]))),
    CONSTRAINT learning_classroom_members_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'inactive'::text, 'completed'::text, 'removed'::text])))
);


--
-- Name: learning_classroom_robot_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_classroom_robot_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    classroom_id uuid NOT NULL,
    robot_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: learning_classrooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_classrooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    offering_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    description text,
    capacity integer,
    status text DEFAULT 'active'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_classrooms_capacity_check CHECK (((capacity IS NULL) OR (capacity > 0))),
    CONSTRAINT learning_classrooms_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'archived'::text])))
);


--
-- Name: learning_competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_competencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    domain text NOT NULL,
    difficulty_level integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_competencies_difficulty_level_check CHECK (((difficulty_level >= 1) AND (difficulty_level <= 5))),
    CONSTRAINT learning_competencies_domain_check CHECK ((domain = ANY (ARRAY['computational_thinking'::text, 'programming'::text, 'robotics'::text, 'dual_arm_coordination'::text, 'computer_vision'::text, 'ai_vla'::text, 'experimentation'::text, 'safety'::text, 'debugging'::text])))
);


--
-- Name: learning_competency_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_competency_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learner_user_id uuid NOT NULL,
    competency_id uuid NOT NULL,
    mastery_score numeric(5,2) DEFAULT 0 NOT NULL,
    evidence_count integer DEFAULT 0 NOT NULL,
    last_evaluated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_competency_progress_evidence_count_check CHECK ((evidence_count >= 0)),
    CONSTRAINT learning_competency_progress_mastery_score_check CHECK (((mastery_score >= (0)::numeric) AND (mastery_score <= (100)::numeric)))
);


--
-- Name: learning_course_offerings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_course_offerings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    title text,
    academic_term text,
    academic_year integer,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    enrollment_open_at timestamp with time zone,
    enrollment_close_at timestamp with time zone,
    max_students integer,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_course_offerings_academic_year_check CHECK (((academic_year IS NULL) OR ((academic_year >= 2000) AND (academic_year <= 2200)))),
    CONSTRAINT learning_course_offerings_check CHECK (((end_at IS NULL) OR (start_at IS NULL) OR (end_at >= start_at))),
    CONSTRAINT learning_course_offerings_check1 CHECK (((enrollment_close_at IS NULL) OR (enrollment_open_at IS NULL) OR (enrollment_close_at >= enrollment_open_at))),
    CONSTRAINT learning_course_offerings_max_students_check CHECK (((max_students IS NULL) OR (max_students > 0))),
    CONSTRAINT learning_course_offerings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'active'::text, 'completed'::text, 'archived'::text, 'cancelled'::text])))
);


--
-- Name: learning_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_id uuid,
    organization_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_courses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: learning_demonstration_annotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_demonstration_annotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    demonstration_episode_id uuid NOT NULL,
    author_user_id uuid,
    start_ms bigint NOT NULL,
    end_ms bigint NOT NULL,
    label text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_demonstration_annotations_check CHECK ((end_ms >= start_ms)),
    CONSTRAINT learning_demonstration_annotations_start_ms_check CHECK ((start_ms >= 0))
);


--
-- Name: learning_demonstration_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_demonstration_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    demonstration_episode_id uuid NOT NULL,
    segment_index integer NOT NULL,
    start_ms bigint NOT NULL,
    end_ms bigint NOT NULL,
    semantic_action text,
    arm_side text,
    object_label text,
    segment_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_demonstration_segments_arm_side_check CHECK (((arm_side IS NULL) OR (arm_side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])))),
    CONSTRAINT learning_demonstration_segments_check CHECK ((end_ms >= start_ms)),
    CONSTRAINT learning_demonstration_segments_segment_index_check CHECK ((segment_index >= 0)),
    CONSTRAINT learning_demonstration_segments_start_ms_check CHECK ((start_ms >= 0))
);


--
-- Name: learning_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    learner_user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    offering_id uuid,
    classroom_id uuid,
    CONSTRAINT learning_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'revoked'::text])))
);


--
-- Name: learning_experiment_artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_experiment_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experiment_id uuid NOT NULL,
    artifact_type text NOT NULL,
    storage_path text,
    external_uri text,
    mime_type text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_experiment_artifacts_artifact_type_check CHECK ((artifact_type = ANY (ARRAY['image'::text, 'video'::text, 'trajectory'::text, 'log'::text, 'program'::text, 'observation'::text, 'metrics'::text, 'other'::text]))),
    CONSTRAINT learning_experiment_artifacts_check CHECK (((storage_path IS NOT NULL) OR (external_uri IS NOT NULL)))
);


--
-- Name: learning_experiment_comparisons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_experiment_comparisons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learner_user_id uuid,
    challenge_id uuid,
    title text NOT NULL,
    experiment_ids uuid[] NOT NULL,
    comparison_metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    conclusion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_experiment_comparisons_experiment_ids_check CHECK ((cardinality(experiment_ids) >= 2))
);


--
-- Name: learning_experiment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_experiment_events (
    id bigint NOT NULL,
    experiment_id uuid NOT NULL,
    event_index integer NOT NULL,
    event_type text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_experiment_events_event_index_check CHECK ((event_index >= 0))
);


--
-- Name: learning_experiment_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.learning_experiment_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.learning_experiment_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: learning_experiments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_experiments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    challenge_id uuid,
    submission_id uuid,
    learner_user_id uuid NOT NULL,
    method text NOT NULL,
    execution_mode text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    control_session_id uuid,
    demonstration_episode_id uuid,
    evaluation_run_id uuid,
    input_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    output_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_experiments_execution_mode_check CHECK ((execution_mode = ANY (ARRAY['schematic'::text, 'simulation'::text, 'real_robot'::text, 'offline_replay'::text]))),
    CONSTRAINT learning_experiments_method_check CHECK ((method = ANY (ARRAY['blockly'::text, 'demonstration'::text, 'vla'::text, 'manual'::text, 'flow'::text]))),
    CONSTRAINT learning_experiments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'stopped'::text, 'cancelled'::text])))
);


--
-- Name: learning_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid,
    attempt_id uuid,
    author_user_id uuid NOT NULL,
    parent_feedback_id uuid,
    feedback_type text DEFAULT 'comment'::text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_feedback_check CHECK (((submission_id IS NOT NULL) OR (attempt_id IS NOT NULL))),
    CONSTRAINT learning_feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['comment'::text, 'hint'::text, 'correction'::text, 'praise'::text, 'question'::text, 'system'::text])))
);


--
-- Name: learning_lesson_prerequisites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_lesson_prerequisites (
    lesson_id uuid NOT NULL,
    prerequisite_lesson_id uuid NOT NULL,
    required boolean DEFAULT true NOT NULL,
    minimum_score numeric(5,2),
    CONSTRAINT learning_lesson_prerequisites_check CHECK ((lesson_id <> prerequisite_lesson_id)),
    CONSTRAINT learning_lesson_prerequisites_minimum_score_check CHECK (((minimum_score IS NULL) OR ((minimum_score >= (0)::numeric) AND (minimum_score <= (100)::numeric))))
);


--
-- Name: learning_lesson_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_lesson_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learner_user_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    progress_percent numeric(5,2) DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_lesson_progress_progress_percent_check CHECK (((progress_percent >= (0)::numeric) AND (progress_percent <= (100)::numeric))),
    CONSTRAINT learning_lesson_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'locked'::text])))
);


--
-- Name: learning_lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    title text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    ordinal integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_lessons_ordinal_check CHECK ((ordinal > 0))
);


--
-- Name: learning_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    description text,
    ordinal integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_levels_ordinal_check CHECK (((ordinal >= 1) AND (ordinal <= 20)))
);


--
-- Name: learning_objective_competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_objective_competencies (
    objective_id uuid NOT NULL,
    competency_id uuid NOT NULL,
    weight numeric(5,2) DEFAULT 1 NOT NULL,
    CONSTRAINT learning_objective_competencies_weight_check CHECK ((weight > (0)::numeric))
);


--
-- Name: learning_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    ordinal integer DEFAULT 1 NOT NULL
);


--
-- Name: learning_program_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_program_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    version_number integer NOT NULL,
    workspace_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    robot_program jsonb DEFAULT '{}'::jsonb NOT NULL,
    validation_result jsonb DEFAULT '{}'::jsonb NOT NULL,
    change_summary text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_program_versions_version_number_check CHECK ((version_number > 0))
);


--
-- Name: learning_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    assignment_id uuid,
    title text DEFAULT 'Untitled program'::text NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    workspace_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    robot_program jsonb DEFAULT '{}'::jsonb NOT NULL,
    validation_result jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_programs_schema_version_check CHECK ((schema_version > 0))
);


--
-- Name: learning_question_version_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_question_version_objectives (
    question_version_id uuid NOT NULL,
    objective_id uuid NOT NULL
);


--
-- Name: learning_question_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_question_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    version_number integer NOT NULL,
    type text NOT NULL,
    difficulty text NOT NULL,
    cognitive_level text NOT NULL,
    stem text NOT NULL,
    options jsonb NOT NULL,
    answer_key jsonb NOT NULL,
    explanation text,
    source_reference text,
    status text DEFAULT 'draft'::text NOT NULL,
    authored_by uuid NOT NULL,
    reviewed_by uuid,
    published_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_question_versions_answer_key_check CHECK ((jsonb_typeof(answer_key) = 'array'::text)),
    CONSTRAINT learning_question_versions_cognitive_level_check CHECK ((cognitive_level = ANY (ARRAY['remember'::text, 'understand'::text, 'apply'::text, 'analyze'::text, 'evaluate'::text, 'create'::text]))),
    CONSTRAINT learning_question_versions_difficulty_check CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]))),
    CONSTRAINT learning_question_versions_options_check CHECK ((jsonb_typeof(options) = 'array'::text)),
    CONSTRAINT learning_question_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT learning_question_versions_stem_check CHECK ((length(btrim(stem)) > 0)),
    CONSTRAINT learning_question_versions_type_check CHECK ((type = ANY (ARRAY['single_choice'::text, 'multiple_choice'::text, 'true_false'::text]))),
    CONSTRAINT learning_question_versions_version_number_check CHECK ((version_number > 0))
);


--
-- Name: learning_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    course_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    domain text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_questions_code_check CHECK (((length(btrim(code)) >= 1) AND (length(btrim(code)) <= 80)))
);


--
-- Name: learning_quiz_attempt_grading; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_quiz_attempt_grading (
    attempt_id uuid NOT NULL,
    grading_snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_quiz_attempt_grading_grading_snapshot_check CHECK ((jsonb_typeof(grading_snapshot) = 'object'::text))
);


--
-- Name: learning_reflections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_reflections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    submission_id uuid,
    experiment_id uuid,
    learner_user_id uuid NOT NULL,
    prompt_key text NOT NULL,
    prompt_text text NOT NULL,
    response_text text,
    response_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_reflections_check CHECK (((submission_id IS NOT NULL) OR (experiment_id IS NOT NULL)))
);


--
-- Name: learning_rubric_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_rubric_criteria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    max_points numeric(7,2) NOT NULL,
    ordinal integer DEFAULT 1 NOT NULL,
    CONSTRAINT learning_rubric_criteria_max_points_check CHECK ((max_points > (0)::numeric))
);


--
-- Name: learning_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    title text NOT NULL,
    ordinal integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_sections_ordinal_check CHECK ((ordinal > 0)),
    CONSTRAINT learning_sections_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: learning_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    learner_user_id uuid NOT NULL,
    program_id uuid,
    submitted_workspace jsonb,
    submitted_program jsonb,
    reflection text,
    status text DEFAULT 'draft'::text NOT NULL,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    program_version_id uuid,
    CONSTRAINT learning_submissions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'reviewed'::text])))
);


--
-- Name: learning_symbolic_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_symbolic_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    fingerprint text NOT NULL,
    verdict text NOT NULL,
    rule_results jsonb NOT NULL,
    metrics jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_symbolic_evaluations_verdict_check CHECK ((verdict = ANY (ARRAY['passed'::text, 'failed'::text])))
);


--
-- Name: TABLE learning_symbolic_evaluations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.learning_symbolic_evaluations IS 'Append-only completed symbolic evaluation evidence. Cross-table provenance is verified transactionally by the application service.';


--
-- Name: learning_vla_action_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_vla_action_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    interaction_id uuid NOT NULL,
    step_index integer NOT NULL,
    arm_side text,
    action_type text NOT NULL,
    action_parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    reasoning_summary text,
    validation_status text DEFAULT 'pending'::text NOT NULL,
    execution_status text DEFAULT 'pending'::text NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_vla_action_steps_arm_side_check CHECK (((arm_side IS NULL) OR (arm_side = ANY (ARRAY['left'::text, 'right'::text, 'both'::text])))),
    CONSTRAINT learning_vla_action_steps_execution_status_check CHECK ((execution_status = ANY (ARRAY['pending'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text]))),
    CONSTRAINT learning_vla_action_steps_step_index_check CHECK ((step_index >= 0)),
    CONSTRAINT learning_vla_action_steps_validation_status_check CHECK ((validation_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'modified'::text])))
);


--
-- Name: learning_vla_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_vla_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    experiment_id uuid NOT NULL,
    learner_user_id uuid,
    language_instruction text NOT NULL,
    observation_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    perceived_entities jsonb DEFAULT '[]'::jsonb NOT NULL,
    generated_plan jsonb DEFAULT '{}'::jsonb NOT NULL,
    proposed_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    confidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    safety_validation jsonb DEFAULT '{}'::jsonb NOT NULL,
    execution_authorized boolean DEFAULT false NOT NULL,
    execution_result jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    robot_id uuid,
    license_key_hash text NOT NULL,
    key_prefix text,
    plan text NOT NULL,
    max_installations integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT licenses_max_installations_check CHECK ((max_installations > 0)),
    CONSTRAINT licenses_status_check CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role_id uuid NOT NULL,
    safety_profile_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memberships_check CHECK (((ends_at IS NULL) OR (ends_at > starts_at))),
    CONSTRAINT memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: model_checkpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_checkpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ai_model_id uuid NOT NULL,
    training_run_id uuid,
    version text NOT NULL,
    step integer,
    huggingface_repo text,
    huggingface_revision text,
    artifact_uri text,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT model_checkpoints_step_check CHECK (((step IS NULL) OR (step >= 0)))
);


--
-- Name: observation_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.observation_configurations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    version integer NOT NULL,
    camera_sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    robot_observation jsonb DEFAULT '{}'::jsonb NOT NULL,
    arm_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT observation_configurations_version_check CHECK ((version > 0))
);


--
-- Name: org_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    resource_type text NOT NULL,
    robot_id uuid,
    ai_model_id uuid,
    mode_id uuid,
    seats integer,
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_to timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_entitlements_check CHECK (((valid_to IS NULL) OR (valid_to > valid_from))),
    CONSTRAINT org_entitlements_check1 CHECK ((((resource_type = 'robot'::text) AND (robot_id IS NOT NULL) AND (ai_model_id IS NULL) AND (mode_id IS NULL)) OR ((resource_type = 'model'::text) AND (ai_model_id IS NOT NULL) AND (robot_id IS NULL) AND (mode_id IS NULL)) OR ((resource_type = 'mode'::text) AND (mode_id IS NOT NULL) AND (robot_id IS NULL) AND (ai_model_id IS NULL)))),
    CONSTRAINT org_entitlements_resource_type_check CHECK ((resource_type = ANY (ARRAY['robot'::text, 'model'::text, 'mode'::text]))),
    CONSTRAINT org_entitlements_seats_check CHECK (((seats IS NULL) OR (seats > 0)))
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    segment text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    contract_start date,
    contract_end date,
    converted_from_lead_id uuid,
    personal_owner_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    school_code text,
    CONSTRAINT organizations_check CHECK (((type = 'personal'::text) = (personal_owner_user_id IS NOT NULL))),
    CONSTRAINT organizations_check1 CHECK (((contract_end IS NULL) OR (contract_start IS NULL) OR (contract_end >= contract_start))),
    CONSTRAINT organizations_segment_check CHECK ((segment = ANY (ARRAY['education'::text, 'research'::text, 'assistive'::text, 'hobby'::text]))),
    CONSTRAINT organizations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]))),
    CONSTRAINT organizations_type_check CHECK ((type = ANY (ARRAY['institution'::text, 'personal'::text])))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text
);


--
-- Name: port_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.port_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    arm_id uuid NOT NULL,
    installation_id uuid,
    port_path text NOT NULL,
    device_identity text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    CONSTRAINT port_assignments_check CHECK (((released_at IS NULL) OR (released_at >= assigned_at))),
    CONSTRAINT port_assignments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'released'::text, 'invalid'::text])))
);


--
-- Name: readiness_check_calibrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_check_calibrations (
    readiness_check_id uuid NOT NULL,
    calibration_profile_id uuid NOT NULL
);


--
-- Name: readiness_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readiness_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    robot_id uuid NOT NULL,
    result text NOT NULL,
    checks jsonb DEFAULT '{}'::jsonb NOT NULL,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    performed_by uuid,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT readiness_checks_check CHECK ((((result = 'passed'::text) AND (failure_reason IS NULL)) OR ((result = 'failed'::text) AND (failure_reason IS NOT NULL)))),
    CONSTRAINT readiness_checks_result_check CHECK ((result = ANY (ARRAY['passed'::text, 'failed'::text])))
);


--
-- Name: robots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.robots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    serial_no text NOT NULL,
    name text NOT NULL,
    model_name text DEFAULT 'SO-101'::text NOT NULL,
    firmware_version text,
    status text DEFAULT 'available'::text NOT NULL,
    owner_organization_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT robots_status_check CHECK ((status = ANY (ARRAY['available'::text, 'in_use'::text, 'maintenance'::text, 'retired'::text])))
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    scope text NOT NULL,
    default_safety_profile_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT roles_scope_check CHECK ((scope = ANY (ARRAY['system'::text, 'organization'::text])))
);


--
-- Name: safety_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safety_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    control_session_id uuid,
    arm_id uuid,
    event_type text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    reason text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    CONSTRAINT safety_events_event_type_check CHECK ((event_type = ANY (ARRAY['hold'::text, 'input_timeout'::text, 'tracking_lost'::text, 'clutch_released'::text, 'stop'::text, 'emergency_stop'::text, 'unlock'::text, 'input_rejected'::text, 'joint_limit'::text, 'workspace_limit'::text, 'rate_limit'::text, 'hardware_fault'::text, 'mode_change'::text, 'session_error'::text]))),
    CONSTRAINT safety_events_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))
);


--
-- Name: safety_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.safety_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    max_speed_pct integer NOT NULL,
    workspace_limit jsonb DEFAULT '{}'::jsonb NOT NULL,
    max_session_minutes integer,
    require_estop_ack boolean DEFAULT true NOT NULL,
    allowed_modes text[] DEFAULT ARRAY['manual'::text] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT safety_profiles_max_session_minutes_check CHECK (((max_session_minutes IS NULL) OR (max_session_minutes > 0))),
    CONSTRAINT safety_profiles_max_speed_pct_check CHECK (((max_speed_pct >= 1) AND (max_speed_pct <= 100)))
);


--
-- Name: session_arms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_arms (
    control_session_id uuid NOT NULL,
    arm_id uuid NOT NULL,
    channel text NOT NULL,
    role text NOT NULL,
    CONSTRAINT session_arms_channel_check CHECK ((channel = ANY (ARRAY['left'::text, 'right'::text]))),
    CONSTRAINT session_arms_role_check CHECK ((role = ANY (ARRAY['leader'::text, 'follower'::text])))
);


--
-- Name: simulation_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.simulation_scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    benchmark_task_id uuid NOT NULL,
    name text NOT NULL,
    version integer NOT NULL,
    engine text DEFAULT 'mujoco'::text NOT NULL,
    object_configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    randomization_configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT simulation_scenarios_version_check CHECK ((version > 0))
);


--
-- Name: training_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.training_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_version_id uuid NOT NULL,
    requested_by uuid,
    policy_name text DEFAULT 'SmolVLA'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    compute_source text,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_runs_check CHECK (((ended_at IS NULL) OR (started_at IS NULL) OR (ended_at >= started_at))),
    CONSTRAINT training_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: user_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    entitlement_id uuid NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: user_system_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_system_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    full_name text NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    signup_method text NOT NULL,
    email_verified_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_user_id uuid,
    CONSTRAINT users_signup_method_check CHECK ((signup_method = ANY (ARRAY['admin_created'::text, 'self_registered'::text]))),
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'disabled'::text])))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'Application profile and authorization data. Authentication credentials are managed by Supabase Auth.';


--
-- Name: COLUMN users.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.auth_user_id IS 'Supabase Auth identity that owns this VISTA application user.';


--
-- Name: vista_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vista_schema_migrations (
    version text NOT NULL,
    checksum text NOT NULL,
    release_id text NOT NULL,
    source_commit text NOT NULL,
    operator_id text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance text DEFAULT 'executed'::text NOT NULL,
    CONSTRAINT vista_schema_migrations_provenance_check CHECK ((provenance = ANY (ARRAY['executed'::text, 'baseline_verified'::text])))
);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: ai_models ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_pkey PRIMARY KEY (id);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: app_installations app_installations_license_id_machine_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_installations
    ADD CONSTRAINT app_installations_license_id_machine_fingerprint_key UNIQUE (license_id, machine_fingerprint);


--
-- Name: app_installations app_installations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_installations
    ADD CONSTRAINT app_installations_pkey PRIMARY KEY (id);


--
-- Name: arms arms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arms
    ADD CONSTRAINT arms_pkey PRIMARY KEY (id);


--
-- Name: arms arms_robot_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arms
    ADD CONSTRAINT arms_robot_id_code_key UNIQUE (robot_id, code);


--
-- Name: arms arms_robot_id_role_side_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arms
    ADD CONSTRAINT arms_robot_id_role_side_key UNIQUE (robot_id, role, side);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens auth_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: benchmark_tasks benchmark_tasks_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.benchmark_tasks
    ADD CONSTRAINT benchmark_tasks_code_key UNIQUE (code);


--
-- Name: benchmark_tasks benchmark_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.benchmark_tasks
    ADD CONSTRAINT benchmark_tasks_pkey PRIMARY KEY (id);


--
-- Name: calibration_profiles calibration_profiles_arm_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_profiles
    ADD CONSTRAINT calibration_profiles_arm_id_version_key UNIQUE (arm_id, version);


--
-- Name: calibration_profiles calibration_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_profiles
    ADD CONSTRAINT calibration_profiles_pkey PRIMARY KEY (id);


--
-- Name: control_modes control_modes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_modes
    ADD CONSTRAINT control_modes_code_key UNIQUE (code);


--
-- Name: control_modes control_modes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_modes
    ADD CONSTRAINT control_modes_pkey PRIMARY KEY (id);


--
-- Name: control_sessions control_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_pkey PRIMARY KEY (id);


--
-- Name: dataset_episodes dataset_episodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_episodes
    ADD CONSTRAINT dataset_episodes_pkey PRIMARY KEY (dataset_version_id, demonstration_episode_id);


--
-- Name: dataset_versions dataset_versions_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_versions
    ADD CONSTRAINT dataset_versions_name_version_key UNIQUE (name, version);


--
-- Name: dataset_versions dataset_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_versions
    ADD CONSTRAINT dataset_versions_pkey PRIMARY KEY (id);


--
-- Name: demo_bookings demo_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_bookings
    ADD CONSTRAINT demo_bookings_pkey PRIMARY KEY (id);


--
-- Name: demonstration_episodes demonstration_episodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demonstration_episodes
    ADD CONSTRAINT demonstration_episodes_pkey PRIMARY KEY (id);


--
-- Name: education_school_user_profiles education_school_user_profiles_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education_school_user_profiles
    ADD CONSTRAINT education_school_user_profiles_organization_id_user_id_key UNIQUE (organization_id, user_id);


--
-- Name: education_school_user_profiles education_school_user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education_school_user_profiles
    ADD CONSTRAINT education_school_user_profiles_pkey PRIMARY KEY (id);


--
-- Name: evaluation_runs evaluation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_runs
    ADD CONSTRAINT evaluation_runs_pkey PRIMARY KEY (id);


--
-- Name: iot_command_lifecycles iot_command_lifecycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iot_command_lifecycles
    ADD CONSTRAINT iot_command_lifecycles_pkey PRIMARY KEY (command_id);


--
-- Name: iot_inbound_events iot_inbound_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iot_inbound_events
    ADD CONSTRAINT iot_inbound_events_pkey PRIMARY KEY (event_id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: learning_activities learning_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activities
    ADD CONSTRAINT learning_activities_pkey PRIMARY KEY (id);


--
-- Name: learning_activities learning_activities_section_id_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activities
    ADD CONSTRAINT learning_activities_section_id_ordinal_key UNIQUE (section_id, ordinal) DEFERRABLE;


--
-- Name: learning_activity_objectives learning_activity_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_objectives
    ADD CONSTRAINT learning_activity_objectives_pkey PRIMARY KEY (activity_id, objective_id);


--
-- Name: learning_activity_progress learning_activity_progress_learner_activity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_progress
    ADD CONSTRAINT learning_activity_progress_learner_activity_key UNIQUE (learner_user_id, activity_id);


--
-- Name: learning_activity_progress learning_activity_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_progress
    ADD CONSTRAINT learning_activity_progress_pkey PRIMARY KEY (id);


--
-- Name: learning_assessment_scores learning_assessment_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assessment_scores
    ADD CONSTRAINT learning_assessment_scores_pkey PRIMARY KEY (assessment_id, criterion_id);


--
-- Name: learning_assessments learning_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assessments
    ADD CONSTRAINT learning_assessments_pkey PRIMARY KEY (id);


--
-- Name: learning_assessments learning_assessments_submission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assessments
    ADD CONSTRAINT learning_assessments_submission_id_key UNIQUE (submission_id);


--
-- Name: learning_assignment_attempts learning_assignment_attempts_classroom_assignment_id_learne_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_attempts
    ADD CONSTRAINT learning_assignment_attempts_classroom_assignment_id_learne_key UNIQUE (classroom_assignment_id, learner_user_id, attempt_number);


--
-- Name: learning_assignment_attempts learning_assignment_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_attempts
    ADD CONSTRAINT learning_assignment_attempts_pkey PRIMARY KEY (id);


--
-- Name: learning_assignment_question_versions learning_assignment_question_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_question_versions
    ADD CONSTRAINT learning_assignment_question_identity_key UNIQUE (assignment_id, question_id);


--
-- Name: learning_assignment_question_versions learning_assignment_question_versions_assignment_id_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_question_versions
    ADD CONSTRAINT learning_assignment_question_versions_assignment_id_ordinal_key UNIQUE (assignment_id, ordinal) DEFERRABLE;


--
-- Name: learning_assignment_question_versions learning_assignment_question_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_question_versions
    ADD CONSTRAINT learning_assignment_question_versions_pkey PRIMARY KEY (assignment_id, question_version_id);


--
-- Name: learning_assignments learning_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignments
    ADD CONSTRAINT learning_assignments_pkey PRIMARY KEY (id);


--
-- Name: learning_challenge_conditions learning_challenge_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenge_conditions
    ADD CONSTRAINT learning_challenge_conditions_pkey PRIMARY KEY (id);


--
-- Name: learning_challenge_objects learning_challenge_objects_challenge_id_object_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenge_objects
    ADD CONSTRAINT learning_challenge_objects_challenge_id_object_key_key UNIQUE (challenge_id, object_key);


--
-- Name: learning_challenge_objects learning_challenge_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenge_objects
    ADD CONSTRAINT learning_challenge_objects_pkey PRIMARY KEY (id);


--
-- Name: learning_challenges learning_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenges
    ADD CONSTRAINT learning_challenges_pkey PRIMARY KEY (id);


--
-- Name: learning_classroom_assignments learning_classroom_assignments_classroom_id_assignment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_assignments
    ADD CONSTRAINT learning_classroom_assignments_classroom_id_assignment_id_key UNIQUE (classroom_id, assignment_id);


--
-- Name: learning_classroom_assignments learning_classroom_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_assignments
    ADD CONSTRAINT learning_classroom_assignments_pkey PRIMARY KEY (id);


--
-- Name: learning_classroom_members learning_classroom_members_classroom_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_members
    ADD CONSTRAINT learning_classroom_members_classroom_id_user_id_key UNIQUE (classroom_id, user_id);


--
-- Name: learning_classroom_members learning_classroom_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_members
    ADD CONSTRAINT learning_classroom_members_pkey PRIMARY KEY (id);


--
-- Name: learning_classroom_robot_allocations learning_classroom_robot_allocations_classroom_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_robot_allocations
    ADD CONSTRAINT learning_classroom_robot_allocations_classroom_id_key UNIQUE (classroom_id);


--
-- Name: learning_classroom_robot_allocations learning_classroom_robot_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_robot_allocations
    ADD CONSTRAINT learning_classroom_robot_allocations_pkey PRIMARY KEY (id);


--
-- Name: learning_classrooms learning_classrooms_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classrooms
    ADD CONSTRAINT learning_classrooms_organization_id_code_key UNIQUE (organization_id, code);


--
-- Name: learning_classrooms learning_classrooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classrooms
    ADD CONSTRAINT learning_classrooms_pkey PRIMARY KEY (id);


--
-- Name: learning_competencies learning_competencies_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_competencies
    ADD CONSTRAINT learning_competencies_code_key UNIQUE (code);


--
-- Name: learning_competencies learning_competencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_competencies
    ADD CONSTRAINT learning_competencies_pkey PRIMARY KEY (id);


--
-- Name: learning_competency_progress learning_competency_progress_learner_user_id_competency_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_competency_progress
    ADD CONSTRAINT learning_competency_progress_learner_user_id_competency_id_key UNIQUE (learner_user_id, competency_id);


--
-- Name: learning_competency_progress learning_competency_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_competency_progress
    ADD CONSTRAINT learning_competency_progress_pkey PRIMARY KEY (id);


--
-- Name: learning_course_offerings learning_course_offerings_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_course_offerings
    ADD CONSTRAINT learning_course_offerings_organization_id_code_key UNIQUE (organization_id, code);


--
-- Name: learning_course_offerings learning_course_offerings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_course_offerings
    ADD CONSTRAINT learning_course_offerings_pkey PRIMARY KEY (id);


--
-- Name: learning_courses learning_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_courses
    ADD CONSTRAINT learning_courses_pkey PRIMARY KEY (id);


--
-- Name: learning_demonstration_annotations learning_demonstration_annotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_demonstration_annotations
    ADD CONSTRAINT learning_demonstration_annotations_pkey PRIMARY KEY (id);


--
-- Name: learning_demonstration_segments learning_demonstration_segmen_demonstration_episode_id_segm_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_demonstration_segments
    ADD CONSTRAINT learning_demonstration_segmen_demonstration_episode_id_segm_key UNIQUE (demonstration_episode_id, segment_index);


--
-- Name: learning_demonstration_segments learning_demonstration_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_demonstration_segments
    ADD CONSTRAINT learning_demonstration_segments_pkey PRIMARY KEY (id);


--
-- Name: learning_enrollments learning_enrollments_course_id_learner_user_id_classroom_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_enrollments
    ADD CONSTRAINT learning_enrollments_course_id_learner_user_id_classroom_id_key UNIQUE (course_id, learner_user_id, classroom_id);


--
-- Name: learning_enrollments learning_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_enrollments
    ADD CONSTRAINT learning_enrollments_pkey PRIMARY KEY (id);


--
-- Name: learning_experiment_artifacts learning_experiment_artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_artifacts
    ADD CONSTRAINT learning_experiment_artifacts_pkey PRIMARY KEY (id);


--
-- Name: learning_experiment_comparisons learning_experiment_comparisons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_comparisons
    ADD CONSTRAINT learning_experiment_comparisons_pkey PRIMARY KEY (id);


--
-- Name: learning_experiment_events learning_experiment_events_experiment_id_event_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_events
    ADD CONSTRAINT learning_experiment_events_experiment_id_event_index_key UNIQUE (experiment_id, event_index);


--
-- Name: learning_experiment_events learning_experiment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_events
    ADD CONSTRAINT learning_experiment_events_pkey PRIMARY KEY (id);


--
-- Name: learning_experiments learning_experiments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiments
    ADD CONSTRAINT learning_experiments_pkey PRIMARY KEY (id);


--
-- Name: learning_feedback learning_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_feedback
    ADD CONSTRAINT learning_feedback_pkey PRIMARY KEY (id);


--
-- Name: learning_lesson_prerequisites learning_lesson_prerequisites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lesson_prerequisites
    ADD CONSTRAINT learning_lesson_prerequisites_pkey PRIMARY KEY (lesson_id, prerequisite_lesson_id);


--
-- Name: learning_lesson_progress learning_lesson_progress_learner_user_id_lesson_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lesson_progress
    ADD CONSTRAINT learning_lesson_progress_learner_user_id_lesson_id_key UNIQUE (learner_user_id, lesson_id);


--
-- Name: learning_lesson_progress learning_lesson_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lesson_progress
    ADD CONSTRAINT learning_lesson_progress_pkey PRIMARY KEY (id);


--
-- Name: learning_lessons learning_lessons_course_id_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lessons
    ADD CONSTRAINT learning_lessons_course_id_ordinal_key UNIQUE (course_id, ordinal);


--
-- Name: learning_lessons learning_lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lessons
    ADD CONSTRAINT learning_lessons_pkey PRIMARY KEY (id);


--
-- Name: learning_levels learning_levels_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_levels
    ADD CONSTRAINT learning_levels_code_key UNIQUE (code);


--
-- Name: learning_levels learning_levels_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_levels
    ADD CONSTRAINT learning_levels_ordinal_key UNIQUE (ordinal);


--
-- Name: learning_levels learning_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_levels
    ADD CONSTRAINT learning_levels_pkey PRIMARY KEY (id);


--
-- Name: learning_objective_competencies learning_objective_competencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_competencies
    ADD CONSTRAINT learning_objective_competencies_pkey PRIMARY KEY (objective_id, competency_id);


--
-- Name: learning_objectives learning_objectives_lesson_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_lesson_id_code_key UNIQUE (lesson_id, code);


--
-- Name: learning_objectives learning_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_pkey PRIMARY KEY (id);


--
-- Name: learning_program_versions learning_program_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_program_versions
    ADD CONSTRAINT learning_program_versions_pkey PRIMARY KEY (id);


--
-- Name: learning_program_versions learning_program_versions_program_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_program_versions
    ADD CONSTRAINT learning_program_versions_program_id_version_number_key UNIQUE (program_id, version_number);


--
-- Name: learning_programs learning_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_programs
    ADD CONSTRAINT learning_programs_pkey PRIMARY KEY (id);


--
-- Name: learning_question_version_objectives learning_question_version_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_version_objectives
    ADD CONSTRAINT learning_question_version_objectives_pkey PRIMARY KEY (question_version_id, objective_id);


--
-- Name: learning_question_versions learning_question_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_versions
    ADD CONSTRAINT learning_question_versions_pkey PRIMARY KEY (id);


--
-- Name: learning_question_versions learning_question_versions_question_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_versions
    ADD CONSTRAINT learning_question_versions_question_id_version_number_key UNIQUE (question_id, version_number);


--
-- Name: learning_questions learning_questions_organization_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_questions
    ADD CONSTRAINT learning_questions_organization_id_code_key UNIQUE (organization_id, code);


--
-- Name: learning_questions learning_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_questions
    ADD CONSTRAINT learning_questions_pkey PRIMARY KEY (id);


--
-- Name: learning_quiz_attempt_grading learning_quiz_attempt_grading_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_quiz_attempt_grading
    ADD CONSTRAINT learning_quiz_attempt_grading_pkey PRIMARY KEY (attempt_id);


--
-- Name: learning_reflections learning_reflections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reflections
    ADD CONSTRAINT learning_reflections_pkey PRIMARY KEY (id);


--
-- Name: learning_rubric_criteria learning_rubric_criteria_assignment_id_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_rubric_criteria
    ADD CONSTRAINT learning_rubric_criteria_assignment_id_ordinal_key UNIQUE (assignment_id, ordinal);


--
-- Name: learning_rubric_criteria learning_rubric_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_rubric_criteria
    ADD CONSTRAINT learning_rubric_criteria_pkey PRIMARY KEY (id);


--
-- Name: learning_sections learning_sections_lesson_id_ordinal_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_sections
    ADD CONSTRAINT learning_sections_lesson_id_ordinal_key UNIQUE (lesson_id, ordinal) DEFERRABLE;


--
-- Name: learning_sections learning_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_sections
    ADD CONSTRAINT learning_sections_pkey PRIMARY KEY (id);


--
-- Name: learning_submissions learning_submissions_assignment_id_learner_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_submissions
    ADD CONSTRAINT learning_submissions_assignment_id_learner_user_id_key UNIQUE (assignment_id, learner_user_id);


--
-- Name: learning_submissions learning_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_submissions
    ADD CONSTRAINT learning_submissions_pkey PRIMARY KEY (id);


--
-- Name: learning_symbolic_evaluations learning_symbolic_evaluations_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_symbolic_evaluations
    ADD CONSTRAINT learning_symbolic_evaluations_fingerprint_key UNIQUE (fingerprint);


--
-- Name: learning_symbolic_evaluations learning_symbolic_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_symbolic_evaluations
    ADD CONSTRAINT learning_symbolic_evaluations_pkey PRIMARY KEY (id);


--
-- Name: learning_vla_action_steps learning_vla_action_steps_interaction_id_step_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_vla_action_steps
    ADD CONSTRAINT learning_vla_action_steps_interaction_id_step_index_key UNIQUE (interaction_id, step_index);


--
-- Name: learning_vla_action_steps learning_vla_action_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_vla_action_steps
    ADD CONSTRAINT learning_vla_action_steps_pkey PRIMARY KEY (id);


--
-- Name: learning_vla_interactions learning_vla_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_vla_interactions
    ADD CONSTRAINT learning_vla_interactions_pkey PRIMARY KEY (id);


--
-- Name: licenses licenses_license_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_license_key_hash_key UNIQUE (license_key_hash);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_id_organization_id_key UNIQUE (id, organization_id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_user_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_organization_id_key UNIQUE (user_id, organization_id);


--
-- Name: model_checkpoints model_checkpoints_ai_model_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_checkpoints
    ADD CONSTRAINT model_checkpoints_ai_model_id_version_key UNIQUE (ai_model_id, version);


--
-- Name: model_checkpoints model_checkpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_checkpoints
    ADD CONSTRAINT model_checkpoints_pkey PRIMARY KEY (id);


--
-- Name: observation_configurations observation_configurations_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_configurations
    ADD CONSTRAINT observation_configurations_name_version_key UNIQUE (name, version);


--
-- Name: observation_configurations observation_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.observation_configurations
    ADD CONSTRAINT observation_configurations_pkey PRIMARY KEY (id);


--
-- Name: org_entitlements org_entitlements_id_organization_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_entitlements
    ADD CONSTRAINT org_entitlements_id_organization_id_key UNIQUE (id, organization_id);


--
-- Name: org_entitlements org_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_entitlements
    ADD CONSTRAINT org_entitlements_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_personal_owner_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_personal_owner_user_id_key UNIQUE (personal_owner_user_id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_school_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_school_code_key UNIQUE (school_code);


--
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: port_assignments port_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.port_assignments
    ADD CONSTRAINT port_assignments_pkey PRIMARY KEY (id);


--
-- Name: readiness_check_calibrations readiness_check_calibrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_check_calibrations
    ADD CONSTRAINT readiness_check_calibrations_pkey PRIMARY KEY (readiness_check_id, calibration_profile_id);


--
-- Name: readiness_checks readiness_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_checks
    ADD CONSTRAINT readiness_checks_pkey PRIMARY KEY (id);


--
-- Name: robots robots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.robots
    ADD CONSTRAINT robots_pkey PRIMARY KEY (id);


--
-- Name: robots robots_serial_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.robots
    ADD CONSTRAINT robots_serial_no_key UNIQUE (serial_no);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: safety_events safety_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_events
    ADD CONSTRAINT safety_events_pkey PRIMARY KEY (id);


--
-- Name: safety_profiles safety_profiles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_profiles
    ADD CONSTRAINT safety_profiles_name_key UNIQUE (name);


--
-- Name: safety_profiles safety_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_profiles
    ADD CONSTRAINT safety_profiles_pkey PRIMARY KEY (id);


--
-- Name: session_arms session_arms_control_session_id_channel_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_arms
    ADD CONSTRAINT session_arms_control_session_id_channel_role_key UNIQUE (control_session_id, channel, role);


--
-- Name: session_arms session_arms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_arms
    ADD CONSTRAINT session_arms_pkey PRIMARY KEY (control_session_id, arm_id);


--
-- Name: simulation_scenarios simulation_scenarios_benchmark_task_id_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_scenarios
    ADD CONSTRAINT simulation_scenarios_benchmark_task_id_name_version_key UNIQUE (benchmark_task_id, name, version);


--
-- Name: simulation_scenarios simulation_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_scenarios
    ADD CONSTRAINT simulation_scenarios_pkey PRIMARY KEY (id);


--
-- Name: training_runs training_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_runs
    ADD CONSTRAINT training_runs_pkey PRIMARY KEY (id);


--
-- Name: education_school_user_profiles uq_school_profiles_org_student_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education_school_user_profiles
    ADD CONSTRAINT uq_school_profiles_org_student_code UNIQUE (organization_id, student_code);


--
-- Name: user_assignments user_assignments_membership_id_entitlement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_membership_id_entitlement_id_key UNIQUE (membership_id, entitlement_id);


--
-- Name: user_assignments user_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_pkey PRIMARY KEY (id);


--
-- Name: user_system_roles user_system_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_system_roles
    ADD CONSTRAINT user_system_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vista_schema_migrations vista_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vista_schema_migrations
    ADD CONSTRAINT vista_schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_assignment_attempts_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_attempts_assignment ON public.learning_assignment_attempts USING btree (classroom_assignment_id);


--
-- Name: idx_assignment_attempts_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_attempts_learner ON public.learning_assignment_attempts USING btree (learner_user_id);


--
-- Name: idx_challenge_conditions_challenge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_conditions_challenge ON public.learning_challenge_conditions USING btree (challenge_id);


--
-- Name: idx_challenge_objects_challenge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_objects_challenge ON public.learning_challenge_objects USING btree (challenge_id);


--
-- Name: idx_classroom_assignments_classroom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classroom_assignments_classroom ON public.learning_classroom_assignments USING btree (classroom_id);


--
-- Name: idx_classroom_members_classroom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classroom_members_classroom ON public.learning_classroom_members USING btree (classroom_id);


--
-- Name: idx_classroom_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classroom_members_user ON public.learning_classroom_members USING btree (user_id);


--
-- Name: idx_classroom_robot_allocations_robot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classroom_robot_allocations_robot ON public.learning_classroom_robot_allocations USING btree (robot_id);


--
-- Name: idx_classrooms_offering; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classrooms_offering ON public.learning_classrooms USING btree (offering_id);


--
-- Name: idx_classrooms_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classrooms_org ON public.learning_classrooms USING btree (organization_id);


--
-- Name: idx_competency_progress_competency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competency_progress_competency ON public.learning_competency_progress USING btree (competency_id);


--
-- Name: idx_competency_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_competency_progress_user ON public.learning_competency_progress USING btree (learner_user_id);


--
-- Name: idx_course_offerings_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_offerings_course ON public.learning_course_offerings USING btree (course_id);


--
-- Name: idx_course_offerings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_offerings_org ON public.learning_course_offerings USING btree (organization_id);


--
-- Name: idx_demo_segments_episode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_demo_segments_episode ON public.learning_demonstration_segments USING btree (demonstration_episode_id, segment_index);


--
-- Name: idx_experiment_artifacts_experiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experiment_artifacts_experiment ON public.learning_experiment_artifacts USING btree (experiment_id);


--
-- Name: idx_learning_annotations_episode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_annotations_episode ON public.learning_demonstration_annotations USING btree (demonstration_episode_id);


--
-- Name: idx_learning_assignments_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_assignments_lesson ON public.learning_assignments USING btree (lesson_id);


--
-- Name: idx_learning_courses_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_courses_level ON public.learning_courses USING btree (level_id);


--
-- Name: idx_learning_enrollments_active_classroom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_enrollments_active_classroom ON public.learning_enrollments USING btree (classroom_id, learner_user_id) WHERE (status = 'active'::text);


--
-- Name: idx_learning_enrollments_classroom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_enrollments_classroom ON public.learning_enrollments USING btree (classroom_id);


--
-- Name: idx_learning_enrollments_offering; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_enrollments_offering ON public.learning_enrollments USING btree (offering_id);


--
-- Name: idx_learning_enrollments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_enrollments_user ON public.learning_enrollments USING btree (learner_user_id);


--
-- Name: idx_learning_experiment_events_experiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_experiment_events_experiment ON public.learning_experiment_events USING btree (experiment_id);


--
-- Name: idx_learning_experiments_control_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_experiments_control_session ON public.learning_experiments USING btree (control_session_id);


--
-- Name: idx_learning_experiments_demo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_experiments_demo ON public.learning_experiments USING btree (demonstration_episode_id);


--
-- Name: idx_learning_experiments_evaluation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_experiments_evaluation ON public.learning_experiments USING btree (evaluation_run_id);


--
-- Name: idx_learning_experiments_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_experiments_learner ON public.learning_experiments USING btree (learner_user_id);


--
-- Name: idx_learning_experiments_submission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_experiments_submission ON public.learning_experiments USING btree (submission_id);


--
-- Name: idx_learning_feedback_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_feedback_attempt ON public.learning_feedback USING btree (attempt_id);


--
-- Name: idx_learning_feedback_submission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_feedback_submission ON public.learning_feedback USING btree (submission_id);


--
-- Name: idx_learning_lessons_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_lessons_course ON public.learning_lessons USING btree (course_id);


--
-- Name: idx_learning_objectives_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_objectives_lesson ON public.learning_objectives USING btree (lesson_id);


--
-- Name: idx_learning_programs_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_programs_assignment ON public.learning_programs USING btree (assignment_id);


--
-- Name: idx_learning_programs_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_programs_owner ON public.learning_programs USING btree (owner_user_id);


--
-- Name: idx_learning_submissions_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_submissions_assignment ON public.learning_submissions USING btree (assignment_id);


--
-- Name: idx_learning_submissions_learner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_submissions_learner ON public.learning_submissions USING btree (learner_user_id);


--
-- Name: idx_learning_submissions_program_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_submissions_program_version ON public.learning_submissions USING btree (program_version_id);


--
-- Name: idx_learning_symbolic_evaluations_experiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_symbolic_evaluations_experiment ON public.learning_symbolic_evaluations USING btree (experiment_id);


--
-- Name: idx_learning_symbolic_evaluations_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_symbolic_evaluations_requester ON public.learning_symbolic_evaluations USING btree (requested_by_user_id);


--
-- Name: idx_lesson_progress_lesson; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_progress_lesson ON public.learning_lesson_progress USING btree (lesson_id);


--
-- Name: idx_lesson_progress_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lesson_progress_user ON public.learning_lesson_progress USING btree (learner_user_id);


--
-- Name: idx_program_versions_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_program_versions_program ON public.learning_program_versions USING btree (program_id, version_number);


--
-- Name: idx_reflections_experiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reflections_experiment ON public.learning_reflections USING btree (experiment_id);


--
-- Name: idx_reflections_submission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reflections_submission ON public.learning_reflections USING btree (submission_id);


--
-- Name: idx_vla_action_steps_interaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vla_action_steps_interaction ON public.learning_vla_action_steps USING btree (interaction_id, step_index);


--
-- Name: idx_vla_interactions_experiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vla_interactions_experiment ON public.learning_vla_interactions USING btree (experiment_id);


--
-- Name: iot_command_lifecycles_experiment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iot_command_lifecycles_experiment_idx ON public.iot_command_lifecycles USING btree (experiment_id);


--
-- Name: iot_command_lifecycles_robot_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iot_command_lifecycles_robot_state_idx ON public.iot_command_lifecycles USING btree (robot_id, state);


--
-- Name: iot_inbound_events_command_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iot_inbound_events_command_received_idx ON public.iot_inbound_events USING btree (command_id, received_at);


--
-- Name: iot_inbound_events_robot_received_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iot_inbound_events_robot_received_idx ON public.iot_inbound_events USING btree (robot_id, received_at);


--
-- Name: ix_audit_logs_actor_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_actor_time ON public.audit_logs USING btree (actor_user_id, created_at DESC);


--
-- Name: ix_audit_logs_org_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_org_time ON public.audit_logs USING btree (organization_id, created_at DESC);


--
-- Name: ix_auth_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_auth_tokens_user ON public.auth_tokens USING btree (user_id, purpose);


--
-- Name: ix_control_sessions_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_control_sessions_member ON public.control_sessions USING btree (membership_id, created_at DESC);


--
-- Name: ix_control_sessions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_control_sessions_org ON public.control_sessions USING btree (organization_id, created_at DESC);


--
-- Name: ix_control_sessions_state_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_control_sessions_state_created ON public.control_sessions USING btree (state, created_at DESC);


--
-- Name: ix_dataset_episodes_split; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_dataset_episodes_split ON public.dataset_episodes USING btree (dataset_version_id, split);


--
-- Name: ix_demo_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_demo_bookings_status ON public.demo_bookings USING btree (status, scheduled_at);


--
-- Name: ix_demonstration_episodes_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_demonstration_episodes_session ON public.demonstration_episodes USING btree (control_session_id) WHERE (control_session_id IS NOT NULL);


--
-- Name: ix_demonstration_episodes_task_outcome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_demonstration_episodes_task_outcome ON public.demonstration_episodes USING btree (benchmark_task_id, outcome, created_at DESC);


--
-- Name: ix_evaluation_runs_checkpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evaluation_runs_checkpoint ON public.evaluation_runs USING btree (model_checkpoint_id, created_at DESC);


--
-- Name: ix_evaluation_runs_task_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evaluation_runs_task_mode ON public.evaluation_runs USING btree (benchmark_task_id, target_mode, created_at DESC);


--
-- Name: ix_leads_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_leads_status_created ON public.leads USING btree (status, created_at DESC);


--
-- Name: ix_memberships_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_memberships_org ON public.memberships USING btree (organization_id, status);


--
-- Name: ix_org_entitlements_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_org_entitlements_org ON public.org_entitlements USING btree (organization_id, resource_type);


--
-- Name: ix_readiness_checks_robot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_readiness_checks_robot ON public.readiness_checks USING btree (robot_id, performed_at DESC);


--
-- Name: ix_safety_events_arm_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_safety_events_arm_time ON public.safety_events USING btree (arm_id, occurred_at DESC);


--
-- Name: ix_safety_events_session_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_safety_events_session_time ON public.safety_events USING btree (control_session_id, occurred_at DESC);


--
-- Name: ix_school_profiles_org_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_school_profiles_org_type ON public.education_school_user_profiles USING btree (organization_id, person_type);


--
-- Name: ix_training_runs_dataset_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_training_runs_dataset_status ON public.training_runs USING btree (dataset_version_id, status, created_at DESC);


--
-- Name: learning_activities_section_id_status_ordinal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_activities_section_id_status_ordinal_idx ON public.learning_activities USING btree (section_id, status, ordinal);


--
-- Name: learning_activity_objectives_objective_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_activity_objectives_objective_id_idx ON public.learning_activity_objectives USING btree (objective_id);


--
-- Name: learning_activity_progress_activity_definition_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_activity_progress_activity_definition_id_idx ON public.learning_activity_progress USING btree (activity_definition_id);


--
-- Name: learning_activity_progress_learner_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_activity_progress_learner_user_id_idx ON public.learning_activity_progress USING btree (learner_user_id);


--
-- Name: learning_activity_progress_lesson_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_activity_progress_lesson_id_idx ON public.learning_activity_progress USING btree (lesson_id);


--
-- Name: learning_assignment_question_versions_question_version_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_assignment_question_versions_question_version_id_idx ON public.learning_assignment_question_versions USING btree (question_version_id);


--
-- Name: learning_question_version_objectives_objective_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_question_version_objectives_objective_id_idx ON public.learning_question_version_objectives USING btree (objective_id);


--
-- Name: learning_question_versions_question_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_question_versions_question_id_status_idx ON public.learning_question_versions USING btree (question_id, status);


--
-- Name: learning_questions_course_id_lesson_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_questions_course_id_lesson_id_idx ON public.learning_questions USING btree (course_id, lesson_id);


--
-- Name: learning_questions_organization_id_lesson_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_questions_organization_id_lesson_id_idx ON public.learning_questions USING btree (organization_id, lesson_id);


--
-- Name: learning_sections_lesson_id_status_ordinal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_sections_lesson_id_status_ordinal_idx ON public.learning_sections USING btree (lesson_id, status, ordinal);


--
-- Name: uq_school_profiles_employee_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_school_profiles_employee_code ON public.education_school_user_profiles USING btree (organization_id, lower(employee_code)) WHERE (employee_code IS NOT NULL);


--
-- Name: uq_school_profiles_student_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_school_profiles_student_code ON public.education_school_user_profiles USING btree (organization_id, lower(student_code)) WHERE (student_code IS NOT NULL);


--
-- Name: ux_calibration_profiles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_calibration_profiles_active ON public.calibration_profiles USING btree (arm_id) WHERE (status = 'valid'::text);


--
-- Name: ux_control_sessions_open_robot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_control_sessions_open_robot ON public.control_sessions USING btree (robot_id) WHERE (state = ANY (ARRAY['ready'::text, 'active'::text, 'hold'::text]));


--
-- Name: ux_port_assignments_active_arm; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_port_assignments_active_arm ON public.port_assignments USING btree (arm_id) WHERE (status = 'active'::text);


--
-- Name: ux_port_assignments_active_port; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_port_assignments_active_port ON public.port_assignments USING btree (installation_id, port_path) WHERE (status = 'active'::text);


--
-- Name: ux_users_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_users_email_lower ON public.users USING btree (lower(email));


--
-- Name: learning_question_version_objectives check_learning_question_objective; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_learning_question_objective BEFORE INSERT OR UPDATE ON public.learning_question_version_objectives FOR EACH ROW EXECUTE FUNCTION public.check_learning_question_objective();


--
-- Name: learning_questions check_learning_question_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_learning_question_scope BEFORE INSERT OR UPDATE ON public.learning_questions FOR EACH ROW EXECUTE FUNCTION public.check_learning_question_scope();


--
-- Name: learning_assignment_question_versions guard_learning_assignment_question; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_learning_assignment_question BEFORE INSERT OR DELETE OR UPDATE ON public.learning_assignment_question_versions FOR EACH ROW EXECUTE FUNCTION public.guard_learning_assignment_question();


--
-- Name: learning_question_version_objectives guard_learning_question_objective; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_learning_question_objective BEFORE INSERT OR DELETE OR UPDATE ON public.learning_question_version_objectives FOR EACH ROW EXECUTE FUNCTION public.guard_learning_question_objective();


--
-- Name: learning_question_versions guard_learning_question_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_learning_question_version BEFORE DELETE OR UPDATE ON public.learning_question_versions FOR EACH ROW EXECUTE FUNCTION public.guard_learning_question_version();


--
-- Name: learning_quiz_attempt_grading guard_question_bank_quiz_grading; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_question_bank_quiz_grading BEFORE DELETE OR UPDATE ON public.learning_quiz_attempt_grading FOR EACH ROW EXECUTE FUNCTION public.guard_question_bank_quiz_grading();


--
-- Name: learning_assignment_attempts guard_question_bank_quiz_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_question_bank_quiz_snapshot BEFORE UPDATE ON public.learning_assignment_attempts FOR EACH ROW EXECUTE FUNCTION public.guard_question_bank_quiz_snapshot();


--
-- Name: learning_assignment_attempts lock_learning_assignment_questions_on_attempt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_learning_assignment_questions_on_attempt BEFORE INSERT ON public.learning_assignment_attempts FOR EACH ROW EXECUTE FUNCTION public.lock_learning_assignment_questions_on_attempt();


--
-- Name: learning_classroom_assignments lock_learning_assignment_questions_on_delivery; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_learning_assignment_questions_on_delivery BEFORE INSERT OR UPDATE OF status ON public.learning_classroom_assignments FOR EACH ROW EXECUTE FUNCTION public.lock_learning_assignment_questions_on_delivery();


--
-- Name: ai_models trg_ai_models_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ai_models_updated_at BEFORE UPDATE ON public.ai_models FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: arms trg_arms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_arms_updated_at BEFORE UPDATE ON public.arms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: benchmark_tasks trg_benchmark_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_benchmark_tasks_updated_at BEFORE UPDATE ON public.benchmark_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: dataset_episodes trg_dataset_episodes_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_dataset_episodes_frozen BEFORE INSERT OR DELETE OR UPDATE ON public.dataset_episodes FOR EACH ROW EXECUTE FUNCTION public.forbid_frozen_dataset_change();


--
-- Name: licenses trg_licenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_licenses_updated_at BEFORE UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: memberships trg_memberships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_memberships_updated_at BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: organizations trg_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: robots trg_robots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_robots_updated_at BEFORE UPDATE ON public.robots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: safety_profiles trg_safety_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_safety_profiles_updated_at BEFORE UPDATE ON public.safety_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ai_models ai_models_owner_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_owner_organization_id_fkey FOREIGN KEY (owner_organization_id) REFERENCES public.organizations(id);


--
-- Name: ai_models ai_models_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: app_installations app_installations_license_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_installations
    ADD CONSTRAINT app_installations_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.licenses(id);


--
-- Name: app_installations app_installations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_installations
    ADD CONSTRAINT app_installations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: arms arms_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arms
    ADD CONSTRAINT arms_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: auth_tokens auth_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: calibration_profiles calibration_profiles_arm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_profiles
    ADD CONSTRAINT calibration_profiles_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id);


--
-- Name: calibration_profiles calibration_profiles_calibrated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_profiles
    ADD CONSTRAINT calibration_profiles_calibrated_by_fkey FOREIGN KEY (calibrated_by) REFERENCES public.users(id);


--
-- Name: control_sessions control_sessions_installation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.app_installations(id);


--
-- Name: control_sessions control_sessions_membership_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_membership_id_organization_id_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.memberships(id, organization_id);


--
-- Name: control_sessions control_sessions_mode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_mode_id_fkey FOREIGN KEY (mode_id) REFERENCES public.control_modes(id);


--
-- Name: control_sessions control_sessions_model_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_model_checkpoint_id_fkey FOREIGN KEY (model_checkpoint_id) REFERENCES public.model_checkpoints(id);


--
-- Name: control_sessions control_sessions_readiness_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_readiness_check_id_fkey FOREIGN KEY (readiness_check_id) REFERENCES public.readiness_checks(id);


--
-- Name: control_sessions control_sessions_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);


--
-- Name: control_sessions control_sessions_safety_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.control_sessions
    ADD CONSTRAINT control_sessions_safety_profile_id_fkey FOREIGN KEY (safety_profile_id) REFERENCES public.safety_profiles(id);


--
-- Name: dataset_episodes dataset_episodes_dataset_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_episodes
    ADD CONSTRAINT dataset_episodes_dataset_version_id_fkey FOREIGN KEY (dataset_version_id) REFERENCES public.dataset_versions(id) ON DELETE CASCADE;


--
-- Name: dataset_episodes dataset_episodes_demonstration_episode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_episodes
    ADD CONSTRAINT dataset_episodes_demonstration_episode_id_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id);


--
-- Name: dataset_versions dataset_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_versions
    ADD CONSTRAINT dataset_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: dataset_versions dataset_versions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dataset_versions
    ADD CONSTRAINT dataset_versions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: demo_bookings demo_bookings_assigned_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_bookings
    ADD CONSTRAINT demo_bookings_assigned_admin_id_fkey FOREIGN KEY (assigned_admin_id) REFERENCES public.users(id);


--
-- Name: demo_bookings demo_bookings_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_bookings
    ADD CONSTRAINT demo_bookings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: demonstration_episodes demonstration_episodes_benchmark_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demonstration_episodes
    ADD CONSTRAINT demonstration_episodes_benchmark_task_id_fkey FOREIGN KEY (benchmark_task_id) REFERENCES public.benchmark_tasks(id);


--
-- Name: demonstration_episodes demonstration_episodes_control_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demonstration_episodes
    ADD CONSTRAINT demonstration_episodes_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id) ON DELETE SET NULL;


--
-- Name: demonstration_episodes demonstration_episodes_observation_configuration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demonstration_episodes
    ADD CONSTRAINT demonstration_episodes_observation_configuration_id_fkey FOREIGN KEY (observation_configuration_id) REFERENCES public.observation_configurations(id);


--
-- Name: demonstration_episodes demonstration_episodes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demonstration_episodes
    ADD CONSTRAINT demonstration_episodes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: demonstration_episodes demonstration_episodes_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demonstration_episodes
    ADD CONSTRAINT demonstration_episodes_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);


--
-- Name: demonstration_episodes demonstration_episodes_simulation_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demonstration_episodes
    ADD CONSTRAINT demonstration_episodes_simulation_scenario_id_fkey FOREIGN KEY (simulation_scenario_id) REFERENCES public.simulation_scenarios(id);


--
-- Name: education_school_user_profiles education_school_user_profiles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education_school_user_profiles
    ADD CONSTRAINT education_school_user_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: education_school_user_profiles education_school_user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.education_school_user_profiles
    ADD CONSTRAINT education_school_user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: evaluation_runs evaluation_runs_benchmark_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_runs
    ADD CONSTRAINT evaluation_runs_benchmark_task_id_fkey FOREIGN KEY (benchmark_task_id) REFERENCES public.benchmark_tasks(id);


--
-- Name: evaluation_runs evaluation_runs_control_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_runs
    ADD CONSTRAINT evaluation_runs_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id) ON DELETE SET NULL;


--
-- Name: evaluation_runs evaluation_runs_model_checkpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_runs
    ADD CONSTRAINT evaluation_runs_model_checkpoint_id_fkey FOREIGN KEY (model_checkpoint_id) REFERENCES public.model_checkpoints(id);


--
-- Name: evaluation_runs evaluation_runs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_runs
    ADD CONSTRAINT evaluation_runs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: evaluation_runs evaluation_runs_simulation_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluation_runs
    ADD CONSTRAINT evaluation_runs_simulation_scenario_id_fkey FOREIGN KEY (simulation_scenario_id) REFERENCES public.simulation_scenarios(id);


--
-- Name: iot_command_lifecycles iot_command_lifecycles_control_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iot_command_lifecycles
    ADD CONSTRAINT iot_command_lifecycles_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id) ON DELETE RESTRICT;


--
-- Name: iot_command_lifecycles iot_command_lifecycles_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iot_command_lifecycles
    ADD CONSTRAINT iot_command_lifecycles_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id) ON DELETE RESTRICT;


--
-- Name: iot_command_lifecycles iot_command_lifecycles_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iot_command_lifecycles
    ADD CONSTRAINT iot_command_lifecycles_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id) ON DELETE RESTRICT;


--
-- Name: iot_inbound_events iot_inbound_events_command_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iot_inbound_events
    ADD CONSTRAINT iot_inbound_events_command_id_fkey FOREIGN KEY (command_id) REFERENCES public.iot_command_lifecycles(command_id) ON DELETE SET NULL;


--
-- Name: iot_inbound_events iot_inbound_events_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iot_inbound_events
    ADD CONSTRAINT iot_inbound_events_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id) ON DELETE RESTRICT;


--
-- Name: learning_activities learning_activities_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activities
    ADD CONSTRAINT learning_activities_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.learning_sections(id) ON DELETE RESTRICT;


--
-- Name: learning_activity_objectives learning_activity_objectives_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_objectives
    ADD CONSTRAINT learning_activity_objectives_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.learning_activities(id) ON DELETE CASCADE;


--
-- Name: learning_activity_objectives learning_activity_objectives_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_objectives
    ADD CONSTRAINT learning_activity_objectives_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id) ON DELETE RESTRICT;


--
-- Name: learning_activity_progress learning_activity_progress_activity_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_progress
    ADD CONSTRAINT learning_activity_progress_activity_definition_id_fkey FOREIGN KEY (activity_definition_id) REFERENCES public.learning_activities(id) ON DELETE RESTRICT;


--
-- Name: learning_activity_progress learning_activity_progress_learner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_progress
    ADD CONSTRAINT learning_activity_progress_learner_user_id_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_activity_progress learning_activity_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_activity_progress
    ADD CONSTRAINT learning_activity_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id) ON DELETE CASCADE;


--
-- Name: learning_assessment_scores learning_assessment_scores_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assessment_scores
    ADD CONSTRAINT learning_assessment_scores_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.learning_assessments(id) ON DELETE CASCADE;


--
-- Name: learning_assessment_scores learning_assessment_scores_criterion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assessment_scores
    ADD CONSTRAINT learning_assessment_scores_criterion_id_fkey FOREIGN KEY (criterion_id) REFERENCES public.learning_rubric_criteria(id) ON DELETE CASCADE;


--
-- Name: learning_assessments learning_assessments_reviewer_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assessments
    ADD CONSTRAINT learning_assessments_reviewer_user_fkey FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_assessments learning_assessments_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assessments
    ADD CONSTRAINT learning_assessments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id) ON DELETE CASCADE;


--
-- Name: learning_assignment_attempts learning_assignment_attempts_classroom_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_attempts
    ADD CONSTRAINT learning_assignment_attempts_classroom_assignment_id_fkey FOREIGN KEY (classroom_assignment_id) REFERENCES public.learning_classroom_assignments(id) ON DELETE CASCADE;


--
-- Name: learning_assignment_attempts learning_assignment_attempts_learner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_attempts
    ADD CONSTRAINT learning_assignment_attempts_learner_user_id_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_assignment_attempts learning_assignment_attempts_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_attempts
    ADD CONSTRAINT learning_assignment_attempts_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.learning_programs(id) ON DELETE SET NULL;


--
-- Name: learning_assignment_question_versions learning_assignment_question_versions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_question_versions
    ADD CONSTRAINT learning_assignment_question_versions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id) ON DELETE RESTRICT;


--
-- Name: learning_assignment_question_versions learning_assignment_question_versions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_question_versions
    ADD CONSTRAINT learning_assignment_question_versions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.learning_questions(id) ON DELETE RESTRICT;


--
-- Name: learning_assignment_question_versions learning_assignment_question_versions_question_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignment_question_versions
    ADD CONSTRAINT learning_assignment_question_versions_question_version_id_fkey FOREIGN KEY (question_version_id) REFERENCES public.learning_question_versions(id) ON DELETE RESTRICT;


--
-- Name: learning_assignments learning_assignments_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignments
    ADD CONSTRAINT learning_assignments_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id) ON DELETE SET NULL;


--
-- Name: learning_assignments learning_assignments_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_assignments
    ADD CONSTRAINT learning_assignments_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id) ON DELETE CASCADE;


--
-- Name: learning_challenge_conditions learning_challenge_conditions_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenge_conditions
    ADD CONSTRAINT learning_challenge_conditions_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id) ON DELETE CASCADE;


--
-- Name: learning_challenge_objects learning_challenge_objects_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenge_objects
    ADD CONSTRAINT learning_challenge_objects_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id) ON DELETE CASCADE;


--
-- Name: learning_challenges learning_challenges_creator_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenges
    ADD CONSTRAINT learning_challenges_creator_user_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_challenges learning_challenges_organization_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_challenges
    ADD CONSTRAINT learning_challenges_organization_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: learning_classroom_assignments learning_classroom_assignments_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_assignments
    ADD CONSTRAINT learning_classroom_assignments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id) ON DELETE CASCADE;


--
-- Name: learning_classroom_assignments learning_classroom_assignments_classroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_assignments
    ADD CONSTRAINT learning_classroom_assignments_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id) ON DELETE CASCADE;


--
-- Name: learning_classroom_assignments learning_classroom_assignments_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_assignments
    ADD CONSTRAINT learning_classroom_assignments_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_classroom_members learning_classroom_members_classroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_members
    ADD CONSTRAINT learning_classroom_members_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id) ON DELETE CASCADE;


--
-- Name: learning_classroom_members learning_classroom_members_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_members
    ADD CONSTRAINT learning_classroom_members_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE SET NULL;


--
-- Name: learning_classroom_members learning_classroom_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_members
    ADD CONSTRAINT learning_classroom_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_classroom_robot_allocations learning_classroom_robot_allocations_classroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_robot_allocations
    ADD CONSTRAINT learning_classroom_robot_allocations_classroom_id_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id) ON DELETE CASCADE;


--
-- Name: learning_classroom_robot_allocations learning_classroom_robot_allocations_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_robot_allocations
    ADD CONSTRAINT learning_classroom_robot_allocations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: learning_classroom_robot_allocations learning_classroom_robot_allocations_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classroom_robot_allocations
    ADD CONSTRAINT learning_classroom_robot_allocations_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);


--
-- Name: learning_classrooms learning_classrooms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classrooms
    ADD CONSTRAINT learning_classrooms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_classrooms learning_classrooms_offering_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classrooms
    ADD CONSTRAINT learning_classrooms_offering_id_fkey FOREIGN KEY (offering_id) REFERENCES public.learning_course_offerings(id) ON DELETE CASCADE;


--
-- Name: learning_classrooms learning_classrooms_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_classrooms
    ADD CONSTRAINT learning_classrooms_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: learning_competency_progress learning_competency_progress_competency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_competency_progress
    ADD CONSTRAINT learning_competency_progress_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.learning_competencies(id) ON DELETE CASCADE;


--
-- Name: learning_competency_progress learning_competency_progress_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_competency_progress
    ADD CONSTRAINT learning_competency_progress_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_course_offerings learning_course_offerings_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_course_offerings
    ADD CONSTRAINT learning_course_offerings_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.learning_courses(id) ON DELETE CASCADE;


--
-- Name: learning_course_offerings learning_course_offerings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_course_offerings
    ADD CONSTRAINT learning_course_offerings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_course_offerings learning_course_offerings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_course_offerings
    ADD CONSTRAINT learning_course_offerings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: learning_courses learning_courses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_courses
    ADD CONSTRAINT learning_courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_courses learning_courses_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_courses
    ADD CONSTRAINT learning_courses_level_id_fkey FOREIGN KEY (level_id) REFERENCES public.learning_levels(id) ON DELETE SET NULL;


--
-- Name: learning_courses learning_courses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_courses
    ADD CONSTRAINT learning_courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
-- Name: learning_demonstration_annotations learning_demo_annotations_episode_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_demonstration_annotations
    ADD CONSTRAINT learning_demo_annotations_episode_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id) ON DELETE CASCADE;


--
-- Name: learning_demonstration_segments learning_demo_segments_episode_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_demonstration_segments
    ADD CONSTRAINT learning_demo_segments_episode_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id) ON DELETE CASCADE;


--
-- Name: learning_enrollments learning_enrollments_classroom_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_enrollments
    ADD CONSTRAINT learning_enrollments_classroom_fkey FOREIGN KEY (classroom_id) REFERENCES public.learning_classrooms(id) ON DELETE SET NULL;


--
-- Name: learning_enrollments learning_enrollments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_enrollments
    ADD CONSTRAINT learning_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.learning_courses(id) ON DELETE CASCADE;


--
-- Name: learning_enrollments learning_enrollments_offering_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_enrollments
    ADD CONSTRAINT learning_enrollments_offering_fkey FOREIGN KEY (offering_id) REFERENCES public.learning_course_offerings(id) ON DELETE SET NULL;


--
-- Name: learning_enrollments learning_enrollments_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_enrollments
    ADD CONSTRAINT learning_enrollments_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_experiment_artifacts learning_experiment_artifacts_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_artifacts
    ADD CONSTRAINT learning_experiment_artifacts_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id) ON DELETE CASCADE;


--
-- Name: learning_experiment_comparisons learning_experiment_comparisons_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_comparisons
    ADD CONSTRAINT learning_experiment_comparisons_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id) ON DELETE SET NULL;


--
-- Name: learning_experiment_comparisons learning_experiment_comparisons_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_comparisons
    ADD CONSTRAINT learning_experiment_comparisons_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_experiment_events learning_experiment_events_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiment_events
    ADD CONSTRAINT learning_experiment_events_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id) ON DELETE CASCADE;


--
-- Name: learning_experiments learning_experiments_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiments
    ADD CONSTRAINT learning_experiments_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.learning_challenges(id) ON DELETE SET NULL;


--
-- Name: learning_experiments learning_experiments_control_session_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiments
    ADD CONSTRAINT learning_experiments_control_session_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id) ON DELETE SET NULL;


--
-- Name: learning_experiments learning_experiments_demonstration_episode_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiments
    ADD CONSTRAINT learning_experiments_demonstration_episode_fkey FOREIGN KEY (demonstration_episode_id) REFERENCES public.demonstration_episodes(id) ON DELETE SET NULL;


--
-- Name: learning_experiments learning_experiments_evaluation_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiments
    ADD CONSTRAINT learning_experiments_evaluation_run_fkey FOREIGN KEY (evaluation_run_id) REFERENCES public.evaluation_runs(id) ON DELETE SET NULL;


--
-- Name: learning_experiments learning_experiments_learner_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiments
    ADD CONSTRAINT learning_experiments_learner_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_experiments learning_experiments_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_experiments
    ADD CONSTRAINT learning_experiments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id) ON DELETE SET NULL;


--
-- Name: learning_feedback learning_feedback_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_feedback
    ADD CONSTRAINT learning_feedback_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.learning_assignment_attempts(id) ON DELETE CASCADE;


--
-- Name: learning_feedback learning_feedback_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_feedback
    ADD CONSTRAINT learning_feedback_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id);


--
-- Name: learning_feedback learning_feedback_parent_feedback_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_feedback
    ADD CONSTRAINT learning_feedback_parent_feedback_id_fkey FOREIGN KEY (parent_feedback_id) REFERENCES public.learning_feedback(id) ON DELETE CASCADE;


--
-- Name: learning_feedback learning_feedback_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_feedback
    ADD CONSTRAINT learning_feedback_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id) ON DELETE CASCADE;


--
-- Name: learning_lesson_prerequisites learning_lesson_prerequisites_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lesson_prerequisites
    ADD CONSTRAINT learning_lesson_prerequisites_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id) ON DELETE CASCADE;


--
-- Name: learning_lesson_prerequisites learning_lesson_prerequisites_prerequisite_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lesson_prerequisites
    ADD CONSTRAINT learning_lesson_prerequisites_prerequisite_lesson_id_fkey FOREIGN KEY (prerequisite_lesson_id) REFERENCES public.learning_lessons(id) ON DELETE CASCADE;


--
-- Name: learning_lesson_progress learning_lesson_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lesson_progress
    ADD CONSTRAINT learning_lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id) ON DELETE CASCADE;


--
-- Name: learning_lesson_progress learning_lesson_progress_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lesson_progress
    ADD CONSTRAINT learning_lesson_progress_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_lessons learning_lessons_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_lessons
    ADD CONSTRAINT learning_lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.learning_courses(id) ON DELETE CASCADE;


--
-- Name: learning_objective_competencies learning_objective_competencies_competency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_competencies
    ADD CONSTRAINT learning_objective_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.learning_competencies(id) ON DELETE CASCADE;


--
-- Name: learning_objective_competencies learning_objective_competencies_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objective_competencies
    ADD CONSTRAINT learning_objective_competencies_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id) ON DELETE CASCADE;


--
-- Name: learning_objectives learning_objectives_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id) ON DELETE CASCADE;


--
-- Name: learning_program_versions learning_program_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_program_versions
    ADD CONSTRAINT learning_program_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: learning_program_versions learning_program_versions_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_program_versions
    ADD CONSTRAINT learning_program_versions_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.learning_programs(id) ON DELETE CASCADE;


--
-- Name: learning_programs learning_programs_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_programs
    ADD CONSTRAINT learning_programs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id) ON DELETE SET NULL;


--
-- Name: learning_programs learning_programs_owner_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_programs
    ADD CONSTRAINT learning_programs_owner_user_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_question_version_objectives learning_question_version_objectives_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_version_objectives
    ADD CONSTRAINT learning_question_version_objectives_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id) ON DELETE RESTRICT;


--
-- Name: learning_question_version_objectives learning_question_version_objectives_question_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_version_objectives
    ADD CONSTRAINT learning_question_version_objectives_question_version_id_fkey FOREIGN KEY (question_version_id) REFERENCES public.learning_question_versions(id) ON DELETE RESTRICT;


--
-- Name: learning_question_versions learning_question_versions_authored_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_versions
    ADD CONSTRAINT learning_question_versions_authored_by_fkey FOREIGN KEY (authored_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: learning_question_versions learning_question_versions_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_versions
    ADD CONSTRAINT learning_question_versions_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: learning_question_versions learning_question_versions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_versions
    ADD CONSTRAINT learning_question_versions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.learning_questions(id) ON DELETE RESTRICT;


--
-- Name: learning_question_versions learning_question_versions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_question_versions
    ADD CONSTRAINT learning_question_versions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: learning_questions learning_questions_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_questions
    ADD CONSTRAINT learning_questions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.learning_courses(id) ON DELETE RESTRICT;


--
-- Name: learning_questions learning_questions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_questions
    ADD CONSTRAINT learning_questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: learning_questions learning_questions_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_questions
    ADD CONSTRAINT learning_questions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id) ON DELETE RESTRICT;


--
-- Name: learning_questions learning_questions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_questions
    ADD CONSTRAINT learning_questions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;


--
-- Name: learning_quiz_attempt_grading learning_quiz_attempt_grading_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_quiz_attempt_grading
    ADD CONSTRAINT learning_quiz_attempt_grading_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.learning_assignment_attempts(id) ON DELETE RESTRICT;


--
-- Name: learning_reflections learning_reflections_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reflections
    ADD CONSTRAINT learning_reflections_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id) ON DELETE CASCADE;


--
-- Name: learning_reflections learning_reflections_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reflections
    ADD CONSTRAINT learning_reflections_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id) ON DELETE CASCADE;


--
-- Name: learning_reflections learning_reflections_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reflections
    ADD CONSTRAINT learning_reflections_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_rubric_criteria learning_rubric_criteria_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_rubric_criteria
    ADD CONSTRAINT learning_rubric_criteria_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id) ON DELETE CASCADE;


--
-- Name: learning_sections learning_sections_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_sections
    ADD CONSTRAINT learning_sections_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.learning_lessons(id) ON DELETE RESTRICT;


--
-- Name: learning_submissions learning_submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_submissions
    ADD CONSTRAINT learning_submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.learning_assignments(id) ON DELETE CASCADE;


--
-- Name: learning_submissions learning_submissions_learner_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_submissions
    ADD CONSTRAINT learning_submissions_learner_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: learning_submissions learning_submissions_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_submissions
    ADD CONSTRAINT learning_submissions_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.learning_programs(id) ON DELETE SET NULL;


--
-- Name: learning_submissions learning_submissions_program_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_submissions
    ADD CONSTRAINT learning_submissions_program_version_id_fkey FOREIGN KEY (program_version_id) REFERENCES public.learning_program_versions(id);


--
-- Name: learning_symbolic_evaluations learning_symbolic_evaluations_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_symbolic_evaluations
    ADD CONSTRAINT learning_symbolic_evaluations_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id) ON DELETE CASCADE;


--
-- Name: learning_symbolic_evaluations learning_symbolic_evaluations_program_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_symbolic_evaluations
    ADD CONSTRAINT learning_symbolic_evaluations_program_version_id_fkey FOREIGN KEY (program_version_id) REFERENCES public.learning_program_versions(id);


--
-- Name: learning_symbolic_evaluations learning_symbolic_evaluations_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_symbolic_evaluations
    ADD CONSTRAINT learning_symbolic_evaluations_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id);


--
-- Name: learning_symbolic_evaluations learning_symbolic_evaluations_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_symbolic_evaluations
    ADD CONSTRAINT learning_symbolic_evaluations_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.learning_submissions(id);


--
-- Name: learning_vla_action_steps learning_vla_action_steps_interaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_vla_action_steps
    ADD CONSTRAINT learning_vla_action_steps_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES public.learning_vla_interactions(id) ON DELETE CASCADE;


--
-- Name: learning_vla_interactions learning_vla_interactions_experiment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_vla_interactions
    ADD CONSTRAINT learning_vla_interactions_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.learning_experiments(id) ON DELETE CASCADE;


--
-- Name: learning_vla_interactions learning_vla_interactions_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_vla_interactions
    ADD CONSTRAINT learning_vla_interactions_user_fkey FOREIGN KEY (learner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: licenses licenses_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: licenses licenses_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);


--
-- Name: memberships memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: memberships memberships_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: memberships memberships_safety_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_safety_profile_id_fkey FOREIGN KEY (safety_profile_id) REFERENCES public.safety_profiles(id);


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: model_checkpoints model_checkpoints_ai_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_checkpoints
    ADD CONSTRAINT model_checkpoints_ai_model_id_fkey FOREIGN KEY (ai_model_id) REFERENCES public.ai_models(id);


--
-- Name: model_checkpoints model_checkpoints_training_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_checkpoints
    ADD CONSTRAINT model_checkpoints_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES public.training_runs(id) ON DELETE SET NULL;


--
-- Name: org_entitlements org_entitlements_ai_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_entitlements
    ADD CONSTRAINT org_entitlements_ai_model_id_fkey FOREIGN KEY (ai_model_id) REFERENCES public.ai_models(id);


--
-- Name: org_entitlements org_entitlements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_entitlements
    ADD CONSTRAINT org_entitlements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_entitlements org_entitlements_mode_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_entitlements
    ADD CONSTRAINT org_entitlements_mode_id_fkey FOREIGN KEY (mode_id) REFERENCES public.control_modes(id);


--
-- Name: org_entitlements org_entitlements_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_entitlements
    ADD CONSTRAINT org_entitlements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: org_entitlements org_entitlements_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_entitlements
    ADD CONSTRAINT org_entitlements_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);


--
-- Name: organizations organizations_converted_from_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_converted_from_lead_id_fkey FOREIGN KEY (converted_from_lead_id) REFERENCES public.leads(id);


--
-- Name: organizations organizations_personal_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_personal_owner_user_id_fkey FOREIGN KEY (personal_owner_user_id) REFERENCES public.users(id);


--
-- Name: port_assignments port_assignments_arm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.port_assignments
    ADD CONSTRAINT port_assignments_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id);


--
-- Name: port_assignments port_assignments_installation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.port_assignments
    ADD CONSTRAINT port_assignments_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.app_installations(id);


--
-- Name: readiness_check_calibrations readiness_check_calibrations_calibration_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_check_calibrations
    ADD CONSTRAINT readiness_check_calibrations_calibration_profile_id_fkey FOREIGN KEY (calibration_profile_id) REFERENCES public.calibration_profiles(id);


--
-- Name: readiness_check_calibrations readiness_check_calibrations_readiness_check_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_check_calibrations
    ADD CONSTRAINT readiness_check_calibrations_readiness_check_id_fkey FOREIGN KEY (readiness_check_id) REFERENCES public.readiness_checks(id) ON DELETE CASCADE;


--
-- Name: readiness_checks readiness_checks_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_checks
    ADD CONSTRAINT readiness_checks_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id);


--
-- Name: readiness_checks readiness_checks_robot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readiness_checks
    ADD CONSTRAINT readiness_checks_robot_id_fkey FOREIGN KEY (robot_id) REFERENCES public.robots(id);


--
-- Name: robots robots_owner_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.robots
    ADD CONSTRAINT robots_owner_organization_id_fkey FOREIGN KEY (owner_organization_id) REFERENCES public.organizations(id);


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: roles roles_default_safety_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_default_safety_profile_id_fkey FOREIGN KEY (default_safety_profile_id) REFERENCES public.safety_profiles(id);


--
-- Name: safety_events safety_events_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_events
    ADD CONSTRAINT safety_events_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.users(id);


--
-- Name: safety_events safety_events_arm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_events
    ADD CONSTRAINT safety_events_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id) ON DELETE SET NULL;


--
-- Name: safety_events safety_events_control_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.safety_events
    ADD CONSTRAINT safety_events_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id) ON DELETE SET NULL;


--
-- Name: session_arms session_arms_arm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_arms
    ADD CONSTRAINT session_arms_arm_id_fkey FOREIGN KEY (arm_id) REFERENCES public.arms(id);


--
-- Name: session_arms session_arms_control_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_arms
    ADD CONSTRAINT session_arms_control_session_id_fkey FOREIGN KEY (control_session_id) REFERENCES public.control_sessions(id) ON DELETE CASCADE;


--
-- Name: simulation_scenarios simulation_scenarios_benchmark_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_scenarios
    ADD CONSTRAINT simulation_scenarios_benchmark_task_id_fkey FOREIGN KEY (benchmark_task_id) REFERENCES public.benchmark_tasks(id);


--
-- Name: training_runs training_runs_dataset_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_runs
    ADD CONSTRAINT training_runs_dataset_version_id_fkey FOREIGN KEY (dataset_version_id) REFERENCES public.dataset_versions(id);


--
-- Name: training_runs training_runs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.training_runs
    ADD CONSTRAINT training_runs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: user_assignments user_assignments_entitlement_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_entitlement_id_organization_id_fkey FOREIGN KEY (entitlement_id, organization_id) REFERENCES public.org_entitlements(id, organization_id);


--
-- Name: user_assignments user_assignments_membership_id_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_assignments
    ADD CONSTRAINT user_assignments_membership_id_organization_id_fkey FOREIGN KEY (membership_id, organization_id) REFERENCES public.memberships(id, organization_id);


--
-- Name: user_system_roles user_system_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_system_roles
    ADD CONSTRAINT user_system_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: user_system_roles user_system_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_system_roles
    ADD CONSTRAINT user_system_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: iot_command_lifecycles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iot_command_lifecycles ENABLE ROW LEVEL SECURITY;

--
-- Name: iot_inbound_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iot_inbound_events ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_activity_objectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_activity_objectives ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_activity_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_activity_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_assessment_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_assessment_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_assignment_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_assignment_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_assignment_question_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_assignment_question_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_challenge_conditions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_challenge_conditions ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_challenge_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_challenge_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_classroom_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_classroom_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_classroom_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_classroom_members ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_classrooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_classrooms ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_competencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_competencies ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_competency_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_competency_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_course_offerings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_course_offerings ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_courses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_courses ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_demonstration_annotations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_demonstration_annotations ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_demonstration_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_demonstration_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_experiment_artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_experiment_artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_experiment_comparisons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_experiment_comparisons ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_experiment_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_experiment_events ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_experiments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_experiments ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_lesson_prerequisites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_lesson_prerequisites ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_lesson_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_lesson_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_lessons ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_levels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_levels ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_objective_competencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_objective_competencies ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_objectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_objectives ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_program_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_program_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_question_version_objectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_question_version_objectives ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_question_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_question_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_quiz_attempt_grading; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_quiz_attempt_grading ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_reflections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_reflections ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_rubric_criteria; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_rubric_criteria ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_vla_action_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_vla_action_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_vla_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_vla_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION check_learning_question_objective(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_learning_question_objective() TO anon;
GRANT ALL ON FUNCTION public.check_learning_question_objective() TO authenticated;
GRANT ALL ON FUNCTION public.check_learning_question_objective() TO service_role;


--
-- Name: FUNCTION check_learning_question_scope(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_learning_question_scope() TO anon;
GRANT ALL ON FUNCTION public.check_learning_question_scope() TO authenticated;
GRANT ALL ON FUNCTION public.check_learning_question_scope() TO service_role;


--
-- Name: FUNCTION forbid_frozen_dataset_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.forbid_frozen_dataset_change() TO anon;
GRANT ALL ON FUNCTION public.forbid_frozen_dataset_change() TO authenticated;
GRANT ALL ON FUNCTION public.forbid_frozen_dataset_change() TO service_role;


--
-- Name: FUNCTION guard_learning_assignment_question(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_learning_assignment_question() TO anon;
GRANT ALL ON FUNCTION public.guard_learning_assignment_question() TO authenticated;
GRANT ALL ON FUNCTION public.guard_learning_assignment_question() TO service_role;


--
-- Name: FUNCTION guard_learning_question_objective(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_learning_question_objective() TO anon;
GRANT ALL ON FUNCTION public.guard_learning_question_objective() TO authenticated;
GRANT ALL ON FUNCTION public.guard_learning_question_objective() TO service_role;


--
-- Name: FUNCTION guard_learning_question_version(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_learning_question_version() TO anon;
GRANT ALL ON FUNCTION public.guard_learning_question_version() TO authenticated;
GRANT ALL ON FUNCTION public.guard_learning_question_version() TO service_role;


--
-- Name: FUNCTION guard_question_bank_quiz_grading(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_question_bank_quiz_grading() TO anon;
GRANT ALL ON FUNCTION public.guard_question_bank_quiz_grading() TO authenticated;
GRANT ALL ON FUNCTION public.guard_question_bank_quiz_grading() TO service_role;


--
-- Name: FUNCTION guard_question_bank_quiz_snapshot(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_question_bank_quiz_snapshot() TO anon;
GRANT ALL ON FUNCTION public.guard_question_bank_quiz_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.guard_question_bank_quiz_snapshot() TO service_role;


--
-- Name: FUNCTION handle_new_auth_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_auth_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO service_role;


--
-- Name: FUNCTION lock_learning_assignment_questions_on_attempt(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.lock_learning_assignment_questions_on_attempt() TO anon;
GRANT ALL ON FUNCTION public.lock_learning_assignment_questions_on_attempt() TO authenticated;
GRANT ALL ON FUNCTION public.lock_learning_assignment_questions_on_attempt() TO service_role;


--
-- Name: FUNCTION lock_learning_assignment_questions_on_delivery(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.lock_learning_assignment_questions_on_delivery() TO anon;
GRANT ALL ON FUNCTION public.lock_learning_assignment_questions_on_delivery() TO authenticated;
GRANT ALL ON FUNCTION public.lock_learning_assignment_questions_on_delivery() TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: TABLE _prisma_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._prisma_migrations TO anon;
GRANT ALL ON TABLE public._prisma_migrations TO authenticated;
GRANT ALL ON TABLE public._prisma_migrations TO service_role;


--
-- Name: TABLE ai_models; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_models TO anon;
GRANT ALL ON TABLE public.ai_models TO authenticated;
GRANT ALL ON TABLE public.ai_models TO service_role;


--
-- Name: TABLE api_keys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;


--
-- Name: TABLE app_installations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_installations TO anon;
GRANT ALL ON TABLE public.app_installations TO authenticated;
GRANT ALL ON TABLE public.app_installations TO service_role;


--
-- Name: TABLE arms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.arms TO anon;
GRANT ALL ON TABLE public.arms TO authenticated;
GRANT ALL ON TABLE public.arms TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE auth_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auth_tokens TO anon;
GRANT ALL ON TABLE public.auth_tokens TO authenticated;
GRANT ALL ON TABLE public.auth_tokens TO service_role;


--
-- Name: TABLE benchmark_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.benchmark_tasks TO anon;
GRANT ALL ON TABLE public.benchmark_tasks TO authenticated;
GRANT ALL ON TABLE public.benchmark_tasks TO service_role;


--
-- Name: TABLE calibration_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calibration_profiles TO anon;
GRANT ALL ON TABLE public.calibration_profiles TO authenticated;
GRANT ALL ON TABLE public.calibration_profiles TO service_role;


--
-- Name: TABLE control_modes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.control_modes TO anon;
GRANT ALL ON TABLE public.control_modes TO authenticated;
GRANT ALL ON TABLE public.control_modes TO service_role;


--
-- Name: TABLE control_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.control_sessions TO anon;
GRANT ALL ON TABLE public.control_sessions TO authenticated;
GRANT ALL ON TABLE public.control_sessions TO service_role;


--
-- Name: TABLE dataset_episodes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dataset_episodes TO anon;
GRANT ALL ON TABLE public.dataset_episodes TO authenticated;
GRANT ALL ON TABLE public.dataset_episodes TO service_role;


--
-- Name: TABLE dataset_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dataset_versions TO anon;
GRANT ALL ON TABLE public.dataset_versions TO authenticated;
GRANT ALL ON TABLE public.dataset_versions TO service_role;


--
-- Name: TABLE demo_bookings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.demo_bookings TO anon;
GRANT ALL ON TABLE public.demo_bookings TO authenticated;
GRANT ALL ON TABLE public.demo_bookings TO service_role;


--
-- Name: TABLE demonstration_episodes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.demonstration_episodes TO anon;
GRANT ALL ON TABLE public.demonstration_episodes TO authenticated;
GRANT ALL ON TABLE public.demonstration_episodes TO service_role;


--
-- Name: TABLE education_school_user_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.education_school_user_profiles TO anon;
GRANT ALL ON TABLE public.education_school_user_profiles TO authenticated;
GRANT ALL ON TABLE public.education_school_user_profiles TO service_role;


--
-- Name: TABLE evaluation_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.evaluation_runs TO anon;
GRANT ALL ON TABLE public.evaluation_runs TO authenticated;
GRANT ALL ON TABLE public.evaluation_runs TO service_role;


--
-- Name: TABLE iot_command_lifecycles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.iot_command_lifecycles TO service_role;


--
-- Name: TABLE iot_inbound_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.iot_inbound_events TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leads TO anon;
GRANT ALL ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;


--
-- Name: TABLE learning_activities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_activities TO anon;
GRANT ALL ON TABLE public.learning_activities TO authenticated;
GRANT ALL ON TABLE public.learning_activities TO service_role;


--
-- Name: TABLE learning_activity_objectives; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_activity_objectives TO anon;
GRANT ALL ON TABLE public.learning_activity_objectives TO authenticated;
GRANT ALL ON TABLE public.learning_activity_objectives TO service_role;


--
-- Name: TABLE learning_activity_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_activity_progress TO anon;
GRANT ALL ON TABLE public.learning_activity_progress TO authenticated;
GRANT ALL ON TABLE public.learning_activity_progress TO service_role;


--
-- Name: TABLE learning_assessment_scores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_assessment_scores TO anon;
GRANT ALL ON TABLE public.learning_assessment_scores TO authenticated;
GRANT ALL ON TABLE public.learning_assessment_scores TO service_role;


--
-- Name: TABLE learning_assessments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_assessments TO anon;
GRANT ALL ON TABLE public.learning_assessments TO authenticated;
GRANT ALL ON TABLE public.learning_assessments TO service_role;


--
-- Name: TABLE learning_assignment_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_assignment_attempts TO anon;
GRANT ALL ON TABLE public.learning_assignment_attempts TO authenticated;
GRANT ALL ON TABLE public.learning_assignment_attempts TO service_role;


--
-- Name: TABLE learning_assignment_question_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_assignment_question_versions TO anon;
GRANT ALL ON TABLE public.learning_assignment_question_versions TO authenticated;
GRANT ALL ON TABLE public.learning_assignment_question_versions TO service_role;


--
-- Name: TABLE learning_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_assignments TO anon;
GRANT ALL ON TABLE public.learning_assignments TO authenticated;
GRANT ALL ON TABLE public.learning_assignments TO service_role;


--
-- Name: TABLE learning_challenge_conditions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_challenge_conditions TO anon;
GRANT ALL ON TABLE public.learning_challenge_conditions TO authenticated;
GRANT ALL ON TABLE public.learning_challenge_conditions TO service_role;


--
-- Name: TABLE learning_challenge_objects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_challenge_objects TO anon;
GRANT ALL ON TABLE public.learning_challenge_objects TO authenticated;
GRANT ALL ON TABLE public.learning_challenge_objects TO service_role;


--
-- Name: TABLE learning_challenges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_challenges TO anon;
GRANT ALL ON TABLE public.learning_challenges TO authenticated;
GRANT ALL ON TABLE public.learning_challenges TO service_role;


--
-- Name: TABLE learning_classroom_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_classroom_assignments TO anon;
GRANT ALL ON TABLE public.learning_classroom_assignments TO authenticated;
GRANT ALL ON TABLE public.learning_classroom_assignments TO service_role;


--
-- Name: TABLE learning_classroom_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_classroom_members TO anon;
GRANT ALL ON TABLE public.learning_classroom_members TO authenticated;
GRANT ALL ON TABLE public.learning_classroom_members TO service_role;


--
-- Name: TABLE learning_classroom_robot_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_classroom_robot_allocations TO anon;
GRANT ALL ON TABLE public.learning_classroom_robot_allocations TO authenticated;
GRANT ALL ON TABLE public.learning_classroom_robot_allocations TO service_role;


--
-- Name: TABLE learning_classrooms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_classrooms TO anon;
GRANT ALL ON TABLE public.learning_classrooms TO authenticated;
GRANT ALL ON TABLE public.learning_classrooms TO service_role;


--
-- Name: TABLE learning_competencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_competencies TO anon;
GRANT ALL ON TABLE public.learning_competencies TO authenticated;
GRANT ALL ON TABLE public.learning_competencies TO service_role;


--
-- Name: TABLE learning_competency_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_competency_progress TO anon;
GRANT ALL ON TABLE public.learning_competency_progress TO authenticated;
GRANT ALL ON TABLE public.learning_competency_progress TO service_role;


--
-- Name: TABLE learning_course_offerings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_course_offerings TO anon;
GRANT ALL ON TABLE public.learning_course_offerings TO authenticated;
GRANT ALL ON TABLE public.learning_course_offerings TO service_role;


--
-- Name: TABLE learning_courses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_courses TO anon;
GRANT ALL ON TABLE public.learning_courses TO authenticated;
GRANT ALL ON TABLE public.learning_courses TO service_role;


--
-- Name: TABLE learning_demonstration_annotations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_demonstration_annotations TO anon;
GRANT ALL ON TABLE public.learning_demonstration_annotations TO authenticated;
GRANT ALL ON TABLE public.learning_demonstration_annotations TO service_role;


--
-- Name: TABLE learning_demonstration_segments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_demonstration_segments TO anon;
GRANT ALL ON TABLE public.learning_demonstration_segments TO authenticated;
GRANT ALL ON TABLE public.learning_demonstration_segments TO service_role;


--
-- Name: TABLE learning_enrollments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_enrollments TO anon;
GRANT ALL ON TABLE public.learning_enrollments TO authenticated;
GRANT ALL ON TABLE public.learning_enrollments TO service_role;


--
-- Name: TABLE learning_experiment_artifacts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_experiment_artifacts TO anon;
GRANT ALL ON TABLE public.learning_experiment_artifacts TO authenticated;
GRANT ALL ON TABLE public.learning_experiment_artifacts TO service_role;


--
-- Name: TABLE learning_experiment_comparisons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_experiment_comparisons TO anon;
GRANT ALL ON TABLE public.learning_experiment_comparisons TO authenticated;
GRANT ALL ON TABLE public.learning_experiment_comparisons TO service_role;


--
-- Name: TABLE learning_experiment_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_experiment_events TO anon;
GRANT ALL ON TABLE public.learning_experiment_events TO authenticated;
GRANT ALL ON TABLE public.learning_experiment_events TO service_role;


--
-- Name: SEQUENCE learning_experiment_events_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.learning_experiment_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.learning_experiment_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.learning_experiment_events_id_seq TO service_role;


--
-- Name: TABLE learning_experiments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_experiments TO anon;
GRANT ALL ON TABLE public.learning_experiments TO authenticated;
GRANT ALL ON TABLE public.learning_experiments TO service_role;


--
-- Name: TABLE learning_feedback; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_feedback TO anon;
GRANT ALL ON TABLE public.learning_feedback TO authenticated;
GRANT ALL ON TABLE public.learning_feedback TO service_role;


--
-- Name: TABLE learning_lesson_prerequisites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_lesson_prerequisites TO anon;
GRANT ALL ON TABLE public.learning_lesson_prerequisites TO authenticated;
GRANT ALL ON TABLE public.learning_lesson_prerequisites TO service_role;


--
-- Name: TABLE learning_lesson_progress; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_lesson_progress TO anon;
GRANT ALL ON TABLE public.learning_lesson_progress TO authenticated;
GRANT ALL ON TABLE public.learning_lesson_progress TO service_role;


--
-- Name: TABLE learning_lessons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_lessons TO anon;
GRANT ALL ON TABLE public.learning_lessons TO authenticated;
GRANT ALL ON TABLE public.learning_lessons TO service_role;


--
-- Name: TABLE learning_levels; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_levels TO anon;
GRANT ALL ON TABLE public.learning_levels TO authenticated;
GRANT ALL ON TABLE public.learning_levels TO service_role;


--
-- Name: TABLE learning_objective_competencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_objective_competencies TO anon;
GRANT ALL ON TABLE public.learning_objective_competencies TO authenticated;
GRANT ALL ON TABLE public.learning_objective_competencies TO service_role;


--
-- Name: TABLE learning_objectives; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_objectives TO anon;
GRANT ALL ON TABLE public.learning_objectives TO authenticated;
GRANT ALL ON TABLE public.learning_objectives TO service_role;


--
-- Name: TABLE learning_program_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_program_versions TO anon;
GRANT ALL ON TABLE public.learning_program_versions TO authenticated;
GRANT ALL ON TABLE public.learning_program_versions TO service_role;


--
-- Name: TABLE learning_programs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_programs TO anon;
GRANT ALL ON TABLE public.learning_programs TO authenticated;
GRANT ALL ON TABLE public.learning_programs TO service_role;


--
-- Name: TABLE learning_question_version_objectives; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_question_version_objectives TO anon;
GRANT ALL ON TABLE public.learning_question_version_objectives TO authenticated;
GRANT ALL ON TABLE public.learning_question_version_objectives TO service_role;


--
-- Name: TABLE learning_question_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_question_versions TO anon;
GRANT ALL ON TABLE public.learning_question_versions TO authenticated;
GRANT ALL ON TABLE public.learning_question_versions TO service_role;


--
-- Name: TABLE learning_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_questions TO anon;
GRANT ALL ON TABLE public.learning_questions TO authenticated;
GRANT ALL ON TABLE public.learning_questions TO service_role;


--
-- Name: TABLE learning_quiz_attempt_grading; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_quiz_attempt_grading TO service_role;


--
-- Name: TABLE learning_reflections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_reflections TO anon;
GRANT ALL ON TABLE public.learning_reflections TO authenticated;
GRANT ALL ON TABLE public.learning_reflections TO service_role;


--
-- Name: TABLE learning_rubric_criteria; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_rubric_criteria TO anon;
GRANT ALL ON TABLE public.learning_rubric_criteria TO authenticated;
GRANT ALL ON TABLE public.learning_rubric_criteria TO service_role;


--
-- Name: TABLE learning_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_sections TO anon;
GRANT ALL ON TABLE public.learning_sections TO authenticated;
GRANT ALL ON TABLE public.learning_sections TO service_role;


--
-- Name: TABLE learning_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_submissions TO anon;
GRANT ALL ON TABLE public.learning_submissions TO authenticated;
GRANT ALL ON TABLE public.learning_submissions TO service_role;


--
-- Name: TABLE learning_symbolic_evaluations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_symbolic_evaluations TO anon;
GRANT ALL ON TABLE public.learning_symbolic_evaluations TO authenticated;
GRANT ALL ON TABLE public.learning_symbolic_evaluations TO service_role;


--
-- Name: TABLE learning_vla_action_steps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_vla_action_steps TO anon;
GRANT ALL ON TABLE public.learning_vla_action_steps TO authenticated;
GRANT ALL ON TABLE public.learning_vla_action_steps TO service_role;


--
-- Name: TABLE learning_vla_interactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_vla_interactions TO anon;
GRANT ALL ON TABLE public.learning_vla_interactions TO authenticated;
GRANT ALL ON TABLE public.learning_vla_interactions TO service_role;


--
-- Name: TABLE licenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.licenses TO anon;
GRANT ALL ON TABLE public.licenses TO authenticated;
GRANT ALL ON TABLE public.licenses TO service_role;


--
-- Name: TABLE memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.memberships TO anon;
GRANT ALL ON TABLE public.memberships TO authenticated;
GRANT ALL ON TABLE public.memberships TO service_role;


--
-- Name: TABLE model_checkpoints; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.model_checkpoints TO anon;
GRANT ALL ON TABLE public.model_checkpoints TO authenticated;
GRANT ALL ON TABLE public.model_checkpoints TO service_role;


--
-- Name: TABLE observation_configurations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.observation_configurations TO anon;
GRANT ALL ON TABLE public.observation_configurations TO authenticated;
GRANT ALL ON TABLE public.observation_configurations TO service_role;


--
-- Name: TABLE org_entitlements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.org_entitlements TO anon;
GRANT ALL ON TABLE public.org_entitlements TO authenticated;
GRANT ALL ON TABLE public.org_entitlements TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.organizations TO anon;
GRANT ALL ON TABLE public.organizations TO authenticated;
GRANT ALL ON TABLE public.organizations TO service_role;


--
-- Name: TABLE permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.permissions TO anon;
GRANT ALL ON TABLE public.permissions TO authenticated;
GRANT ALL ON TABLE public.permissions TO service_role;


--
-- Name: TABLE port_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.port_assignments TO anon;
GRANT ALL ON TABLE public.port_assignments TO authenticated;
GRANT ALL ON TABLE public.port_assignments TO service_role;


--
-- Name: TABLE readiness_check_calibrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.readiness_check_calibrations TO anon;
GRANT ALL ON TABLE public.readiness_check_calibrations TO authenticated;
GRANT ALL ON TABLE public.readiness_check_calibrations TO service_role;


--
-- Name: TABLE readiness_checks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.readiness_checks TO anon;
GRANT ALL ON TABLE public.readiness_checks TO authenticated;
GRANT ALL ON TABLE public.readiness_checks TO service_role;


--
-- Name: TABLE robots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.robots TO anon;
GRANT ALL ON TABLE public.robots TO authenticated;
GRANT ALL ON TABLE public.robots TO service_role;


--
-- Name: TABLE role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_permissions TO anon;
GRANT ALL ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO service_role;


--
-- Name: TABLE roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roles TO anon;
GRANT ALL ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.roles TO service_role;


--
-- Name: TABLE safety_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.safety_events TO anon;
GRANT ALL ON TABLE public.safety_events TO authenticated;
GRANT ALL ON TABLE public.safety_events TO service_role;


--
-- Name: TABLE safety_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.safety_profiles TO anon;
GRANT ALL ON TABLE public.safety_profiles TO authenticated;
GRANT ALL ON TABLE public.safety_profiles TO service_role;


--
-- Name: TABLE session_arms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_arms TO anon;
GRANT ALL ON TABLE public.session_arms TO authenticated;
GRANT ALL ON TABLE public.session_arms TO service_role;


--
-- Name: TABLE simulation_scenarios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.simulation_scenarios TO anon;
GRANT ALL ON TABLE public.simulation_scenarios TO authenticated;
GRANT ALL ON TABLE public.simulation_scenarios TO service_role;


--
-- Name: TABLE training_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.training_runs TO anon;
GRANT ALL ON TABLE public.training_runs TO authenticated;
GRANT ALL ON TABLE public.training_runs TO service_role;


--
-- Name: TABLE user_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_assignments TO anon;
GRANT ALL ON TABLE public.user_assignments TO authenticated;
GRANT ALL ON TABLE public.user_assignments TO service_role;


--
-- Name: TABLE user_system_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_system_roles TO anon;
GRANT ALL ON TABLE public.user_system_roles TO authenticated;
GRANT ALL ON TABLE public.user_system_roles TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE vista_schema_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vista_schema_migrations TO anon;
GRANT ALL ON TABLE public.vista_schema_migrations TO authenticated;
GRANT ALL ON TABLE public.vista_schema_migrations TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict IrOmjXPTZ5sjayul8PfZ7seWeuYU6RkPFkJIKL80bpt3JmdCRKOmvAA2081uLzh

