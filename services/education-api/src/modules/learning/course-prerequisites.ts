import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export interface UnmetCoursePrerequisite { id: string; title: string; }

/**
 * Course-prerequisite enforcement policy, from `COURSE_PREREQUISITES_ENFORCED_FROM`:
 *  - absent / empty / `disabled` / `off` / `false` / `0`: DISABLED. No course-level lock is applied (today's deployed behaviour), so
 *    nothing can lock existing students by accident. Self-enrolment from the catalog still checks prerequisites at enrolment time.
 *  - `always`: enforced for every active enrolment, old and new (use only after schools have adjusted, or in tests).
 *  - an ISO-8601 date-time WITH a time zone (`2026-12-01T00:00:00Z`): enforced only for learners with no active enrolment in the course
 *    that started before the cutoff (`learning_enrollments.enrolled_at`, set once at first enrolment and never rewritten). Every learner
 *    enrolled before the cutoff keeps today's access, including open quiz attempts. A cutoff in the future starts enforcement then.
 *  - anything else is INVALID: the production configuration check refuses to boot; elsewhere it behaves as DISABLED and is logged.
 */
export type PrerequisitePolicy =
  | { mode: "disabled"; invalid?: string }
  | { mode: "all" }
  | { mode: "from"; cutoff: Date };

const OFF = new Set(["", "disabled", "off", "false", "0", "none"]);
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parsePrerequisitePolicy(raw: string | undefined | null): PrerequisitePolicy {
  const value = (raw ?? "").trim();
  const lower = value.toLowerCase();
  if (OFF.has(lower)) return { mode: "disabled" };
  if (lower === "always") return { mode: "all" };
  if (ISO_WITH_ZONE.test(value)) {
    const cutoff = new Date(value);
    if (!Number.isNaN(cutoff.getTime())) return { mode: "from", cutoff };
  }
  return { mode: "disabled", invalid: `COURSE_PREREQUISITES_ENFORCED_FROM must be "always", "disabled" or an ISO-8601 date-time with a time zone (for example 2026-12-01T00:00:00Z); got "${value.slice(0, 40)}".` };
}

let warned = false;
export function prerequisitePolicyFromEnv(env: Record<string, string | undefined> = process.env): PrerequisitePolicy {
  const policy = parsePrerequisitePolicy(env.COURSE_PREREQUISITES_ENFORCED_FROM);
  if (policy.mode === "disabled" && policy.invalid && !warned) {
    warned = true;
    new Logger("CoursePrerequisites").error(`${policy.invalid} Enforcement is DISABLED until it is corrected.`);
  }
  return policy;
}

/**
 * SQL scalar sub-select: the course-level prerequisites of `courseId` that `learnerId` has not satisfied, as a jsonb array of {id,title}
 * in the instructor's order, under `policy`. Embed it as a column of an existing query. '[]' means "nothing locks this learner".
 *
 * A prerequisite is EFFECTIVE only if the learner can actually satisfy it; an unreachable one is ignored (fail open) so that no
 * configuration can lock a learner out forever: it must be published, have at least one lesson, and be reachable by the learner, that
 * is the learner is already enrolled in it, or the learner's school (through the classroom that enrols them in `courseId`) has an active
 * offering of it. A prerequisite is SATISFIED when the learner completed every lesson of it.
 *
 * `lessonId` (optional) exempts work the learner already started: when the learner completed that lesson, is working on it, or has
 * any attempt on its assignments, the course lock does not apply to it (completed lessons, media, retakes and in-flight attempts).
 */
export function unmetCoursePrerequisitesSql(courseId: Prisma.Sql, learnerId: string, policy: PrerequisitePolicy, lessonId?: Prisma.Sql): Prisma.Sql {
  if (policy.mode === "disabled") return Prisma.sql`'[]'::jsonb`;
  const unmet = Prisma.sql`COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', pre.id, 'title', pre.title) ORDER BY req.position)
    FROM public.learning_courses owner_course
    CROSS JOIN LATERAL unnest(owner_course.prerequisite_course_ids) WITH ORDINALITY AS req(course_id, position)
    JOIN public.learning_courses pre ON pre.id = req.course_id AND pre.status = 'published'
    WHERE owner_course.id = ${courseId}
      AND EXISTS (SELECT 1 FROM public.learning_lessons pl WHERE pl.course_id = pre.id)
      AND (
        EXISTS (SELECT 1 FROM public.learning_enrollments pe WHERE pe.course_id = pre.id AND pe.learner_user_id = ${learnerId}::uuid)
        OR EXISTS (
          SELECT 1 FROM public.learning_enrollments ce
          JOIN public.learning_classrooms ccl ON ccl.id = ce.classroom_id
          JOIN public.learning_course_offerings po ON po.course_id = pre.id AND po.organization_id = ccl.organization_id AND po.status = 'active'
          WHERE ce.course_id = owner_course.id AND ce.learner_user_id = ${learnerId}::uuid AND ce.status = 'active')
      )
      AND EXISTS (
        SELECT 1 FROM public.learning_lessons pl
        WHERE pl.course_id = pre.id AND NOT EXISTS (
          SELECT 1 FROM public.learning_lesson_progress pp
          WHERE pp.lesson_id = pl.id AND pp.learner_user_id = ${learnerId}::uuid AND pp.status = 'completed'))
  ), '[]'::jsonb)`;
  const exemptions: Prisma.Sql[] = [];
  if (policy.mode === "from") {
    exemptions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM public.learning_enrollments ge
      WHERE ge.course_id = ${courseId} AND ge.learner_user_id = ${learnerId}::uuid AND ge.status IN ('active', 'completed')
        AND (ge.enrolled_at IS NULL OR ge.enrolled_at < ${policy.cutoff}::timestamptz))`);
  }
  if (lessonId) {
    exemptions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM public.learning_lesson_progress started
      WHERE started.lesson_id = ${lessonId} AND started.learner_user_id = ${learnerId}::uuid AND started.status IN ('completed', 'in_progress'))`);
    exemptions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM public.learning_assignment_attempts prior
      JOIN public.learning_classroom_assignments pca ON pca.id = prior.classroom_assignment_id
      JOIN public.learning_assignments pla ON pla.id = pca.assignment_id
      WHERE pla.lesson_id = ${lessonId} AND prior.learner_user_id = ${learnerId}::uuid)`);
  }
  if (!exemptions.length) return unmet;
  return Prisma.sql`CASE WHEN ${Prisma.join(exemptions, " OR ")} THEN '[]'::jsonb ELSE ${unmet} END`;
}

export function parseUnmet(value: unknown): UnmetCoursePrerequisite[] {
  return Array.isArray(value) ? value.filter((item): item is UnmetCoursePrerequisite => !!item && typeof (item as UnmetCoursePrerequisite).id === "string" && typeof (item as UnmetCoursePrerequisite).title === "string") : [];
}

export function coursePrerequisiteMessage(unmet: UnmetCoursePrerequisite[]): string {
  return `Complete ${unmet.map((item) => item.title).join(" and ")} first to unlock this course.`;
}

type Db = { $queryRaw: (query: Prisma.Sql) => Promise<unknown> };

/**
 * Reasons a course's prerequisite list would trap learners (empty list = fine). `requirePublished` is true for a published course, and
 * while publishing one: every prerequisite must then exist, be unarchived, belong to the same school or be global, be published and have lessons.
 */
export async function prerequisiteProblems(db: Db, ids: string[], organizationId: string | null, requirePublished: boolean): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db.$queryRaw(
    Prisma.sql`SELECT c.id, c.title, c.status, c.organization_id, EXISTS (SELECT 1 FROM public.learning_lessons l WHERE l.course_id = c.id) AS has_lessons
               FROM public.learning_courses c WHERE c.id = ANY(${ids}::uuid[])`) as Array<{ id: string; title: string; status: string; organization_id: string | null; has_lessons: boolean }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const problems: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { problems.push("A prerequisite course no longer exists."); continue; }
    if (row.status === "archived") problems.push(`"${row.title}" is archived and cannot be a prerequisite.`);
    else if (row.organization_id !== null && row.organization_id !== organizationId) problems.push(`"${row.title}" belongs to another school and cannot be a prerequisite.`);
    else if (requirePublished && row.status !== "published") problems.push(`Publish the prerequisite "${row.title}" first.`);
    else if (requirePublished && !row.has_lessons) problems.push(`The prerequisite "${row.title}" has no lessons.`);
  }
  return problems;
}

/** Published courses that list `courseId` as a prerequisite (withdrawing it would strand their learners). */
export async function publishedDependents(db: Db, courseId: string): Promise<UnmetCoursePrerequisite[]> {
  return (await db.$queryRaw(
    Prisma.sql`SELECT id, title FROM public.learning_courses WHERE status = 'published' AND ${courseId}::uuid = ANY(prerequisite_course_ids) ORDER BY title`)) as UnmetCoursePrerequisite[] | undefined ?? [];
}
