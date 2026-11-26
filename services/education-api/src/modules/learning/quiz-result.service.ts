import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { AnalyticsObjective, AnalyticsQuestion, ReviewTarget, buildQuizAnalytics, buildRecommendations } from './quiz-analytics';

interface AttemptRow { id: string; status: string; workspace_snapshot: unknown; result_snapshot: unknown; score: unknown; submitted_at: Date | null; grading_released_at: Date | null; lesson_id: string | null }
interface MetaRow { id: string; difficulty: string | null; domain: string | null; objectives: AnalyticsObjective[] | null }
interface TargetRow { objective_id: string; course_id: string; lesson_id: string; lesson_title: string; section_id: string | null; section_title: string | null; activity_id: string | null; activity_title: string | null }
type Snapshot = { kind?: string; questions?: Array<{ questionVersionId: string; ordinal: number; type: string; points: number }>; passPercent?: number };
type Result = { kind?: string; score?: number; passed?: boolean; passPercent?: number; earnedPoints?: number; possiblePoints?: number; feedback?: Array<{ questionVersionId: string; correct: boolean; earnedPoints: number; possiblePoints: number }> };

/**
 * Student quiz-result analytics (read-only). The server is authoritative: the PASS/FAIL, score and per-question outcomes are the ones recorded at
 * grading; this service only aggregates them with immutable question-version metadata. It never returns answer keys and never regrades.
 */
@Injectable()
export class QuizResultService {
  constructor(private readonly prisma: PrismaService) {}

  async result(user: AuthenticatedUser, attemptId: string) {
    const rows = await this.prisma.$queryRaw<AttemptRow[]>`
      SELECT a.id, a.status, a.workspace_snapshot, a.result_snapshot, a.score, a.submitted_at, a.grading_released_at, la.lesson_id
      FROM public.learning_assignment_attempts a
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
      LEFT JOIN public.learning_assignments la ON la.id=ca.assignment_id
      WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid`;
    const attempt = rows[0];
    const snapshot = attempt?.workspace_snapshot as Snapshot | undefined;
    if (!attempt || snapshot?.kind !== 'question_bank_quiz') throw new NotFoundException('Quiz attempt was not found.');
    const result = attempt.result_snapshot as Result | null;
    if (attempt.status !== 'evaluated' || !result || result.kind !== 'question_bank_quiz_result' || !attempt.grading_released_at) throw new ConflictException('This quiz attempt has no released result yet.');
    if (!Array.isArray(snapshot.questions) || !Array.isArray(result.feedback)) throw new ConflictException('Quiz result integrity check failed.');

    const outcome = new Map(result.feedback.map((f) => [f.questionVersionId, f]));
    const versionIds = snapshot.questions.map((x) => x.questionVersionId);
    const meta = new Map((await this.prisma.$queryRaw<MetaRow[]>`
      SELECT v.id, v.difficulty, q.domain,
        COALESCE(json_agg(json_build_object('id', o.id, 'code', o.code, 'description', o.description) ORDER BY o.code) FILTER (WHERE o.id IS NOT NULL), '[]'::json) AS objectives
      FROM public.learning_question_versions v
      JOIN public.learning_questions q ON q.id=v.question_id
      LEFT JOIN public.learning_question_version_objectives vo ON vo.question_version_id=v.id
      LEFT JOIN public.learning_objectives o ON o.id=vo.objective_id
      WHERE v.id = ANY(${versionIds}::uuid[])
      GROUP BY v.id, q.domain`).map((m) => [m.id, m]));

    const questions: AnalyticsQuestion[] = snapshot.questions.map((x) => {
      const f = outcome.get(x.questionVersionId); const m = meta.get(x.questionVersionId);
      return { versionId: x.questionVersionId, ordinal: x.ordinal, type: x.type, difficulty: m?.difficulty ?? null, topic: m?.domain ?? null, objectives: m?.objectives ?? [],
        possiblePoints: Number(f?.possiblePoints ?? x.points), earnedPoints: Number(f?.earnedPoints ?? 0), correct: f?.correct === true, answered: !!f };
    });
    const analytics = buildQuizAnalytics(questions);
    const missedObjectiveIds = [...new Set(questions.filter((q) => q.answered && !q.correct).flatMap((q) => q.objectives.map((o) => o.id)))];
    const recommendations = buildRecommendations(questions, await this.targets(user, missedObjectiveIds));

    const passPercent = result.passPercent ?? snapshot.passPercent ?? null;
    const score = Number(result.score ?? attempt.score);
    return {
      attemptId: attempt.id,
      submittedAt: attempt.submitted_at,
      // PASS/FAIL is the one recorded at grading against the configured threshold; the rating below never changes it.
      passed: result.passed === true, passPercent, weightedScore: score,
      earnedPoints: Number(result.earnedPoints ?? analytics.overall.earnedPoints), possiblePoints: Number(result.possiblePoints ?? analytics.overall.possiblePoints),
      analytics, recommendations,
      gradingPolicy: 'Exact match: a question earns its full points only when the selected answers are exactly right; there is no partial credit.',
    };
  }

  /** Published content the learner can open (same access rule as the course path), per missed objective. Reading/video/demonstration only, never the quiz itself. */
  private async targets(user: AuthenticatedUser, objectiveIds: string[]): Promise<Map<string, ReviewTarget[]>> {
    const map = new Map<string, ReviewTarget[]>();
    if (!objectiveIds.length) return map;
    const rows = await this.prisma.$queryRaw<TargetRow[]>`
      SELECT o.id AS objective_id, c.id AS course_id, l.id AS lesson_id, l.title AS lesson_title,
             s.id AS section_id, s.title AS section_title, ac.id AS activity_id, ac.title AS activity_title
      FROM public.learning_objectives o
      JOIN public.learning_lessons l ON l.id=o.lesson_id
      JOIN public.learning_courses c ON c.id=l.course_id AND c.status='published'
      LEFT JOIN public.learning_activity_objectives lao ON lao.objective_id=o.id
      LEFT JOIN public.learning_activities ac ON ac.id=lao.activity_id AND ac.status='published' AND ac.type IN ('reading','video','demonstration')
      LEFT JOIN public.learning_sections s ON s.id=ac.section_id AND s.status='published' AND s.lesson_id=l.id
      WHERE o.id = ANY(${objectiveIds}::uuid[]) AND EXISTS (
        SELECT 1 FROM public.learning_enrollments e
        JOIN public.learning_course_offerings off ON e.offering_id=off.id AND off.course_id=c.id AND off.status='active'
        JOIN public.learning_classrooms classroom ON e.classroom_id=classroom.id AND classroom.offering_id=off.id AND classroom.status='active'
        JOIN public.learning_classroom_members cm ON cm.classroom_id=classroom.id AND cm.user_id=e.learner_user_id AND cm.classroom_role='student' AND cm.status='active'
        JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=e.learner_user_id AND m.organization_id=classroom.organization_id AND m.status='active'
        WHERE e.course_id=c.id AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active')
      ORDER BY o.id, s.ordinal NULLS LAST, ac.ordinal NULLS LAST`;
    for (const r of rows) {
      const sectionOk = r.section_id && r.activity_id;
      const target: ReviewTarget = { courseId: r.course_id, lessonId: r.lesson_id, lessonTitle: r.lesson_title, sectionId: sectionOk ? r.section_id : null, sectionTitle: sectionOk ? r.section_title : null, activityId: sectionOk ? r.activity_id : null, activityTitle: sectionOk ? r.activity_title : null };
      map.set(r.objective_id, [...(map.get(r.objective_id) ?? []), target]);
    }
    return map;
  }
}
