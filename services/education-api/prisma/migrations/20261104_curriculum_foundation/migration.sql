-- Additive curriculum definitions. Existing Course 1 activity IDs remain valid.
BEGIN;
CREATE TABLE public.learning_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE RESTRICT,
  title text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_sections_lesson_id_ordinal_key UNIQUE (lesson_id, ordinal) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX learning_sections_lesson_id_status_ordinal_idx ON public.learning_sections(lesson_id, status, ordinal);
ALTER TABLE public.learning_sections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.learning_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.learning_sections(id) ON DELETE RESTRICT,
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('reading','video','demonstration','guided_practice','knowledge_check','simulation','challenge','physical_lab','result','reflection')),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  required boolean NOT NULL DEFAULT true,
  content_ref jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content_ref) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_activities_section_id_ordinal_key UNIQUE (section_id, ordinal) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX learning_activities_section_id_status_ordinal_idx ON public.learning_activities(section_id, status, ordinal);
ALTER TABLE public.learning_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.learning_activity_objectives (
  activity_id uuid NOT NULL REFERENCES public.learning_activities(id) ON DELETE CASCADE,
  objective_id uuid NOT NULL REFERENCES public.learning_objectives(id) ON DELETE RESTRICT,
  PRIMARY KEY (activity_id, objective_id)
);
CREATE INDEX learning_activity_objectives_objective_id_idx ON public.learning_activity_objectives(objective_id);
ALTER TABLE public.learning_activity_objectives ENABLE ROW LEVEL SECURITY;

-- Preserve legacy Course 1 progress while allowing stable UUID activity IDs.
ALTER TABLE public.learning_activity_progress
  ADD COLUMN activity_definition_id uuid REFERENCES public.learning_activities(id) ON DELETE RESTRICT;
CREATE INDEX learning_activity_progress_activity_definition_id_idx
  ON public.learning_activity_progress(activity_definition_id);
ALTER TABLE public.learning_activity_progress
  DROP CONSTRAINT learning_activity_progress_activity_slot_check;
ALTER TABLE public.learning_activity_progress
  ADD CONSTRAINT learning_activity_progress_activity_slot_check CHECK (
    (activity_definition_id IS NULL AND activity_id IN (
      lesson_id::text || '-reading-1',
      lesson_id::text || '-reading-2',
      lesson_id::text || '-demonstration'
    )) OR (activity_definition_id IS NOT NULL AND activity_id = activity_definition_id::text)
  );
COMMIT;
