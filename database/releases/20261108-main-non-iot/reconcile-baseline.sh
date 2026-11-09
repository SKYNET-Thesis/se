#!/usr/bin/env bash
set -euo pipefail
: "${VISTA_RECONCILE_DATABASE_URL:?Set an isolated staging database URL}"
mode=${1:-reconcile}
if [[ "$mode" != reconcile && "$mode" != --verify-only ]]; then printf 'usage: %s [--verify-only]\n' "$0" >&2; exit 2; fi
python3 - <<'PY'
import os
import sys
from urllib.parse import urlsplit

try:
    target = urlsplit(os.environ["VISTA_RECONCILE_DATABASE_URL"])
    allowed = (
        target.scheme in ("postgres", "postgresql")
        and target.hostname in ("localhost", "127.0.0.1")
        and target.port == 55422
        and target.path == "/postgres"
    )
except ValueError:
    allowed = False

if not allowed:
    print("Refusing to run: reconciliation is restricted to isolated localhost:55422/postgres staging.", file=sys.stderr)
    sys.exit(64)
PY
root=$(cd "$(dirname "$0")/../../.." && pwd -P)
declare -a versions=(20261104_curriculum_foundation 20261105_question_bank_foundation 20261106_question_bank_quiz_attempt 20261106_classroom_enrollment_lifecycle)
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
cat >"$tmp" <<'SQL'
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('vista:20261108-main-non-iot:baseline'));
CREATE TEMP TABLE _expected_columns(table_name text, column_name text, type_name text, not_null boolean) ON COMMIT DROP;
INSERT INTO _expected_columns VALUES
('learning_sections','id','uuid',true),('learning_sections','lesson_id','uuid',true),('learning_sections','title','text',true),('learning_sections','ordinal','integer',true),('learning_sections','status','text',true),('learning_sections','created_at','timestamp with time zone',true),('learning_sections','updated_at','timestamp with time zone',true),
('learning_activities','id','uuid',true),('learning_activities','section_id','uuid',true),('learning_activities','title','text',true),('learning_activities','type','text',true),('learning_activities','ordinal','integer',true),('learning_activities','required','boolean',true),('learning_activities','content_ref','jsonb',true),('learning_activities','status','text',true),('learning_activities','created_at','timestamp with time zone',true),('learning_activities','updated_at','timestamp with time zone',true),
('learning_activity_objectives','activity_id','uuid',true),('learning_activity_objectives','objective_id','uuid',true),
('learning_activity_progress','activity_definition_id','uuid',false),
('learning_questions','id','uuid',true),('learning_questions','organization_id','uuid',true),('learning_questions','code','text',true),('learning_questions','course_id','uuid',true),('learning_questions','lesson_id','uuid',true),('learning_questions','domain','text',false),('learning_questions','created_by','uuid',true),('learning_questions','created_at','timestamp with time zone',true),('learning_questions','updated_at','timestamp with time zone',true),
('learning_question_versions','id','uuid',true),('learning_question_versions','question_id','uuid',true),('learning_question_versions','version_number','integer',true),('learning_question_versions','type','text',true),('learning_question_versions','difficulty','text',true),('learning_question_versions','cognitive_level','text',true),('learning_question_versions','stem','text',true),('learning_question_versions','options','jsonb',true),('learning_question_versions','answer_key','jsonb',true),('learning_question_versions','explanation','text',false),('learning_question_versions','source_reference','text',false),('learning_question_versions','status','text',true),('learning_question_versions','authored_by','uuid',true),('learning_question_versions','reviewed_by','uuid',false),('learning_question_versions','published_by','uuid',false),('learning_question_versions','created_at','timestamp with time zone',true),('learning_question_versions','updated_at','timestamp with time zone',true),
('learning_question_version_objectives','question_version_id','uuid',true),('learning_question_version_objectives','objective_id','uuid',true),
('learning_assignment_question_versions','assignment_id','uuid',true),('learning_assignment_question_versions','question_id','uuid',true),('learning_assignment_question_versions','question_version_id','uuid',true),('learning_assignment_question_versions','ordinal','integer',true),('learning_assignment_question_versions','points','numeric(7,2)',true),
('learning_quiz_attempt_grading','attempt_id','uuid',true),('learning_quiz_attempt_grading','grading_snapshot','jsonb',true),('learning_quiz_attempt_grading','created_at','timestamp with time zone',true);
DO $$ DECLARE r record; actual_type text; actual_nn boolean; BEGIN
 FOR r IN SELECT * FROM _expected_columns LOOP
  SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull INTO actual_type,actual_nn FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=r.table_name AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped;
  IF NOT FOUND OR actual_type IS DISTINCT FROM r.type_name OR actual_nn IS DISTINCT FROM r.not_null THEN RAISE EXCEPTION 'structural column mismatch %.%: expected type %, not-null %; found %, %',r.table_name,r.column_name,r.type_name,r.not_null,actual_type,actual_nn; END IF;
 END LOOP;
END $$;
CREATE TEMP TABLE _expected_constraints(table_name text, constraint_name text, kind "char", definition text) ON COMMIT DROP;
INSERT INTO _expected_constraints VALUES
('learning_sections','learning_sections_pkey','p','PRIMARY KEY (id)'),('learning_sections','learning_sections_lesson_id_fkey','f','FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE RESTRICT'),('learning_sections','learning_sections_lesson_id_ordinal_key','u','UNIQUE (lesson_id, ordinal)'),('learning_sections','learning_sections_ordinal_check','c','CHECK ((ordinal > 0))'),('learning_sections','learning_sections_status_check','c','CHECK ((status = ANY (ARRAY[''draft''::text, ''published''::text])))'),
('learning_activities','learning_activities_pkey','p','PRIMARY KEY (id)'),('learning_activities','learning_activities_section_id_fkey','f','FOREIGN KEY (section_id) REFERENCES learning_sections(id) ON DELETE RESTRICT'),('learning_activities','learning_activities_section_id_ordinal_key','u','UNIQUE (section_id, ordinal)'),('learning_activities','learning_activities_ordinal_check','c','CHECK ((ordinal > 0))'),('learning_activities','learning_activities_type_check','c','CHECK ((type = ANY (ARRAY[''reading''::text, ''video''::text, ''demonstration''::text, ''guided_practice''::text, ''knowledge_check''::text, ''simulation''::text, ''challenge''::text, ''physical_lab''::text, ''result''::text, ''reflection''::text])))'),('learning_activities','learning_activities_content_ref_check','c','CHECK ((jsonb_typeof(content_ref) = ''object''::text))'),('learning_activities','learning_activities_status_check','c','CHECK ((status = ANY (ARRAY[''draft''::text, ''published''::text])))'),
('learning_activity_objectives','learning_activity_objectives_pkey','p','PRIMARY KEY (activity_id, objective_id)'),('learning_activity_objectives','learning_activity_objectives_activity_id_fkey','f','FOREIGN KEY (activity_id) REFERENCES learning_activities(id) ON DELETE CASCADE'),('learning_activity_objectives','learning_activity_objectives_objective_id_fkey','f','FOREIGN KEY (objective_id) REFERENCES learning_objectives(id) ON DELETE RESTRICT'),
('learning_activity_progress','learning_activity_progress_activity_definition_id_fkey','f','FOREIGN KEY (activity_definition_id) REFERENCES learning_activities(id) ON DELETE RESTRICT'),('learning_activity_progress','learning_activity_progress_activity_slot_check','c','CHECK (((activity_definition_id IS NULL) AND (activity_id = ANY (ARRAY[((lesson_id)::text || ''-reading-1''::text), ((lesson_id)::text || ''-reading-2''::text), ((lesson_id)::text || ''-demonstration''::text)]))) OR ((activity_definition_id IS NOT NULL) AND (activity_id = ((activity_definition_id)::text))))'),
('learning_questions','learning_questions_pkey','p','PRIMARY KEY (id)'),('learning_questions','learning_questions_organization_id_fkey','f','FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT'),('learning_questions','learning_questions_course_id_fkey','f','FOREIGN KEY (course_id) REFERENCES learning_courses(id) ON DELETE RESTRICT'),('learning_questions','learning_questions_lesson_id_fkey','f','FOREIGN KEY (lesson_id) REFERENCES learning_lessons(id) ON DELETE RESTRICT'),('learning_questions','learning_questions_created_by_fkey','f','FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT'),('learning_questions','learning_questions_organization_id_code_key','u','UNIQUE (organization_id, code)'),('learning_questions','learning_questions_code_check','c','CHECK (((length(btrim(code)) >= 1) AND (length(btrim(code)) <= 80)))'),
('learning_question_versions','learning_question_versions_pkey','p','PRIMARY KEY (id)'),('learning_question_versions','learning_question_versions_question_id_fkey','f','FOREIGN KEY (question_id) REFERENCES learning_questions(id) ON DELETE RESTRICT'),('learning_question_versions','learning_question_versions_authored_by_fkey','f','FOREIGN KEY (authored_by) REFERENCES users(id) ON DELETE RESTRICT'),('learning_question_versions','learning_question_versions_reviewed_by_fkey','f','FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE RESTRICT'),('learning_question_versions','learning_question_versions_published_by_fkey','f','FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT'),('learning_question_versions','learning_question_versions_question_id_version_number_key','u','UNIQUE (question_id, version_number)'),('learning_question_versions','learning_question_versions_version_number_check','c','CHECK ((version_number > 0))'),('learning_question_versions','learning_question_versions_type_check','c','CHECK ((type = ANY (ARRAY[''single_choice''::text, ''multiple_choice''::text, ''true_false''::text])))'),('learning_question_versions','learning_question_versions_difficulty_check','c','CHECK ((difficulty = ANY (ARRAY[''easy''::text, ''medium''::text, ''hard''::text])))'),('learning_question_versions','learning_question_versions_cognitive_level_check','c','CHECK ((cognitive_level = ANY (ARRAY[''remember''::text, ''understand''::text, ''apply''::text, ''analyze''::text, ''evaluate''::text, ''create''::text])))'),('learning_question_versions','learning_question_versions_stem_check','c','CHECK ((length(btrim(stem)) > 0))'),('learning_question_versions','learning_question_versions_options_check','c','CHECK ((jsonb_typeof(options) = ''array''::text))'),('learning_question_versions','learning_question_versions_answer_key_check','c','CHECK ((jsonb_typeof(answer_key) = ''array''::text))'),('learning_question_versions','learning_question_versions_status_check','c','CHECK ((status = ANY (ARRAY[''draft''::text, ''in_review''::text, ''published''::text, ''archived''::text])))'),
('learning_question_version_objectives','learning_question_version_objectives_pkey','p','PRIMARY KEY (question_version_id, objective_id)'),('learning_question_version_objectives','learning_question_version_objectives_question_version_id_fkey','f','FOREIGN KEY (question_version_id) REFERENCES learning_question_versions(id) ON DELETE RESTRICT'),('learning_question_version_objectives','learning_question_version_objectives_objective_id_fkey','f','FOREIGN KEY (objective_id) REFERENCES learning_objectives(id) ON DELETE RESTRICT'),
('learning_assignment_question_versions','learning_assignment_question_versions_pkey','p','PRIMARY KEY (assignment_id, question_version_id)'),('learning_assignment_question_versions','learning_assignment_question_versions_assignment_id_fkey','f','FOREIGN KEY (assignment_id) REFERENCES learning_assignments(id) ON DELETE RESTRICT'),('learning_assignment_question_versions','learning_assignment_question_versions_question_id_fkey','f','FOREIGN KEY (question_id) REFERENCES learning_questions(id) ON DELETE RESTRICT'),('learning_assignment_question_versions','learning_assignment_question_versions_question_version_id_fkey','f','FOREIGN KEY (question_version_id) REFERENCES learning_question_versions(id) ON DELETE RESTRICT'),('learning_assignment_question_versions','learning_assignment_question_identity_key','u','UNIQUE (assignment_id, question_id)'),('learning_assignment_question_versions','learning_assignment_question_versions_assignment_id_ordinal_key','u','UNIQUE (assignment_id, ordinal)'),('learning_assignment_question_versions','learning_assignment_question_versions_ordinal_check','c','CHECK ((ordinal > 0))'),('learning_assignment_question_versions','learning_assignment_question_versions_points_check','c','CHECK ((points > (0)::numeric))'),
('learning_quiz_attempt_grading','learning_quiz_attempt_grading_pkey','p','PRIMARY KEY (attempt_id)'),('learning_quiz_attempt_grading','learning_quiz_attempt_grading_attempt_id_fkey','f','FOREIGN KEY (attempt_id) REFERENCES learning_assignment_attempts(id) ON DELETE RESTRICT'),('learning_quiz_attempt_grading','learning_quiz_attempt_grading_grading_snapshot_check','c','CHECK ((jsonb_typeof(grading_snapshot) = ''object''::text))'),
('learning_enrollments','learning_enrollments_course_id_learner_user_id_classroom_id_key','u','UNIQUE (course_id, learner_user_id, classroom_id)'),('learning_enrollments','learning_enrollments_status_check','c','CHECK ((status = ANY (ARRAY[''active''::text, ''completed''::text, ''revoked''::text])))');
DO $$ DECLARE r record; got text; normalized text; expected text; alternative text; BEGIN
 FOR r IN SELECT * FROM _expected_constraints LOOP
  SELECT pg_get_constraintdef(x.oid) INTO got FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=r.table_name AND x.conname=r.constraint_name AND x.contype=r.kind;
  normalized := regexp_replace(got,'[[:space:]]','','g');
  expected := regexp_replace(r.definition,'[[:space:]]','','g');
  IF r.table_name='learning_activity_progress' AND r.constraint_name='learning_activity_progress_activity_slot_check' THEN
   alternative := $alt$CHECK ((((activity_definition_id IS NULL) AND (((activity_id = ((lesson_id)::text || '-reading-1'::text)) OR (activity_id = ((lesson_id)::text || '-reading-2'::text))) OR (activity_id = ((lesson_id)::text || '-demonstration'::text)))) OR ((activity_definition_id IS NOT NULL) AND (activity_id = (activity_definition_id)::text))))$alt$;
   alternative := regexp_replace(alternative,'[[:space:]]','','g');
   IF NOT FOUND OR (normalized NOT LIKE '%'||expected||'%' AND normalized IS DISTINCT FROM alternative) THEN RAISE EXCEPTION 'structural constraint mismatch %.%: expected ANY or equivalent OR representation, found %',r.table_name,r.constraint_name,got; END IF;
  ELSIF NOT FOUND OR normalized NOT LIKE '%'||expected||'%' THEN
   RAISE EXCEPTION 'structural constraint mismatch %.%: expected %, found %',r.table_name,r.constraint_name,r.definition,got;
  END IF;
 END LOOP;
END $$;
CREATE TEMP TABLE _expected_indexes(table_name text,index_name text,definition text) ON COMMIT DROP;
INSERT INTO _expected_indexes VALUES
('learning_sections','learning_sections_lesson_id_status_ordinal_idx','CREATE INDEX learning_sections_lesson_id_status_ordinal_idx ON public.learning_sections USING btree (lesson_id, status, ordinal)'),('learning_activities','learning_activities_section_id_status_ordinal_idx','CREATE INDEX learning_activities_section_id_status_ordinal_idx ON public.learning_activities USING btree (section_id, status, ordinal)'),('learning_activity_objectives','learning_activity_objectives_objective_id_idx','CREATE INDEX learning_activity_objectives_objective_id_idx ON public.learning_activity_objectives USING btree (objective_id)'),('learning_activity_progress','learning_activity_progress_activity_definition_id_idx','CREATE INDEX learning_activity_progress_activity_definition_id_idx ON public.learning_activity_progress USING btree (activity_definition_id)'),('learning_questions','learning_questions_course_id_lesson_id_idx','CREATE INDEX learning_questions_course_id_lesson_id_idx ON public.learning_questions USING btree (course_id, lesson_id)'),('learning_questions','learning_questions_organization_id_lesson_id_idx','CREATE INDEX learning_questions_organization_id_lesson_id_idx ON public.learning_questions USING btree (organization_id, lesson_id)'),('learning_question_versions','learning_question_versions_question_id_status_idx','CREATE INDEX learning_question_versions_question_id_status_idx ON public.learning_question_versions USING btree (question_id, status)'),('learning_question_version_objectives','learning_question_version_objectives_objective_id_idx','CREATE INDEX learning_question_version_objectives_objective_id_idx ON public.learning_question_version_objectives USING btree (objective_id)'),('learning_assignment_question_versions','learning_assignment_question_versions_question_version_id_idx','CREATE INDEX learning_assignment_question_versions_question_version_id_idx ON public.learning_assignment_question_versions USING btree (question_version_id)'),('learning_enrollments','idx_learning_enrollments_active_classroom','CREATE INDEX idx_learning_enrollments_active_classroom ON public.learning_enrollments USING btree (classroom_id, learner_user_id) WHERE (status = ''active''::text)');
DO $$ DECLARE r record; got text; BEGIN
 FOR r IN SELECT * FROM _expected_indexes LOOP
  SELECT pg_get_indexdef(i.indexrelid) INTO got FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname=r.table_name AND ix.relname=r.index_name;
  IF NOT FOUND OR regexp_replace(got,'[[:space:]]','','g') IS DISTINCT FROM regexp_replace(r.definition,'[[:space:]]','','g') THEN RAISE EXCEPTION 'structural index mismatch %.%: expected %, found %',r.table_name,r.index_name,r.definition,got; END IF;
 END LOOP;
END $$;
SQL
if [[ "$mode" == --verify-only ]]; then
  printf '%s\n' 'ROLLBACK;' >>"$tmp"
  psql "$VISTA_RECONCILE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$tmp"
  exit 0
fi
cat >>"$tmp" <<'SQL'
CREATE TABLE IF NOT EXISTS public.vista_schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, release_id text NOT NULL, source_commit text NOT NULL, operator_id text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.vista_schema_migrations ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'executed' CHECK (provenance IN ('executed','baseline_verified'));
SQL
for v in "${versions[@]}"; do
  sum=$(sha256sum "$root/services/education-api/prisma/migrations/$v/migration.sql" | awk '{print $1}')
  cat >>"$tmp" <<SQL
INSERT INTO public.vista_schema_migrations(version,checksum,release_id,source_commit,operator_id,provenance) VALUES ('$v','$sum','20261108-main-non-iot','c23f3366ef78d20d17979b712af5d9f16aa27512','baseline-reconciler','baseline_verified') ON CONFLICT(version) DO UPDATE SET provenance=EXCLUDED.provenance WHERE public.vista_schema_migrations.provenance='baseline_verified' AND public.vista_schema_migrations.checksum=EXCLUDED.checksum;
DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.vista_schema_migrations WHERE version='$v' AND checksum='$sum' AND provenance='baseline_verified') THEN RAISE EXCEPTION 'ledger conflict for $v'; END IF; END \$\$;
SQL
done
cat >>"$tmp" <<'SQL'
COMMIT;
SELECT version,provenance,checksum FROM public.vista_schema_migrations WHERE version IN ('20261104_curriculum_foundation','20261105_question_bank_foundation','20261106_question_bank_quiz_attempt','20261106_classroom_enrollment_lifecycle','20261106_iot_lifecycle_foundation','20261106_iot_publish_intent') ORDER BY version;
SQL
psql "$VISTA_RECONCILE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$tmp"
