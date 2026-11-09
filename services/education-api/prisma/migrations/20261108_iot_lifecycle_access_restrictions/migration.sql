-- The IoT lifecycle tables are backend-owned. Supabase default grants expose
-- new public tables to client roles unless access is explicitly restricted.
BEGIN;

ALTER TABLE public.iot_command_lifecycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iot_inbound_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.iot_command_lifecycles FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.iot_inbound_events FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.iot_command_lifecycles FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public.iot_inbound_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE public.iot_command_lifecycles FROM authenticated;
    REVOKE ALL PRIVILEGES ON TABLE public.iot_inbound_events FROM authenticated;
  END IF;
END
$$;

COMMIT;
