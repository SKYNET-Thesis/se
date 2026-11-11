-- Store validated, type-specific authored activity content alongside its canonical activity.
-- The SQL release runner wraps this file in its own transaction.
ALTER TABLE public.learning_activities
  ADD COLUMN content jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(content) = 'object');
