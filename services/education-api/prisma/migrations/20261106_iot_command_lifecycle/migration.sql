CREATE TABLE public.iot_command_lifecycles (
  command_id text PRIMARY KEY, experiment_id uuid NOT NULL REFERENCES public.learning_experiments(id) ON DELETE CASCADE,
  control_session_id uuid NOT NULL REFERENCES public.control_sessions(id), robot_id uuid NOT NULL REFERENCES public.robots(id),
  state text NOT NULL CHECK (state IN ('queued','acknowledged','executing','completed','failed','timed_out')),
  issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, last_sequence bigint NOT NULL DEFAULT -1,
  acknowledged_at timestamptz, completed_at timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX iot_command_lifecycles_experiment_idx ON public.iot_command_lifecycles(experiment_id);
CREATE TABLE public.iot_inbound_events (
  event_id text PRIMARY KEY, command_id text, robot_id text NOT NULL, kind text NOT NULL,
  sequence bigint NOT NULL, occurred_at timestamptz NOT NULL, payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX iot_inbound_events_command_idx ON public.iot_inbound_events(command_id, sequence);
