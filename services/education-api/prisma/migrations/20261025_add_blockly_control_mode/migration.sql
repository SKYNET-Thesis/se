ALTER TABLE public.control_modes
  DROP CONSTRAINT control_modes_code_check,
  ADD CONSTRAINT control_modes_code_check
    CHECK (code = ANY (ARRAY['manual'::text, 'ai'::text, 'vr'::text, 'remote'::text, 'blockly'::text]));
