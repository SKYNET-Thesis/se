import { normalizeAssignmentAcademic } from './course-academic';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { ReplaceRubricDto, UpdateAssignmentAcademicDto, UpdateScheduleDto } from './dto/assignment-config.dto';
import { LearningScopeService } from './learning-scope.service';

/** Instructor-side configuration of a delivered (non-quiz) assignment: rubric criteria and delivery schedule. */
@Injectable()
export class AssignmentConfigService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  /** Every classroom the assignment is delivered to must be manageable by the caller (rubrics are per assignment, not per delivery). */
  private async authorize(user: AuthenticatedUser, classroomId: string, assignmentId: string) {
    const rows = await this.prisma.$queryRaw<{ classroom_id: string; constraints: unknown }[]>`
      SELECT ca.classroom_id,a.constraints FROM public.learning_classroom_assignments ca JOIN public.learning_assignments a ON a.id=ca.assignment_id WHERE ca.assignment_id=${assignmentId}::uuid`;
    if (!rows.some((r) => r.classroom_id === classroomId)) throw new NotFoundException('Assignment was not found.');
    for (const id of new Set(rows.map((r) => r.classroom_id))) await this.scope.assertTeacherClassroomAccess(user, id);
    return { isQuiz: (rows[0].constraints as { kind?: string } | null)?.kind === 'knowledge_check' };
  }

  /** Academic classification, independent of the course level: difficulty, type, pass score, grading method and objectives. */
  async getAcademic(user: AuthenticatedUser, classroomId: string, assignmentId: string) {
    await this.authorize(user, classroomId, assignmentId);
    const rows = await this.prisma.$queryRaw<Array<{ difficulty: string | null; assignment_type: string | null; pass_score: string | null; grading_method: string | null; learning_objectives: unknown; max_score: string | null }>>`
      SELECT a.difficulty,a.assignment_type,a.pass_score,a.grading_method,a.learning_objectives,(SELECT SUM(max_points) FROM public.learning_rubric_criteria WHERE assignment_id=a.id) AS max_score
      FROM public.learning_assignments a WHERE a.id=${assignmentId}::uuid`;
    const r = rows[0];
    return { assignmentId, difficulty: r.difficulty, assignmentType: r.assignment_type, passScore: r.pass_score === null ? null : Number(r.pass_score), gradingMethod: r.grading_method,
      learningObjectives: Array.isArray(r.learning_objectives) ? r.learning_objectives : [], maxScore: r.max_score === null ? null : Number(r.max_score) };
  }

  async updateAcademic(user: AuthenticatedUser, classroomId: string, assignmentId: string, dto: UpdateAssignmentAcademicDto) {
    await this.authorize(user, classroomId, assignmentId);
    const data = normalizeAssignmentAcademic(dto);
    // Owner policy 2026-11-28: no NEW mixed-grading configuration until a grading formula is approved. An assignment that is already `mixed` keeps it (and may be re-saved).
    if (data.grading_method === 'mixed') {
      const current = await this.prisma.$queryRaw<{ grading_method: string | null }[]>`SELECT grading_method FROM public.learning_assignments WHERE id=${assignmentId}::uuid`;
      if (current[0]?.grading_method !== 'mixed') throw new ConflictException({ code: 'MIXED_GRADING_NOT_AVAILABLE', message: 'Automatic + manual (mixed) grading cannot be newly configured until its grading formula is approved. Choose Automatic or Manual.' });
    }
    const maxRows = await this.prisma.$queryRaw<{ max_score: string | null }[]>`SELECT SUM(max_points) AS max_score FROM public.learning_rubric_criteria WHERE assignment_id=${assignmentId}::uuid`;
    const maxScore = maxRows[0]?.max_score === null || maxRows[0]?.max_score === undefined ? null : Number(maxRows[0].max_score);
    if (data.pass_score !== undefined && data.pass_score !== null && maxScore !== null && data.pass_score > maxScore) throw new BadRequestException(`Pass score cannot exceed the maximum score (${maxScore}).`);
    await this.prisma.learning_assignments.update({ where: { id: assignmentId }, data });
    return this.getAcademic(user, classroomId, assignmentId);
  }

  async getRubric(user: AuthenticatedUser, classroomId: string, assignmentId: string) {
    const { isQuiz } = await this.authorize(user, classroomId, assignmentId);
    const criteria = await this.prisma.$queryRaw<Array<{ id: string; title: string; description: string | null; maxPoints: number; ordinal: number }>>`
      SELECT id,title,description,max_points::float AS "maxPoints",ordinal FROM public.learning_rubric_criteria WHERE assignment_id=${assignmentId}::uuid ORDER BY ordinal`;
    const scored = await this.prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM public.learning_assessment_scores s JOIN public.learning_rubric_criteria c ON c.id=s.criterion_id WHERE c.assignment_id=${assignmentId}::uuid`;
    const locked = scored[0].n > 0;
    return { assignmentId, criteria, editable: !isQuiz && !locked, lockedReason: isQuiz ? 'Quizzes are machine-graded and have no rubric.' : locked ? 'Submissions have already been scored against this rubric.' : null, totalPoints: criteria.reduce((sum, c) => sum + Number(c.maxPoints), 0) };
  }

  async replaceRubric(user: AuthenticatedUser, classroomId: string, assignmentId: string, dto: ReplaceRubricDto) {
    const { isQuiz } = await this.authorize(user, classroomId, assignmentId);
    if (isQuiz) throw new ConflictException({ code: 'QUIZ_HAS_NO_RUBRIC', message: 'Quizzes are machine-graded and have no rubric.' });
    const titles = dto.criteria.map((c) => c.title.trim().toLowerCase());
    if (titles.some((t) => !t) || new Set(titles).size !== titles.length) throw new BadRequestException('Criterion titles must be non-empty and distinct.');
    if (dto.criteria.some((c) => c.maxPoints > 1000)) throw new BadRequestException('A criterion may be worth at most 1000 points.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_assignments WHERE id=${assignmentId}::uuid FOR UPDATE`;
      const scored = await tx.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM public.learning_assessment_scores s JOIN public.learning_rubric_criteria c ON c.id=s.criterion_id WHERE c.assignment_id=${assignmentId}::uuid`;
      if (scored[0].n > 0) throw new ConflictException({ code: 'RUBRIC_IN_USE', message: 'Submissions have already been scored against this rubric, so it can no longer be changed.' });
      await tx.$executeRaw`DELETE FROM public.learning_rubric_criteria WHERE assignment_id=${assignmentId}::uuid`;
      for (const [i, c] of dto.criteria.entries()) {
        await tx.$executeRaw`INSERT INTO public.learning_rubric_criteria(assignment_id,ordinal,title,description,max_points) VALUES(${assignmentId}::uuid,${i + 1},${c.title.trim()},${c.description?.trim() || null},${c.maxPoints})`;
      }
    });
    return this.getRubric(user, classroomId, assignmentId);
  }

  async updateSchedule(user: AuthenticatedUser, classroomId: string, assignmentId: string, dto: UpdateScheduleDto) {
    await this.authorize(user, classroomId, assignmentId);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; status: string; available_from: Date | null; due_at: Date | null; close_at: Date | null; max_attempts: number | null }[]>`
        SELECT id,status,available_from,due_at,close_at,max_attempts FROM public.learning_classroom_assignments WHERE classroom_id=${classroomId}::uuid AND assignment_id=${assignmentId}::uuid FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new NotFoundException('Assignment was not found.');
      if (current.status === 'closed' || current.status === 'archived') throw new ConflictException({ code: 'DELIVERY_NOT_EDITABLE', message: 'A closed or archived delivery cannot be rescheduled.' });
      const pick = <K extends keyof UpdateScheduleDto>(key: K, existing: Date | null) => (dto[key] === undefined ? existing : dto[key] === null ? null : new Date(dto[key] as string));
      const availableFrom = pick('availableFrom', current.available_from), dueAt = pick('dueAt', current.due_at), closeAt = pick('closeAt', current.close_at);
      if (availableFrom && dueAt && availableFrom > dueAt) throw new BadRequestException('The due date must be after the opening date.');
      if (dueAt && closeAt && dueAt > closeAt) throw new BadRequestException('The closing date must not be before the due date.');
      if (availableFrom && closeAt && availableFrom >= closeAt) throw new BadRequestException('The closing date must be after the opening date.');
      const maxAttempts = dto.maxAttempts === undefined ? current.max_attempts : dto.maxAttempts;
      const updated = await tx.$queryRaw<Record<string, unknown>[]>`
        UPDATE public.learning_classroom_assignments SET available_from=${availableFrom},due_at=${dueAt},close_at=${closeAt},max_attempts=${maxAttempts}
        WHERE id=${current.id}::uuid RETURNING id,classroom_id,assignment_id,status,available_from,due_at,close_at,max_attempts`;
      return updated[0];
    });
  }
}
