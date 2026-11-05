import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, learning_question_versions } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { AddAssignmentQuestionDto, CreateQuestionDto, ObjectiveMappingDto, QuestionSearchDto, ReorderAssignmentQuestionsDto, UpdateVersionDto, VersionContentDto } from './dto/question-bank.dto';

const cognitiveLevels = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
type Content = VersionContentDto;

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  private async authorOrg(user: AuthenticatedUser, organizationId: string): Promise<void> {
    if (user.status !== 'active') throw new NotFoundException('Question was not found.');
    if (user.systemPermissions.includes('org.manage')) return;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM public.memberships m
      JOIN public.role_permissions rp ON rp.role_id=m.role_id
      JOIN public.permissions p ON p.id=rp.permission_id
      WHERE m.user_id=${user.vistaUserId}::uuid AND m.organization_id=${organizationId}::uuid
        AND m.status='active' AND p.code='learning.delivery.manage' LIMIT 1`;
    if (!rows.length) throw new NotFoundException('Question was not found.');
  }

  private publisher(user: AuthenticatedUser): void {
    if (user.status !== 'active' || !user.systemPermissions.includes('org.manage')) {
      throw new NotFoundException('Question was not found.');
    }
  }

  private async question(user: AuthenticatedUser, id: string) {
    const q = await this.prisma.learning_questions.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question was not found.');
    await this.authorOrg(user, q.organization_id);
    return q;
  }

  private async version(user: AuthenticatedUser, id: string) {
    const v = await this.prisma.learning_question_versions.findUnique({ where: { id }, include: { question: true } });
    if (!v) throw new NotFoundException('Question version was not found.');
    await this.authorOrg(user, v.question.organization_id);
    return v;
  }

  async createQuestion(user: AuthenticatedUser, input: CreateQuestionDto) {
    await this.authorOrg(user, input.organizationId);
    const lesson = await this.prisma.learning_lessons.findUnique({ where: { id: input.lessonId }, include: { learning_courses: true } });
    if (!lesson || lesson.course_id !== input.courseId || lesson.learning_courses.organization_id !== input.organizationId) {
      throw new BadRequestException('Lesson, course and organization must match.');
    }
    if (!input.code.trim()) throw new BadRequestException('Question code is required.');
    try {
      return await this.prisma.learning_questions.create({ data: {
        organization_id: input.organizationId, code: input.code.trim(), course_id: input.courseId,
        lesson_id: input.lessonId, domain: input.domain?.trim() || null, created_by: user.vistaUserId,
      } });
    } catch (error) {
      if (this.unique(error)) throw new ConflictException('Question code already exists in this organization.');
      throw error;
    }
  }

  async list(user: AuthenticatedUser, query: QuestionSearchDto) {
    await this.authorOrg(user, query.organizationId);
    const where: Prisma.learning_questionsWhereInput = {
      organization_id: query.organizationId,
      ...(query.courseId ? { course_id: query.courseId } : {}),
      ...(query.lessonId ? { lesson_id: query.lessonId } : {}),
      ...(query.search ? { OR: [{ code: { contains: query.search, mode: 'insensitive' } }, { domain: { contains: query.search, mode: 'insensitive' } }] } : {}),
      ...(query.status ? { versions: { some: { status: query.status } } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.learning_questions.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.learning_questions.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(user: AuthenticatedUser, id: string) {
    return this.question(user, id);
  }

  async history(user: AuthenticatedUser, questionId: string) {
    await this.question(user, questionId);
    return this.prisma.learning_question_versions.findMany({ where: { question_id: questionId }, orderBy: { version_number: 'asc' }, include: { objectives: true } });
  }

  async createVersion(user: AuthenticatedUser, questionId: string, input: VersionContentDto) {
    await this.question(user, questionId);
    this.validateContent(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_questions WHERE id=${questionId}::uuid FOR UPDATE`;
      const latest = await tx.learning_question_versions.findFirst({ where: { question_id: questionId }, orderBy: { version_number: 'desc' }, select: { version_number: true } });
      return tx.learning_question_versions.create({ data: {
        question_id: questionId, version_number: (latest?.version_number ?? 0) + 1,
        type: input.type, difficulty: input.difficulty, cognitive_level: input.cognitiveLevel,
        stem: input.stem.trim(), options: input.options as unknown as Prisma.InputJsonValue,
        answer_key: input.answerKey, explanation: input.explanation?.trim() || null,
        source_reference: input.sourceReference?.trim() || null, authored_by: user.vistaUserId,
      } });
    });
  }

  async updateDraft(user: AuthenticatedUser, versionId: string, input: UpdateVersionDto) {
    const current = await this.version(user, versionId);
    if (current.status !== 'draft') throw new ConflictException('Only draft versions may be edited.');
    const merged: Content = {
      type: input.type ?? current.type, difficulty: input.difficulty ?? current.difficulty,
      cognitiveLevel: input.cognitiveLevel ?? current.cognitive_level, stem: input.stem ?? current.stem,
      options: input.options ?? current.options as unknown as Content['options'],
      answerKey: input.answerKey ?? current.answer_key as unknown as string[],
      explanation: input.explanation ?? current.explanation ?? undefined,
      sourceReference: input.sourceReference ?? current.source_reference ?? undefined,
    };
    this.validateContent(merged);
    const changed = await this.prisma.learning_question_versions.updateMany({ where: { id: versionId, status: 'draft' }, data: {
      type: merged.type, difficulty: merged.difficulty, cognitive_level: merged.cognitiveLevel,
      stem: merged.stem.trim(), options: merged.options as unknown as Prisma.InputJsonValue,
      answer_key: merged.answerKey, explanation: merged.explanation?.trim() || null,
      source_reference: merged.sourceReference?.trim() || null, updated_at: new Date(),
    } });
    if (!changed.count) throw new ConflictException('Version state changed.');
    return this.prisma.learning_question_versions.findUniqueOrThrow({ where: { id: versionId } });
  }

  async mapObjectives(user: AuthenticatedUser, versionId: string, input: ObjectiveMappingDto) {
    const v = await this.version(user, versionId);
    if (v.status !== 'draft') throw new ConflictException('Only draft objectives may be edited.');
    const found = await this.prisma.learning_objectives.findMany({ where: { id: { in: input.objectiveIds }, lesson_id: v.question.lesson_id }, select: { id: true } });
    if (found.length !== input.objectiveIds.length) throw new BadRequestException('Learning Outcomes must belong to the question lesson.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_question_versions WHERE id=${versionId}::uuid FOR UPDATE`;
      const state = await tx.learning_question_versions.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } });
      if (state.status !== 'draft') throw new ConflictException('Version state changed.');
      await tx.learning_question_version_objectives.deleteMany({ where: { question_version_id: versionId } });
      await tx.learning_question_version_objectives.createMany({ data: input.objectiveIds.map((objective_id) => ({ question_version_id: versionId, objective_id })) });
      return tx.learning_question_version_objectives.findMany({ where: { question_version_id: versionId } });
    });
  }

  async submitReview(user: AuthenticatedUser, versionId: string) {
    const v = await this.version(user, versionId);
    if (v.status !== 'draft') throw new ConflictException('Only a draft may enter review.');
    const changed = await this.prisma.learning_question_versions.updateMany({ where: { id: versionId, status: 'draft' }, data: { status: 'in_review', updated_at: new Date() } });
    if (!changed.count) throw new ConflictException('Version state changed.');
    return { id: versionId, status: 'in_review' };
  }

  async publish(user: AuthenticatedUser, versionId: string) {
    this.publisher(user);
    const v = await this.version(user, versionId);
    if (v.status !== 'in_review') throw new ConflictException('Only an in-review version may be published.');
    this.validateContent(this.toContent(v), true);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_question_versions WHERE id=${versionId}::uuid FOR UPDATE`;
      const state = await tx.learning_question_versions.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } });
      if (state.status !== 'in_review') throw new ConflictException('Version state changed.');
      const count = await tx.learning_question_version_objectives.count({ where: { question_version_id: versionId } });
      if (!count) throw new BadRequestException('At least one Learning Outcome is required before publishing.');
      return tx.learning_question_versions.update({ where: { id: versionId }, data: {
        status: 'published', reviewed_by: user.vistaUserId, published_by: user.vistaUserId, updated_at: new Date(),
      } });
    });
  }

  async archive(user: AuthenticatedUser, versionId: string) {
    this.publisher(user);
    const v = await this.version(user, versionId);
    if (v.status !== 'published') throw new ConflictException('Only a published version may be archived.');
    const changed = await this.prisma.learning_question_versions.updateMany({ where: { id: versionId, status: 'published' }, data: { status: 'archived', updated_at: new Date() } });
    if (!changed.count) throw new ConflictException('Version state changed.');
    return { id: versionId, status: 'archived' };
  }

  private async assignment(user: AuthenticatedUser, id: string) {
    const a = await this.prisma.learning_assignments.findUnique({ where: { id }, include: { learning_lessons: { include: { learning_courses: true } } } });
    if (!a || !a.learning_lessons.learning_courses.organization_id) throw new NotFoundException('Assignment was not found.');
    await this.authorOrg(user, a.learning_lessons.learning_courses.organization_id);
    const first = await this.prisma.learning_lessons.findFirst({ where: { course_id: a.learning_lessons.course_id, ordinal: 1 }, select: { content: true } });
    if ((first?.content as Record<string, any> | undefined)?.courseOverview?.label === 'Course 1') throw new ConflictException('Course 1 uses the existing quiz.');
    return a;
  }

  private async assertMutableAssignment(id: string) {
    const delivered = await this.prisma.learning_classroom_assignments.findFirst({ where: { assignment_id: id, OR: [{ status: { not: 'draft' } }, { learning_assignment_attempts: { some: {} } }] }, select: { id: true } });
    if (delivered) throw new ConflictException('Delivered assignment questions are pinned.');
  }

  async assignmentQuestions(user: AuthenticatedUser, assignmentId: string) {
    const a = await this.assignment(user, assignmentId);
    const [items, objectives] = await Promise.all([
      this.prisma.learning_assignment_question_versions.findMany({ where: { assignment_id: assignmentId }, orderBy: { ordinal: 'asc' }, include: { version: { include: { objectives: true } } } }),
      this.prisma.learning_objectives.findMany({ where: { lesson_id: a.lesson_id }, select: { id: true } }),
    ]);
    const covered = new Set(items.flatMap((item) => item.version.objectives.map((mapping) => mapping.objective_id)));
    return { items, coveredObjectiveIds: objectives.filter((objective) => covered.has(objective.id)).map((objective) => objective.id), missingObjectiveIds: objectives.filter((objective) => !covered.has(objective.id)).map((objective) => objective.id) };
  }

  async addToAssignment(user: AuthenticatedUser, assignmentId: string, input: AddAssignmentQuestionDto) {
    const a = await this.assignment(user, assignmentId);
    await this.assertMutableAssignment(assignmentId);
    const v = await this.version(user, input.questionVersionId);
    if (v.question.lesson_id !== a.lesson_id || v.status !== 'published') throw new BadRequestException('Assignment requires a published question from its lesson.');
    const mapped = await this.prisma.learning_question_version_objectives.count({ where: { question_version_id: v.id } });
    if (!mapped) throw new BadRequestException('Question must cover a Learning Outcome.');
    try {
      return await this.prisma.learning_assignment_question_versions.create({ data: { assignment_id: assignmentId, question_id: v.question_id, question_version_id: v.id, ordinal: input.ordinal, points: input.points } });
    } catch (error) {
      if (this.unique(error)) throw new ConflictException('Question or ordinal already exists in this assignment.');
      throw error;
    }
  }

  async removeFromAssignment(user: AuthenticatedUser, assignmentId: string, versionId: string) {
    await this.assignment(user, assignmentId);
    await this.assertMutableAssignment(assignmentId);
    const removed = await this.prisma.learning_assignment_question_versions.deleteMany({ where: { assignment_id: assignmentId, question_version_id: versionId } });
    if (!removed.count) throw new NotFoundException('Assignment question was not found.');
    return { removed: true };
  }

  async reorderAssignment(user: AuthenticatedUser, assignmentId: string, input: ReorderAssignmentQuestionsDto) {
    await this.assignment(user, assignmentId);
    await this.assertMutableAssignment(assignmentId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_assignments WHERE id=${assignmentId}::uuid FOR UPDATE`;
      const rows = await tx.learning_assignment_question_versions.findMany({ where: { assignment_id: assignmentId }, select: { question_version_id: true } });
      if (rows.length !== input.orderedVersionIds.length || rows.some((r) => !input.orderedVersionIds.includes(r.question_version_id))) throw new BadRequestException('Order must contain every assigned question exactly once.');
      await tx.$executeRaw`SET CONSTRAINTS learning_assignment_question_versions_assignment_id_ordinal_key DEFERRED`;
      for (let i = 0; i < input.orderedVersionIds.length; i++) {
        await tx.learning_assignment_question_versions.update({ where: { assignment_id_question_version_id: { assignment_id: assignmentId, question_version_id: input.orderedVersionIds[i] } }, data: { ordinal: i + 1 } });
      }
      return tx.learning_assignment_question_versions.findMany({ where: { assignment_id: assignmentId }, orderBy: { ordinal: 'asc' } });
    });
  }

  private toContent(v: learning_question_versions): Content {
    return { type: v.type, difficulty: v.difficulty, cognitiveLevel: v.cognitive_level, stem: v.stem,
      options: v.options as unknown as Content['options'], answerKey: v.answer_key as unknown as string[],
      explanation: v.explanation ?? undefined, sourceReference: v.source_reference ?? undefined };
  }

  private validateContent(input: Content, publishing = false) {
    if (!['single_choice', 'multiple_choice', 'true_false'].includes(input.type) || !['easy', 'medium', 'hard'].includes(input.difficulty) || !cognitiveLevels.includes(input.cognitiveLevel)) throw new BadRequestException('Question classification is invalid.');
    if (!input.stem?.trim() || !Array.isArray(input.options) || input.options.length < 2 || !Array.isArray(input.answerKey)) throw new BadRequestException('Question content is incomplete.');
    const ids = input.options.map((o) => o?.id);
    if (input.options.some((o) => !o || typeof o.id !== 'string' || !o.id.trim() || typeof o.text !== 'string' || !o.text.trim()) || new Set(ids).size !== ids.length) throw new BadRequestException('Option IDs and text must be unique and nonempty.');
    if (!input.answerKey.length || new Set(input.answerKey).size !== input.answerKey.length || input.answerKey.some((id) => !ids.includes(id))) throw new BadRequestException('Answer key references invalid options.');
    if (input.type === 'multiple_choice' ? input.answerKey.length < 2 : input.answerKey.length !== 1) throw new BadRequestException('Answer count does not match question type.');
    if (input.type === 'true_false' && (input.options.length !== 2 || new Set(ids).size !== 2 || !ids.includes('true') || !ids.includes('false'))) throw new BadRequestException('True/False requires options with IDs true and false.');
    if (publishing && !input.explanation?.trim()) throw new BadRequestException('Explanation is required before publishing.');
  }

  private unique(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }
}
