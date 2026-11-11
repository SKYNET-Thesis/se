-- Review-only SQL release migration for secure, course-scoped Learning Media.
-- Activity content is owned by 20261110_activity_content.sql.

CREATE TABLE public.learning_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_media_assets_filename_length CHECK (char_length(original_filename) BETWEEN 1 AND 240),
  CONSTRAINT learning_media_assets_mime_type CHECK (mime_type IN (
    'video/mp4','video/webm','video/quicktime','application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png','image/jpeg','image/webp'
  )),
  CONSTRAINT learning_media_assets_size_bytes CHECK (size_bytes BETWEEN 1 AND 262144000),
  CONSTRAINT learning_media_assets_status CHECK (status IN ('pending','ready','failed')),
  CONSTRAINT learning_media_assets_object_scope CHECK (object_key LIKE ('learning-media/courses/' || course_id::text || '/%'))
);

CREATE INDEX learning_media_assets_course_ready_created_idx
  ON public.learning_media_assets(course_id,created_at DESC);
CREATE INDEX learning_media_assets_status_created_idx
  ON public.learning_media_assets(status,created_at);
ALTER TABLE public.learning_media_assets ENABLE ROW LEVEL SECURITY;
