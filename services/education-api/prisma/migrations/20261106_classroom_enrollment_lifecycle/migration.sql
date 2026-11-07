-- A learner may continue the same global course through a second classroom.
-- Keep one reusable enrollment row per course/student/classroom so revocation and
-- rejoin are soft, idempotent updates rather than destructive history changes.
BEGIN;

ALTER TABLE public.learning_enrollments
  DROP CONSTRAINT IF EXISTS learning_enrollments_course_id_learner_user_id_key;

ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_course_id_learner_user_id_classroom_id_key
  UNIQUE (course_id, learner_user_id, classroom_id);

ALTER TABLE public.learning_enrollments
  DROP CONSTRAINT IF EXISTS learning_enrollments_status_check;

ALTER TABLE public.learning_enrollments
  ADD CONSTRAINT learning_enrollments_status_check
  CHECK (status IN ('active', 'completed', 'revoked'));

CREATE INDEX IF NOT EXISTS idx_learning_enrollments_active_classroom
  ON public.learning_enrollments(classroom_id, learner_user_id)
  WHERE status = 'active';

COMMIT;
