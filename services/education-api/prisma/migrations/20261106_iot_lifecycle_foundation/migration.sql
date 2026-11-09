-- Foundation required by 20261106_iot_publish_intent and the IoT feedback worker.
-- This is additive and intentionally does not record historical migration state.
BEGIN;

CREATE TABLE IF NOT EXISTS public.iot_command_lifecycles (
  command_id uuid PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES public.learning_experiments(id) ON DELETE RESTRICT,
  control_session_id uuid NOT NULL REFERENCES public.control_sessions(id) ON DELETE RESTRICT,
  robot_id uuid NOT NULL REFERENCES public.robots(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('queued','acknowledged','executing','completed','failed','timed_out')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  error_code text,
  last_sequence bigint NOT NULL DEFAULT -1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iot_command_lifecycles_expiry_check CHECK (expires_at > issued_at)
);
CREATE INDEX IF NOT EXISTS iot_command_lifecycles_robot_state_idx ON public.iot_command_lifecycles(robot_id, state);
CREATE INDEX IF NOT EXISTS iot_command_lifecycles_experiment_idx ON public.iot_command_lifecycles(experiment_id);

CREATE TABLE IF NOT EXISTS public.iot_inbound_events (
  event_id text PRIMARY KEY,
  command_id uuid REFERENCES public.iot_command_lifecycles(command_id) ON DELETE SET NULL,
  robot_id uuid NOT NULL REFERENCES public.robots(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('ack','status')),
  sequence bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iot_inbound_events_command_received_idx ON public.iot_inbound_events(command_id, received_at);
CREATE INDEX IF NOT EXISTS iot_inbound_events_robot_received_idx ON public.iot_inbound_events(robot_id, received_at);

COMMIT;
