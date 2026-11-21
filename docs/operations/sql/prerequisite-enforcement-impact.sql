-- READ-ONLY impact count for the course-prerequisite enforcement release (WEB_LMS_RELEASE_READINESS.md, WEBSITE_RELEASE_READINESS.md).
-- Counts, per school/course and in total, the active students who WOULD BE LOCKED out of the lessons they have not started once enforcement applies to them.
-- Aggregate counts only: no names, e-mails or user ids. Nothing is modified: the whole script runs in a READ ONLY transaction that is rolled back.
-- DO NOT RUN AGAINST PRODUCTION WITHOUT EXPLICIT APPROVAL (use an approved read-only role).
--
-- Mirrors the server (course-prerequisites.ts, progression.service.ts):
--   * "has access today": enrolment, offering, classroom, classroom membership and school membership are active and the course is published;
--   * an EFFECTIVE prerequisite is published, has >= 1 lesson and is reachable by the student (already enrolled in it, or the student's school
--     has an active offering of it); unreachable prerequisites are ignored by the server and by this script;
--   * a prerequisite is SATISFIED when the student completed every lesson of it;
--   * a lesson is locked unless the student already completed it or has it in progress; submissions of started attempts are never blocked;
--   * enforcement mode (COURSE_PREREQUISITES_ENFORCED_FROM): default `always` (what enforcing for everyone would lock). Pass a cutoff to see what
--     is left once students enrolled before it are grandfathered:  -v enforced_from=2026-12-01T00:00:00Z
--     With a cutoff at or after the deployment time the expected result is 0 locked students.
--
-- Run: psql "$READONLY_URL" -v ON_ERROR_STOP=1 [-v enforced_from=2026-12-01T00:00:00Z] -f prerequisite-enforcement-impact.sql
\if :{?enforced_from}
\else
\set enforced_from -infinity
\endif
BEGIN READ ONLY;

-- 1) One statement: the row with scope = 'TOTAL' is the headline, the others are per school/course (only courses with locked students).
WITH access AS (
  SELECT DISTINCT e.learner_user_id, c.id AS course_id, c.title AS course_title, cl.organization_id AS school_id
  FROM public.learning_enrollments e
  JOIN public.learning_courses c ON c.id = e.course_id AND c.status = 'published' AND cardinality(c.prerequisite_course_ids) > 0
  JOIN public.learning_course_offerings o ON o.id = e.offering_id AND o.course_id = c.id AND o.status = 'active'
  JOIN public.learning_classrooms cl ON cl.id = e.classroom_id AND cl.offering_id = o.id AND cl.status = 'active'
  JOIN public.learning_classroom_members cm ON cm.classroom_id = cl.id AND cm.user_id = e.learner_user_id
    AND cm.classroom_role = 'student' AND cm.status = 'active'
  JOIN public.memberships m ON m.id = cm.membership_id AND m.user_id = e.learner_user_id
    AND m.organization_id = cl.organization_id AND m.status = 'active'
  WHERE e.status = 'active'
), impact AS (
  SELECT a.*,
    (SELECT count(*) FROM public.learning_courses c
       CROSS JOIN LATERAL unnest(c.prerequisite_course_ids) AS req(course_id)
       JOIN public.learning_courses pre ON pre.id = req.course_id AND pre.status = 'published'
       WHERE c.id = a.course_id
         AND EXISTS (SELECT 1 FROM public.learning_lessons pl WHERE pl.course_id = pre.id)
         AND (EXISTS (SELECT 1 FROM public.learning_enrollments pe WHERE pe.course_id = pre.id AND pe.learner_user_id = a.learner_user_id)
              OR EXISTS (SELECT 1 FROM public.learning_course_offerings po WHERE po.course_id = pre.id AND po.organization_id = a.school_id AND po.status = 'active'))
         AND EXISTS (SELECT 1 FROM public.learning_lessons pl WHERE pl.course_id = pre.id AND NOT EXISTS (
               SELECT 1 FROM public.learning_lesson_progress pp
               WHERE pp.lesson_id = pl.id AND pp.learner_user_id = a.learner_user_id AND pp.status = 'completed'))
    ) AS unmet_prerequisites,
    EXISTS (SELECT 1 FROM public.learning_enrollments ge
            WHERE ge.course_id = a.course_id AND ge.learner_user_id = a.learner_user_id AND ge.status IN ('active', 'completed')
              AND (ge.enrolled_at IS NULL OR ge.enrolled_at < :'enforced_from'::timestamptz)) AS grandfathered,
    (SELECT count(*) FROM public.learning_lessons l WHERE l.course_id = a.course_id) AS lessons,
    (SELECT count(*) FROM public.learning_lesson_progress p JOIN public.learning_lessons l ON l.id = p.lesson_id
       WHERE l.course_id = a.course_id AND p.learner_user_id = a.learner_user_id AND p.status = 'completed') AS completed_lessons,
    -- enrolment pre-creates 'not_started' rows for every lesson, so only in_progress/completed rows, activity progress or an attempt count as started
    (EXISTS (SELECT 1 FROM public.learning_lesson_progress p JOIN public.learning_lessons l ON l.id = p.lesson_id
               WHERE l.course_id = a.course_id AND p.learner_user_id = a.learner_user_id AND p.status IN ('in_progress', 'completed'))
     OR EXISTS (SELECT 1 FROM public.learning_activity_progress ap JOIN public.learning_lessons l ON l.id = ap.lesson_id
               WHERE l.course_id = a.course_id AND ap.learner_user_id = a.learner_user_id)
     OR EXISTS (SELECT 1 FROM public.learning_assignment_attempts att
               JOIN public.learning_classroom_assignments ca ON ca.id = att.classroom_assignment_id
               JOIN public.learning_assignments la ON la.id = ca.assignment_id
               JOIN public.learning_lessons l ON l.id = la.lesson_id
               WHERE l.course_id = a.course_id AND att.learner_user_id = a.learner_user_id)) AS started,
    EXISTS (SELECT 1 FROM public.learning_assignment_attempts att
               JOIN public.learning_classroom_assignments ca ON ca.id = att.classroom_assignment_id
               JOIN public.learning_assignments la ON la.id = ca.assignment_id
               JOIN public.learning_lessons l ON l.id = la.lesson_id
               WHERE l.course_id = a.course_id AND att.learner_user_id = a.learner_user_id AND att.status = 'in_progress') AS open_attempt
  FROM access a
), locked AS (
  SELECT * FROM impact WHERE unmet_prerequisites > 0 AND NOT grandfathered AND completed_lessons < lessons
)
SELECT CASE WHEN GROUPING(school_id, course_id, course_title) = 7 THEN 'TOTAL' ELSE 'COURSE' END AS scope,
  school_id, course_id, course_title,
  count(*)                                                                           AS locked_pairs,
  count(DISTINCT learner_user_id)                                                    AS students_locked,
  count(DISTINCT learner_user_id) FILTER (WHERE started)                             AS students_locked_started_keep_started_lessons,
  count(DISTINCT learner_user_id) FILTER (WHERE NOT started)                         AS students_locked_not_started,
  count(DISTINCT learner_user_id) FILTER (WHERE open_attempt)                        AS students_with_open_attempt_can_still_submit
FROM locked
GROUP BY GROUPING SETS ((), (school_id, course_id, course_title))
ORDER BY scope DESC, students_locked DESC, course_title;

-- 2) Prerequisites the server ignores or that will never lock anyone (review and fix): not published, no lessons, or not offered by any active offering.
SELECT c.id AS course_id, c.title AS course_title, pre.id AS prerequisite_course_id, pre.title AS prerequisite_title, pre.status AS prerequisite_status,
  (SELECT count(*) FROM public.learning_lessons pl WHERE pl.course_id = pre.id) AS prerequisite_lessons,
  (SELECT count(*) FROM public.learning_course_offerings po WHERE po.course_id = pre.id AND po.status = 'active') AS prerequisite_active_offerings
FROM public.learning_courses c
CROSS JOIN LATERAL unnest(c.prerequisite_course_ids) AS req(course_id)
JOIN public.learning_courses pre ON pre.id = req.course_id
WHERE c.status = 'published'
  AND (pre.status <> 'published'
       OR NOT EXISTS (SELECT 1 FROM public.learning_lessons pl WHERE pl.course_id = pre.id)
       OR NOT EXISTS (SELECT 1 FROM public.learning_course_offerings po WHERE po.course_id = pre.id AND po.status = 'active'))
ORDER BY c.title;

-- 3) Prerequisite ids that point at a course that no longer exists.
SELECT c.id AS course_id, c.title AS course_title, req.course_id AS missing_prerequisite_id
FROM public.learning_courses c
CROSS JOIN LATERAL unnest(c.prerequisite_course_ids) AS req(course_id)
WHERE c.status = 'published' AND NOT EXISTS (SELECT 1 FROM public.learning_courses pre WHERE pre.id = req.course_id);

ROLLBACK;
