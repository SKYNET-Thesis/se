import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { ProgressionService } from './progression.service';

type ActivityStatus = 'completed' | 'not_started';
export interface ActivityProgressItem { activityId: string; status: ActivityStatus; completedAt: Date | null; }
export interface CourseActivityProgress { courseId: string; activities: ActivityProgressItem[]; }

type LessonDefinition = { id: string; ordinal: number; course_id?: string; legacy_course?: boolean };
type PublishedActivity = { id: string; lesson_id: string; course_id?: string; type: string };
type EvidenceRow = { lesson_id: string; completed_at: Date };
type ActivityEvidenceRow = { activity_id: string; completed_at: Date };
type SelfProgressRow = { activity_id: string; completed_at: Date };
const selfReportSuffixes = new Set(['reading-1', 'reading-2', 'demonstration']);
const activityIdPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-(.+)$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** These IDs mirror the current Course 1 outline. A content edit keeps a completed slot valid. */
export function activityIdsForLesson(lessonId: string, ordinal: number): string[] {
  const prefix = `${lessonId}-`;
  if (ordinal === 1) return ['reading-1', 'demonstration', 'reading-2', 'knowledge-check'].map((suffix) => prefix + suffix);
  if (ordinal === 5) return ['reading-1', 'demonstration', 'readiness', 'physical', 'evidence', 'reflection'].map((suffix) => prefix + suffix);
  return ['reading-1', 'demonstration', 'guided-practice', 'simulation', 'result'].map((suffix) => prefix + suffix);
}

@Injectable()
export class ActivityProgressService {
  constructor(private readonly prisma: PrismaService, private readonly progression: ProgressionService) {}

  async courseProgress(user: AuthenticatedUser, courseId: string): Promise<CourseActivityProgress> {
    if (user.status !== 'active') throw new NotFoundException('Course was not found.');
    // The existing path enforces published course, active offering, enrollment and student membership.
    await this.progression.coursePath(user, courseId);
    const lessons = await this.prisma.$queryRaw<LessonDefinition[]>`
      SELECT l.id,l.ordinal,EXISTS (
        SELECT 1 FROM public.learning_lessons first
        WHERE first.course_id=l.course_id AND first.ordinal=1
          AND first.content->'courseOverview'->>'label'='Course 1'
      ) AS legacy_course
      FROM public.learning_lessons l WHERE l.course_id=${courseId}::uuid ORDER BY l.ordinal`;
    if (lessons.length && lessons[0].legacy_course === false) {
      const activities = await this.prisma.$queryRaw<PublishedActivity[]>`
        SELECT a.id,s.lesson_id,a.type FROM public.learning_activities a
        JOIN public.learning_sections s ON s.id=a.section_id
        JOIN public.learning_lessons l ON l.id=s.lesson_id
        WHERE l.course_id=${courseId}::uuid AND s.status='published' AND a.status='published'
        ORDER BY l.ordinal,s.ordinal,a.ordinal`;
      const self = await this.prisma.$queryRaw<SelfProgressRow[]>`
        SELECT p.activity_id,p.completed_at FROM public.learning_activity_progress p
        JOIN public.learning_activities a ON a.id=p.activity_definition_id
        JOIN public.learning_sections s ON s.id=a.section_id
        JOIN public.learning_lessons l ON l.id=s.lesson_id
        WHERE l.course_id=${courseId}::uuid AND p.learner_user_id=${user.vistaUserId}::uuid
          AND s.status='published' AND a.status='published'`;
      const completed = new Map(self.map((row) => [row.activity_id, row.completed_at]));
      const evidence = await this.prisma.$queryRaw<ActivityEvidenceRow[]>`
        SELECT a.id AS activity_id,MIN(COALESCE(att.submitted_at,att.started_at)) AS completed_at
        FROM public.learning_activities a
        JOIN public.learning_sections sec ON sec.id=a.section_id AND sec.status='published'
        JOIN public.learning_lessons l ON l.id=sec.lesson_id AND l.course_id=${courseId}::uuid
        JOIN public.learning_assignments la ON la.id::text=a.content_ref->>'id' AND la.lesson_id=l.id
        JOIN public.learning_classroom_assignments ca ON ca.assignment_id=la.id
        JOIN public.learning_assignment_attempts att ON att.classroom_assignment_id=ca.id
          AND att.learner_user_id=${user.vistaUserId}::uuid AND att.status='evaluated'
        WHERE a.status='published' AND a.type='knowledge_check' AND a.content_ref->>'kind'='assignment'
          AND (ca.status='published' OR att.workspace_snapshot->>'kind'='question_bank_quiz')
          AND att.result_snapshot->>'passed'='true'
        GROUP BY a.id
        UNION ALL
        SELECT a.id AS activity_id,MIN(se.created_at) AS completed_at
        FROM public.learning_activities a
        JOIN public.learning_sections sec ON sec.id=a.section_id AND sec.status='published'
        JOIN public.learning_lessons l ON l.id=sec.lesson_id AND l.course_id=${courseId}::uuid
        JOIN public.learning_assignments la ON la.id::text=a.content_ref->>'id' AND la.lesson_id=l.id
        JOIN public.learning_submissions sub ON sub.assignment_id=la.id AND sub.learner_user_id=${user.vistaUserId}::uuid
          AND sub.status='submitted'
        JOIN public.learning_symbolic_evaluations se ON se.submission_id=sub.id
          AND se.program_version_id=sub.program_version_id AND se.requested_by_user_id=${user.vistaUserId}::uuid
          AND se.verdict='passed'
        JOIN public.learning_experiments e ON e.id=se.experiment_id AND e.learner_user_id=${user.vistaUserId}::uuid
          AND e.status='succeeded' AND e.execution_mode='schematic'
        JOIN public.learning_assignment_attempts att ON att.id::text=e.input_snapshot->>'attemptId'
          AND att.learner_user_id=${user.vistaUserId}::uuid AND att.status='evaluated'
        JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
          AND ca.assignment_id=la.id AND ca.status='published'
        WHERE a.status='published' AND a.type IN ('guided_practice','simulation','challenge')
          AND a.content_ref->>'kind'='assignment'
        GROUP BY a.id`;
      for (const row of evidence) completed.set(row.activity_id, row.completed_at);
      return { courseId, activities: activities.map((activity) => ({
        activityId: activity.id, status: completed.has(activity.id) ? 'completed' as const : 'not_started' as const,
        completedAt: completed.get(activity.id) ?? null,
      })) };
    }
    const self = await this.prisma.$queryRaw<SelfProgressRow[]>`
      SELECT p.activity_id,p.completed_at FROM public.learning_activity_progress p
      JOIN public.learning_lessons l ON l.id=p.lesson_id
      WHERE l.course_id=${courseId}::uuid AND p.learner_user_id=${user.vistaUserId}::uuid AND p.status='completed'`;
    const quizzes = await this.prisma.$queryRaw<EvidenceRow[]>`
      SELECT l.id AS lesson_id,MIN(COALESCE(att.submitted_at,att.started_at)) AS completed_at
      FROM public.learning_assignment_attempts att
      JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id AND ca.status='published'
      JOIN public.learning_assignments la ON la.id=ca.assignment_id AND la.constraints->>'kind'='knowledge_check'
      JOIN public.learning_lessons l ON l.id=la.lesson_id AND l.course_id=${courseId}::uuid
      LEFT JOIN public.learning_challenges ch ON ch.id=la.challenge_id
      WHERE att.learner_user_id=${user.vistaUserId}::uuid AND att.status='evaluated'
        AND COALESCE((att.result_snapshot->>'passed')::boolean,
          att.score >= COALESCE((att.result_snapshot->>'passPercent')::int,(ch.success_criteria->>'passPercent')::int,80))=true
      GROUP BY l.id`;
    const simulations = await this.prisma.$queryRaw<EvidenceRow[]>`
      SELECT l.id AS lesson_id,MIN(se.created_at) AS completed_at
      FROM public.learning_symbolic_evaluations se
      JOIN public.learning_experiments e ON e.id=se.experiment_id AND e.learner_user_id=se.requested_by_user_id
        AND e.status='succeeded' AND e.execution_mode='schematic'
      JOIN public.learning_submissions s ON s.id=se.submission_id AND s.learner_user_id=se.requested_by_user_id
        AND s.program_version_id=se.program_version_id AND s.status='submitted'
      JOIN public.learning_assignment_attempts att ON att.id::text=e.input_snapshot->>'attemptId'
        AND att.learner_user_id=se.requested_by_user_id AND att.program_id=s.program_id AND att.status='evaluated'
      JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id AND ca.assignment_id=s.assignment_id
      JOIN public.learning_assignments la ON la.id=ca.assignment_id AND la.constraints->>'kind'='symbolic_program'
      JOIN public.learning_lessons l ON l.id=la.lesson_id AND l.course_id=${courseId}::uuid
      WHERE se.requested_by_user_id=${user.vistaUserId}::uuid AND se.verdict='passed'
      GROUP BY l.id`;
    const physical = await this.prisma.$queryRaw<EvidenceRow[]>`
      SELECT l5.id AS lesson_id,MIN(COALESCE(e.ended_at,e.created_at)) AS completed_at
      FROM public.learning_experiments e
      JOIN public.learning_submissions s ON s.id=e.submission_id AND s.learner_user_id=e.learner_user_id
        AND s.program_version_id::text=e.input_snapshot->>'programVersionId'
      JOIN public.learning_assignments la ON la.id=s.assignment_id
      JOIN public.learning_lessons l4 ON l4.id=la.lesson_id AND l4.ordinal=4 AND l4.course_id=${courseId}::uuid
      JOIN public.learning_lessons l5 ON l5.course_id=l4.course_id AND l5.ordinal=5
      JOIN public.learning_symbolic_evaluations se ON se.submission_id=s.id AND se.program_version_id=s.program_version_id
        AND se.requested_by_user_id=e.learner_user_id AND se.verdict='passed'
      JOIN public.learning_experiments schematic ON schematic.id=se.experiment_id
        AND schematic.learner_user_id=e.learner_user_id
        AND schematic.status='succeeded' AND schematic.execution_mode='schematic'
      WHERE e.learner_user_id=${user.vistaUserId}::uuid AND e.execution_mode='real_robot'
        AND e.status='succeeded' AND e.output_snapshot->>'state'='succeeded'
      GROUP BY l5.id`;

    const completed = new Map<string, Date>();
    for (const row of self) completed.set(row.activity_id, row.completed_at);
    for (const row of quizzes) completed.set(`${row.lesson_id}-knowledge-check`, row.completed_at);
    for (const row of simulations) completed.set(`${row.lesson_id}-simulation`, row.completed_at);
    for (const row of physical) completed.set(`${row.lesson_id}-physical`, row.completed_at);
    return {
      courseId,
      activities: lessons.flatMap((lesson) => activityIdsForLesson(lesson.id, lesson.ordinal).map((activityId) => ({
        activityId,
        status: completed.has(activityId) ? 'completed' as const : 'not_started' as const,
        completedAt: completed.get(activityId) ?? null,
      }))),
    };
  }

  async completeSelfReport(user: AuthenticatedUser, activityId: string): Promise<ActivityProgressItem> {
    if (user.status !== 'active') throw new NotFoundException('Activity was not found.');
    if (uuidPattern.test(activityId)) return this.completePublishedSelfReport(user, activityId);
    const match = activityIdPattern.exec(activityId);
    if (!match || !selfReportSuffixes.has(match[2])) throw new BadRequestException('This activity cannot be self-completed.');
    const lessonId = match[1];
    const lessons = await this.prisma.$queryRaw<LessonDefinition[]>`
      SELECT l.id,l.course_id,l.ordinal,EXISTS (
        SELECT 1 FROM public.learning_lessons first
        WHERE first.course_id=l.course_id AND first.ordinal=1
          AND first.content->'courseOverview'->>'label'='Course 1'
      ) AS legacy_course FROM public.learning_lessons l WHERE l.id=${lessonId}::uuid`;
    const lesson = lessons[0];
    if (!lesson || lesson.legacy_course === false || !activityIdsForLesson(lesson.id, lesson.ordinal).includes(activityId)) throw new NotFoundException('Activity was not found.');
    const path = await this.progression.coursePath(user, lesson.course_id!);
    const accessible = path.lessons.find((item) => item.id === lesson.id);
    if (!accessible) throw new NotFoundException('Activity was not found.');
    if (accessible.status === 'locked') throw new ConflictException('Lesson prerequisites are not satisfied.');
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.$queryRaw<SelfProgressRow[]>`
        INSERT INTO public.learning_activity_progress(learner_user_id,lesson_id,activity_id,status,completion_method,completed_at)
        VALUES(${user.vistaUserId}::uuid,${lesson.id}::uuid,${activityId},'completed','self_report',now())
        ON CONFLICT (learner_user_id,activity_id) DO UPDATE SET
          completed_at=COALESCE(learning_activity_progress.completed_at,EXCLUDED.completed_at)
        RETURNING activity_id,completed_at`;
      if (!saved[0]) throw new ConflictException('Activity progress could not be saved.');
      return saved[0];
    });
    return { activityId: row.activity_id, status: 'completed', completedAt: row.completed_at };
  }

  private async completePublishedSelfReport(user: AuthenticatedUser, activityId: string): Promise<ActivityProgressItem> {
    const rows = await this.prisma.$queryRaw<PublishedActivity[]>`
      SELECT a.id,a.type,s.lesson_id,l.course_id FROM public.learning_activities a
      JOIN public.learning_sections s ON s.id=a.section_id
      JOIN public.learning_lessons l ON l.id=s.lesson_id
      WHERE a.id=${activityId}::uuid AND a.status='published' AND s.status='published'`;
    const activity = rows[0];
    if (!activity) throw new NotFoundException('Activity was not found.');
    if (activity.type !== 'reading' && activity.type !== 'demonstration') throw new BadRequestException('This activity cannot be self-completed.');
    const path = await this.progression.coursePath(user, activity.course_id!);
    const lesson = path.lessons.find((item) => item.id === activity.lesson_id);
    if (!lesson) throw new NotFoundException('Activity was not found.');
    if (lesson.status === 'locked') throw new ConflictException('Lesson prerequisites are not satisfied.');
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.$queryRaw<SelfProgressRow[]>`
        INSERT INTO public.learning_activity_progress(learner_user_id,lesson_id,activity_id,activity_definition_id,status,completion_method,completed_at)
        VALUES(${user.vistaUserId}::uuid,${activity.lesson_id}::uuid,${activityId},${activityId}::uuid,'completed','self_report',now())
        ON CONFLICT (learner_user_id,activity_id) DO UPDATE SET
          completed_at=COALESCE(learning_activity_progress.completed_at,EXCLUDED.completed_at)
        RETURNING activity_id,completed_at`;
      if (!saved[0]) throw new ConflictException('Activity progress could not be saved.');
      return saved[0];
    });
    return { activityId: row.activity_id, status: 'completed', completedAt: row.completed_at };
  }
}
