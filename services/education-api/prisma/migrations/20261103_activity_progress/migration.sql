-- Only self-confirmed activities need new rows. Graded activity completion is
-- derived from existing persisted assessment and experiment evidence.
CREATE TABLE public.learning_activity_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.learning_lessons(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status = 'completed'),
  completion_method text NOT NULL DEFAULT 'self_report' CHECK (completion_method = 'self_report'),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_activity_progress_activity_slot_check CHECK (
    activity_id IN (
      lesson_id::text || '-reading-1',
      lesson_id::text || '-reading-2',
      lesson_id::text || '-demonstration'
    )
  ),
  CONSTRAINT learning_activity_progress_learner_activity_key UNIQUE (learner_user_id, activity_id)
);

CREATE INDEX learning_activity_progress_lesson_id_idx ON public.learning_activity_progress(lesson_id);
CREATE INDEX learning_activity_progress_learner_user_id_idx ON public.learning_activity_progress(learner_user_id);
ALTER TABLE public.learning_activity_progress ENABLE ROW LEVEL SECURITY;
