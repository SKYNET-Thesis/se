#!/usr/bin/env bash
# Isolated safety check for STAGED migration T on the disposable local stack database (scripts/local_integration_stack.sh up first). Never touches Production.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="postgresql://vista_test:intpw@127.0.0.1:55497/vista_test_int"
q() { psql "$DB" -Atqc "$1"; }
SQL=database/staged-migrations/20261128_t_rubric_level_descriptors.sql
before=$(q "SELECT count(*) FROM learning_assessment_scores")
psql "$DB" -v ON_ERROR_STOP=1 -q -f $SQL; psql "$DB" -v ON_ERROR_STOP=1 -q -f $SQL          # idempotent
[ "$(q "SELECT count(*) FROM learning_assessment_scores")" = "$before" ] || { echo "row count changed"; exit 1; }
[ "$(q "SELECT count(*) FROM learning_rubric_criteria WHERE descriptors IS NOT NULL")" = 0 ] || { echo "legacy criteria must stay NULL"; exit 1; }
q "SELECT count(*) FROM learning_assessment_scores WHERE level IS NOT NULL" | grep -qx 0
# constraints reject bad values, accept valid ones (rolled back)
psql "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
DO $$ BEGIN
  BEGIN UPDATE public.learning_rubric_criteria SET descriptors='["a","b","c"]'::jsonb WHERE id IN (SELECT id FROM public.learning_rubric_criteria LIMIT 1);
    IF FOUND THEN RAISE EXCEPTION 'three descriptors must be rejected'; END IF;
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE public.learning_rubric_criteria SET descriptors='["a","b","c","d"]'::jsonb WHERE id IN (SELECT id FROM public.learning_rubric_criteria LIMIT 1);
ROLLBACK;
SQL
# rollback
psql "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
ALTER TABLE public.learning_assessment_scores DROP CONSTRAINT IF EXISTS learning_assessment_scores_level_range;
ALTER TABLE public.learning_assessment_scores DROP COLUMN IF EXISTS level;
ALTER TABLE public.learning_rubric_criteria DROP CONSTRAINT IF EXISTS learning_rubric_criteria_descriptors_shape;
ALTER TABLE public.learning_rubric_criteria DROP COLUMN IF EXISTS descriptors;
SQL
[ "$(q "SELECT count(*) FROM learning_assessment_scores")" = "$before" ] || { echo "row count changed by rollback"; exit 1; }
echo "migration T: idempotent, additive, constraints enforced, rollback clean"
