ALTER TABLE public.iot_command_lifecycles
  DROP CONSTRAINT iot_command_lifecycles_state_check,
  ADD CONSTRAINT iot_command_lifecycles_state_check
  CHECK (state IN ('pending_publish','publishing','queued','acknowledged','executing','completed','failed','timed_out','publish_failed','reconciliation_required'));

ALTER TABLE public.iot_command_lifecycles
  ADD COLUMN command_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN publish_owner text,
  ADD COLUMN publish_lease_until timestamptz,
  ADD COLUMN publish_started_at timestamptz,
  ADD COLUMN publish_error text;
