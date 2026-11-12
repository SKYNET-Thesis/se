-- D03 Stage 2: one final submission per attempt.
--
-- NOT part of database/migrations/manifest.json yet. It is a SEPARATE, later release that must be applied only
-- while no old-API instance is running (the old API upserts with ON CONFLICT (assignment_id, learner_user_id),
-- which stops being a valid conflict target here). See database/staged-migrations/README.md for the release
-- sequence, the roll-forward procedure and why this migration has no automatic rollback.
--
-- What it does:
--   1. requires Stage 1 (20261113_i_attempt_submission_foundation) to be applied;
--   2. re-runs the conservative attempt_id backfill for rows written by the old API after Stage 1;
--   3. drops the legacy UNIQUE (assignment_id, learner_user_id) and keeps a plain lookup index instead;
--   4. reconstructs submission rows for earlier attempts whose row had been overwritten, ONLY when the attempt
--      snapshots match exactly one stored program version (origin = 'reconstructed'; no grade, feedback,
--      reflection or program version is ever invented);
--   5. makes finalized submissions immutable and requires every new submission to be bound to its own attempt.
-- It never deletes or rewrites a submission, assessment, score, feedback, reflection, experiment or evaluation.

DO $$
BEGIN
  IF to_regclass('public.learning_submission_backfill_audit') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'learning_submissions' AND column_name = 'attempt_id') THEN
    RAISE EXCEPTION 'D03 Stage 1 (20261113_i_attempt_submission_foundation) must be applied before Stage 2';
  END IF;
END $$;

-- 1. Re-run the unambiguous backfill (rows inserted by the old API after Stage 1 have attempt_id NULL).
CREATE TEMP TABLE d03_submission_candidates_s2 ON COMMIT DROP AS
SELECT s.id AS submission_id,
       (SELECT count(*)::int FROM public.learning_assignment_attempts a
          JOIN public.learning_classroom_assignments ca ON ca.id = a.classroom_assignment_id
         WHERE a.learner_user_id = s.learner_user_id AND a.program_id = s.program_id
           AND ca.assignment_id = s.assignment_id) AS match_count,
       (SELECT min(a.id::text)::uuid FROM public.learning_assignment_attempts a
          JOIN public.learning_classroom_assignments ca ON ca.id = a.classroom_assignment_id
         WHERE a.learner_user_id = s.learner_user_id AND a.program_id = s.program_id
           AND ca.assignment_id = s.assignment_id) AS attempt_id,
       (SELECT count(*)::int FROM public.learning_assignment_attempts other
          JOIN public.learning_classroom_assignments oca ON oca.id = other.classroom_assignment_id
         WHERE other.learner_user_id = s.learner_user_id AND oca.assignment_id = s.assignment_id
           AND other.status IN ('submitted','evaluated') AND other.program_id IS DISTINCT FROM s.program_id) AS other_submitted_attempts,
       (EXISTS (SELECT 1 FROM public.learning_assessments x WHERE x.submission_id = s.id)
         OR EXISTS (SELECT 1 FROM public.learning_feedback f WHERE f.submission_id = s.id)
         OR EXISTS (SELECT 1 FROM public.learning_reflections r WHERE r.submission_id = s.id)) AS has_dependents
  FROM public.learning_submissions s
 WHERE s.attempt_id IS NULL AND s.program_id IS NOT NULL;

INSERT INTO public.learning_submission_backfill_audit(stage, submission_id, attempt_id, classification, grading_attribution_uncertain, detail)
SELECT 'stage2', c.submission_id,
       CASE WHEN c.match_count = 1 THEN c.attempt_id END,
       CASE WHEN c.match_count = 1 THEN 'mapped'
            WHEN c.match_count = 0 THEN 'unmapped_no_attempt'
            ELSE 'ambiguous_multiple_attempts' END,
       (c.has_dependents AND c.other_submitted_attempts > 0),
       jsonb_build_object('matchCount', c.match_count, 'otherSubmittedAttempts', c.other_submitted_attempts, 'hasDependents', c.has_dependents)
  FROM d03_submission_candidates_s2 c
ON CONFLICT DO NOTHING;

UPDATE public.learning_submissions s
   SET attempt_id = c.attempt_id
  FROM d03_submission_candidates_s2 c
 WHERE s.id = c.submission_id AND c.match_count = 1 AND s.attempt_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.learning_submissions taken WHERE taken.attempt_id = c.attempt_id);

-- 2. Replace the legacy per-learner uniqueness by a plain lookup index.
ALTER TABLE public.learning_submissions DROP CONSTRAINT learning_submissions_assignment_id_learner_user_id_key;
CREATE INDEX learning_submissions_assignment_learner_idx
  ON public.learning_submissions(assignment_id, learner_user_id);

-- 2b. Grading-visibility transition policy (decision pending approval; see docs/operations/d03-student-submissions.md).
-- Before D03 every assessment/feedback was visible to the student as soon as it was written. At cutover (the old API is
-- stopped, so this is the exact set of previously visible grades):
--   * unambiguously attributed grades keep their visibility: the attempt is marked released with origin 'legacy_visible'
--     (released_by stays NULL), so nothing a student could already see disappears;
--   * grades whose attribution is uncertain (the row overwrote earlier attempts) are WITHHELD (unreleased) and audited for
--     an explicit instructor decision, because showing them could attach a grade to work it was not given for.
-- Nothing is deleted, rewritten or moved; instructors can still release or review everything.
INSERT INTO public.learning_submission_backfill_audit(stage, submission_id, attempt_id, classification, grading_attribution_uncertain, detail)
SELECT 'stage2', s.id, s.attempt_id, 'legacy_grading_withheld_uncertain', true,
       jsonb_build_object('note', 'grade/feedback may belong to an earlier attempt; left unreleased pending instructor decision')
  FROM public.learning_submissions s
  JOIN public.learning_submission_backfill_audit au ON au.submission_id = s.id AND au.grading_attribution_uncertain
 WHERE s.attempt_id IS NOT NULL AND s.origin = 'original'
   AND (EXISTS (SELECT 1 FROM public.learning_assessments x WHERE x.submission_id = s.id)
        OR EXISTS (SELECT 1 FROM public.learning_feedback f WHERE f.submission_id = s.id OR f.attempt_id = s.attempt_id))
ON CONFLICT DO NOTHING;

WITH visible AS (
  SELECT a.id AS attempt_id, s.id AS submission_id
    FROM public.learning_assignment_attempts a
    JOIN public.learning_submissions s ON s.attempt_id = a.id AND s.origin = 'original'
   WHERE a.grading_released_at IS NULL AND a.status IN ('submitted','evaluated')
     AND (EXISTS (SELECT 1 FROM public.learning_assessments x WHERE x.submission_id = s.id)
          OR EXISTS (SELECT 1 FROM public.learning_feedback f WHERE f.submission_id = s.id OR f.attempt_id = a.id))
     AND NOT EXISTS (SELECT 1 FROM public.learning_submission_backfill_audit au WHERE au.submission_id = s.id AND au.grading_attribution_uncertain)
), released AS (
  UPDATE public.learning_assignment_attempts a
     SET grading_released_at = now(), grading_release_origin = 'legacy_visible'
    FROM visible v WHERE a.id = v.attempt_id
  RETURNING a.id AS attempt_id
)
INSERT INTO public.learning_submission_backfill_audit(stage, submission_id, attempt_id, classification, detail)
SELECT 'stage2', v.submission_id, v.attempt_id, 'legacy_grading_released',
       jsonb_build_object('note', 'grade/feedback was visible before D03; visibility preserved')
  FROM visible v JOIN released r ON r.attempt_id = v.attempt_id
ON CONFLICT DO NOTHING;

-- 3. Reconstruct submissions of earlier attempts whose row was overwritten by the legacy UPSERT.
-- Conservative: the attempt must be finalized, own a program, have no submission row of its own and no legacy
-- row for the same program, and its snapshots must match EXACTLY ONE program version of that program.
CREATE TEMP TABLE d03_reconstruction_candidates ON COMMIT DROP AS
SELECT a.id AS attempt_id, a.learner_user_id, ca.assignment_id, a.program_id, a.submitted_at,
       a.workspace_snapshot, a.program_snapshot,
       (SELECT count(*)::int FROM public.learning_program_versions pv
         WHERE pv.program_id = a.program_id AND pv.robot_program = a.program_snapshot
           AND pv.workspace_json = a.workspace_snapshot) AS version_matches,
       (SELECT min(pv.id::text)::uuid FROM public.learning_program_versions pv
         WHERE pv.program_id = a.program_id AND pv.robot_program = a.program_snapshot
           AND pv.workspace_json = a.workspace_snapshot) AS program_version_id
  FROM public.learning_assignment_attempts a
  JOIN public.learning_classroom_assignments ca ON ca.id = a.classroom_assignment_id
 WHERE a.status IN ('submitted','evaluated') AND a.program_id IS NOT NULL
   AND a.program_snapshot <> '{}'::jsonb AND a.workspace_snapshot <> '{}'::jsonb
   AND NOT EXISTS (SELECT 1 FROM public.learning_submissions s WHERE s.attempt_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM public.learning_submissions s
                    WHERE s.learner_user_id = a.learner_user_id AND s.assignment_id = ca.assignment_id
                      AND s.program_id = a.program_id);

INSERT INTO public.learning_submission_backfill_audit(stage, attempt_id, classification, detail)
SELECT 'stage2', r.attempt_id, 'reconstruction_skipped',
       jsonb_build_object('reason', CASE WHEN r.version_matches = 0 THEN 'no program version matches the attempt snapshots'
                                         ELSE 'more than one program version matches the attempt snapshots' END,
                          'versionMatches', r.version_matches)
  FROM d03_reconstruction_candidates r
 WHERE r.version_matches <> 1
ON CONFLICT DO NOTHING;

INSERT INTO public.learning_submissions(assignment_id, learner_user_id, program_id, program_version_id,
                                        submitted_workspace, submitted_program, reflection, status, submitted_at,
                                        attempt_id, origin)
SELECT r.assignment_id, r.learner_user_id, r.program_id, r.program_version_id,
       r.workspace_snapshot, r.program_snapshot, NULL, 'submitted', r.submitted_at, r.attempt_id, 'reconstructed'
  FROM d03_reconstruction_candidates r
 WHERE r.version_matches = 1;

INSERT INTO public.learning_submission_backfill_audit(stage, submission_id, attempt_id, classification, detail)
SELECT 'stage2', s.id, s.attempt_id, 'reconstructed',
       jsonb_build_object('note', 'rebuilt from attempt snapshots; reflection, grading and feedback were not recoverable')
  FROM public.learning_submissions s
 WHERE s.origin = 'reconstructed'
ON CONFLICT DO NOTHING;

-- 4. New submissions must be bound to their own attempt, and finalized submissions are immutable.
CREATE FUNCTION public.guard_learning_submission_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt_row record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' AND NEW.attempt_id IS NULL AND NEW.origin = 'original' THEN
      RAISE EXCEPTION 'a final submission must be bound to its attempt (attempt_id)' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.attempt_id IS NOT NULL THEN
      SELECT a.learner_user_id, a.program_id, ca.assignment_id INTO attempt_row
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id = a.classroom_assignment_id
       WHERE a.id = NEW.attempt_id;
      IF NOT FOUND OR attempt_row.learner_user_id <> NEW.learner_user_id
         OR attempt_row.assignment_id <> NEW.assignment_id
         OR attempt_row.program_id IS DISTINCT FROM NEW.program_id THEN
        RAISE EXCEPTION 'submission does not match its attempt (learner, assignment or program)' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: a finalized submission keeps its content forever. Allowed: attaching a still-missing attempt_id
  -- (late legacy mapping) and the status step submitted -> reviewed.
  IF OLD.status IN ('submitted','reviewed') THEN
    IF (NEW.assignment_id, NEW.learner_user_id, NEW.program_id, NEW.program_version_id, NEW.submitted_workspace,
        NEW.submitted_program, NEW.reflection, NEW.submitted_at, NEW.origin)
       IS DISTINCT FROM
       (OLD.assignment_id, OLD.learner_user_id, OLD.program_id, OLD.program_version_id, OLD.submitted_workspace,
        OLD.submitted_program, OLD.reflection, OLD.submitted_at, OLD.origin)
       OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id)
       OR NOT (NEW.status = OLD.status OR (OLD.status = 'submitted' AND NEW.status = 'reviewed')) THEN
      RAISE EXCEPTION 'a finalized submission is immutable' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_learning_submission_attempt
  BEFORE INSERT OR UPDATE ON public.learning_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_learning_submission_attempt();
