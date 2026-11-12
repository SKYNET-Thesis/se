import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { ProgressionService } from './progression.service';
import { activityIdsForLesson } from './activity-progress.service';
import { assertCourseNotArchived, assertCurriculumMutable } from './course-lifecycle';
import { validateActivityContent } from './activity-content.schema';
import { LearningMediaService } from './learning-media.service';
import { assertAssignmentMatchesActivityType, assignmentKind, PROGRAMMING_KIND, validProgrammingAssignment, type ProgrammingAssignmentInput } from './assignment-compat';

const activityTypes = new Set([
  'reading', 'video', 'demonstration', 'guided_practice', 'knowledge_check',
  'simulation', 'challenge', 'physical_lab', 'result', 'reflection',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ContentRef = { kind: 'lesson_content'; key: string } | { kind: 'assignment'; id: string } | { kind: 'none' };
type SectionInput = { title: string; ordinal: number };
type ActivityInput = { title: string; type: string; ordinal: number; required?: boolean; contentRef: unknown; content?: unknown; objectiveIds?: string[] };
type ActivityPatch = Partial<ActivityInput>;
type LessonRow = { id: string; course_id: string; ordinal: number; legacy_course: boolean };
type SectionRow = { id: string; title: string; ordinal: number };
type ActivityRow = { id: string; section_id: string; title: string; type: string; ordinal: number; required: boolean; content_ref: unknown; objectives: unknown; content: unknown };

@Injectable()
export class CurriculumService {
  constructor(private readonly prisma: PrismaService, private readonly progression: ProgressionService, private readonly media?: LearningMediaService) {}

  async lessonSections(user: AuthenticatedUser, lessonId: string) {
    const lesson = await this.lessonRow(lessonId);
    const path = await this.progression.coursePath(user, lesson.course_id);
    const accessible = path.lessons.find((item) => item.id === lessonId);
    if (!accessible) throw new NotFoundException('Lesson was not found.');
    if (accessible.status === 'locked') throw new ConflictException('Lesson prerequisites are not satisfied.');
    if (lesson.legacy_course) {
      return { lessonId, source: 'legacy', activityIds: activityIdsForLesson(lessonId, lesson.ordinal), sections: [] };
    }
    const sections = await this.prisma.$queryRaw<SectionRow[]>`
      SELECT id,title,ordinal FROM public.learning_sections
      WHERE lesson_id=${lessonId}::uuid AND status='published' ORDER BY ordinal`;
    const activities = await this.prisma.$queryRaw<ActivityRow[]>`
      SELECT a.id,a.section_id,a.title,a.type,a.ordinal,a.required,a.content_ref,a.content,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('code',o.code,'description',o.description) ORDER BY o.ordinal)
          FROM public.learning_activity_objectives ao JOIN public.learning_objectives o ON o.id=ao.objective_id
          WHERE ao.activity_id=a.id),'[]'::jsonb) AS objectives
      FROM public.learning_activities a JOIN public.learning_sections s ON s.id=a.section_id
      WHERE s.lesson_id=${lessonId}::uuid AND s.status='published' AND a.status='published'
      ORDER BY s.ordinal,a.ordinal`;
    return {
      lessonId, source: 'database',
      sections: sections.map((section) => ({ ...section, activities: activities.filter((activity) => activity.section_id === section.id).map(({ section_id, ...activity }) => activity) })),
    };
  }

  async authorSections(user: AuthenticatedUser, lessonId: string) {
    await this.authorLesson(user, lessonId);
    const sections = await this.prisma.learning_sections.findMany({ where: { lesson_id: lessonId }, orderBy: { ordinal: 'asc' }, include: { learning_activities: { orderBy: { ordinal: 'asc' }, include: { learning_activity_objectives: true } } } });
    const authoredContent = await this.prisma.$queryRaw<{ id: string; content: unknown }[]>`
      SELECT a.id,a.content FROM public.learning_activities a
      JOIN public.learning_sections s ON s.id=a.section_id WHERE s.lesson_id=${lessonId}::uuid`;
    const contentById = new Map(authoredContent.map((item) => [item.id, item.content]));
    return sections.map((item) => ({ ...item, learning_activities: item.learning_activities.map((activity) => ({ ...activity, content: contentById.get(activity.id) ?? {} })) }));
  }

  async createSection(user: AuthenticatedUser, lessonId: string, input: SectionInput) {
    const lesson = await this.authorLesson(user, lessonId);
    validTitle(input.title); validOrdinal(input.ordinal);
    await assertCurriculumMutable(this.prisma, lesson.course_id, 'Adding lesson sections');
    try {
      return await this.prisma.learning_sections.create({ data: { lesson_id: lessonId, title: input.title.trim(), ordinal: input.ordinal } });
    } catch (error) { throw uniqueConflict(error); }
  }

  async updateSection(user: AuthenticatedUser, sectionId: string, input: Partial<SectionInput>) {
    const section = await this.sectionForAuthor(user, sectionId);
    if (input.title !== undefined) validTitle(input.title);
    if (input.ordinal !== undefined) validOrdinal(input.ordinal);
    if (input.ordinal !== undefined && input.ordinal !== section.ordinal) await assertCurriculumMutable(this.prisma, section.course_id, 'Reordering sections');
    try {
      return await this.prisma.learning_sections.update({ where: { id: section.id }, data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.ordinal !== undefined ? { ordinal: input.ordinal } : {}), updated_at: new Date(),
      } });
    } catch (error) { throw uniqueConflict(error); }
  }

  async reorderSections(user: AuthenticatedUser, lessonId: string, orderedIds: string[]) {
    const lesson = await this.authorLesson(user, lessonId);
    validOrder(orderedIds);
    await assertCurriculumMutable(this.prisma, lesson.course_id, 'Reordering sections');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_lessons WHERE id=${lessonId}::uuid FOR UPDATE`;
      const existing = await tx.learning_sections.findMany({ where: { lesson_id: lessonId }, select: { id: true } });
      if (!sameIds(existing.map((row) => row.id), orderedIds)) throw new BadRequestException('Reorder must include every section exactly once.');
      // Prisma emits @@unique as a non-deferrable unique index. Move the
      // complete sibling set above the final range before filling it again.
      await tx.$executeRaw`UPDATE public.learning_sections SET ordinal=ordinal+${existing.length},updated_at=now()
        WHERE lesson_id=${lessonId}::uuid`;
      for (let index = 0; index < orderedIds.length; index += 1) {
        await tx.learning_sections.update({ where: { id: orderedIds[index] }, data: { ordinal: index + 1, updated_at: new Date() } });
      }
      return { lessonId, orderedIds };
    });
  }

  async setSectionStatus(user: AuthenticatedUser, sectionId: string, status: 'draft' | 'published') {
    const section = await this.sectionForAuthor(user, sectionId);
    await assertCurriculumMutable(this.prisma, section.course_id, 'Changing section publication status');
    if (status === 'draft' && section.status === 'published') {
      const evidence = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM public.learning_activity_progress p
        JOIN public.learning_activities a ON a.id=p.activity_definition_id
        WHERE a.section_id=${sectionId}::uuid
        UNION ALL
        SELECT att.id FROM public.learning_assignment_attempts att
        JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
        JOIN public.learning_activities a ON a.content_ref->>'kind'='assignment'
          AND a.content_ref->>'id'=ca.assignment_id::text
        WHERE a.section_id=${sectionId}::uuid LIMIT 1`;
      if (evidence.length) throw new ConflictException('A section with learner progress cannot be unpublished.');
    }
    return this.prisma.learning_sections.update({ where: { id: sectionId }, data: { status, updated_at: new Date() } });
  }

  async createActivity(user: AuthenticatedUser, sectionId: string, input: ActivityInput) {
    const section = await this.sectionForAuthor(user, sectionId);
    await assertCurriculumMutable(this.prisma, section.course_id, 'Adding section activities');
    validTitle(input.title); validOrdinal(input.ordinal); validType(input.type);
    const contentRef = validContentRef(input.contentRef);
    validTypeRef(input.type, contentRef);
    const content = input.content === undefined ? {} : (validateActivityContent(input.type, input.content) ?? {});
    await this.validateAssignmentRef(contentRef, section.lesson_id, input.type);
    const objectiveIds = await this.validObjectiveIds(input.objectiveIds ?? [], section.lesson_id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const activity = await tx.learning_activities.create({ data: {
          section_id: sectionId, title: input.title.trim(), type: input.type, ordinal: input.ordinal,
          required: input.required ?? true, content_ref: contentRef,
        } });
        await tx.$executeRaw`UPDATE public.learning_activities SET content=${JSON.stringify(content)}::jsonb WHERE id=${activity.id}::uuid`;
        if (objectiveIds.length) await tx.learning_activity_objectives.createMany({ data: objectiveIds.map((objective_id) => ({ activity_id: activity.id, objective_id })) });
        return { ...activity, content };
      });
    } catch (error) { throw uniqueConflict(error); }
  }

  async updateActivity(user: AuthenticatedUser, activityId: string, input: ActivityPatch) {
    const activity = await this.activityForAuthor(user, activityId);
    if (input.title !== undefined) validTitle(input.title);
    if (input.type !== undefined) validType(input.type);
    if (input.ordinal !== undefined) validOrdinal(input.ordinal);
    const meaningBearing = input.type !== undefined || input.contentRef !== undefined || input.required !== undefined
      || input.content !== undefined || input.objectiveIds !== undefined || (input.ordinal !== undefined && input.ordinal !== activity.ordinal);
    if (meaningBearing) await assertCurriculumMutable(this.prisma, activity.course_id, 'Changing activity definitions');
    const contentRef = input.contentRef === undefined ? undefined : validContentRef(input.contentRef);
    const content = input.content === undefined ? undefined : validateActivityContent(input.type ?? activity.type, input.content);
    const effectiveType = input.type ?? activity.type;
    const effectiveRef = contentRef ?? validContentRef(activity.content_ref);
    // Re-check the link whenever the reference or the activity type changes, so a type change cannot leave a mismatched assignment behind.
    if (contentRef || input.type !== undefined) await this.validateAssignmentRef(effectiveRef, activity.learning_sections.lesson_id, effectiveType);
    validTypeRef(effectiveType, effectiveRef);
    const objectiveIds = input.objectiveIds === undefined ? undefined : await this.validObjectiveIds(input.objectiveIds, activity.learning_sections.lesson_id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.learning_activities.update({ where: { id: activityId }, data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.ordinal !== undefined ? { ordinal: input.ordinal } : {}),
          ...(input.required !== undefined ? { required: input.required } : {}),
          ...(contentRef ? { content_ref: contentRef } : {}),
          updated_at: new Date(),
        } });
        if (content !== undefined) await tx.$executeRaw`UPDATE public.learning_activities SET content=${JSON.stringify(content)}::jsonb,updated_at=now() WHERE id=${activityId}::uuid`;
        if (objectiveIds) {
          await tx.learning_activity_objectives.deleteMany({ where: { activity_id: activityId } });
          if (objectiveIds.length) await tx.learning_activity_objectives.createMany({ data: objectiveIds.map((objective_id) => ({ activity_id: activityId, objective_id })) });
        }
        return content === undefined ? updated : { ...updated, content };
      });
    } catch (error) { throw uniqueConflict(error); }
  }

  async reorderActivities(user: AuthenticatedUser, sectionId: string, orderedIds: string[]) {
    const section = await this.sectionForAuthor(user, sectionId);
    validOrder(orderedIds);
    await assertCurriculumMutable(this.prisma, section.course_id, 'Reordering activities');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_sections WHERE id=${sectionId}::uuid FOR UPDATE`;
      const existing = await tx.learning_activities.findMany({ where: { section_id: sectionId }, select: { id: true } });
      if (!sameIds(existing.map((row) => row.id), orderedIds)) throw new BadRequestException('Reorder must include every activity exactly once.');
      // See section reordering above: these @@unique declarations are indexes,
      // so each sibling must leave the target range before reassignment.
      await tx.$executeRaw`UPDATE public.learning_activities SET ordinal=ordinal+${existing.length},updated_at=now()
        WHERE section_id=${sectionId}::uuid`;
      for (let index = 0; index < orderedIds.length; index += 1) {
        await tx.learning_activities.update({ where: { id: orderedIds[index] }, data: { ordinal: index + 1, updated_at: new Date() } });
      }
      return { sectionId, orderedIds };
    });
  }

  async setActivityStatus(user: AuthenticatedUser, activityId: string, status: 'draft' | 'published') {
    const activity = await this.activityForAuthor(user, activityId);
    await assertCurriculumMutable(this.prisma, activity.course_id, 'Changing activity publication status');
    if (status === 'published') {
      if (activity.type === 'physical_lab') throw new ConflictException('Physical labs require an approved course-specific evidence policy.');
      if (activity.type === 'video' || activity.type === 'reading') {
        if (!this.media) throw new ConflictException('Learning Media publishing is not configured.');
        const contentRows = await this.prisma.$queryRaw<Array<{ content: unknown }>>`SELECT content FROM public.learning_activities WHERE id=${activityId}::uuid`;
        const content = contentRows[0]?.content;
        if (activity.type === 'reading') {
          const reading = content as { blocks?: unknown[]; mediaIds?: unknown[] } | null;
          if (!(reading?.blocks?.length) && !(reading?.mediaIds?.length)) throw new ConflictException('Reading activity needs text or at least one attachment before publishing.');
        }
        await this.media.assertActivityMediaReady(activity.course_id, activity.type, content);
      }
      if (activity.learning_sections.status !== 'published') throw new ConflictException('Publish the section first.');
      const ref = validContentRef(activity.content_ref);
      if (ref.kind === 'none') throw new ConflictException('Published activity requires a content reference.');
      validTypeRef(activity.type, ref);
      await this.validateAssignmentRef(ref, activity.learning_sections.lesson_id, activity.type);
      if (activity.type === 'knowledge_check' && ref.kind === 'assignment') {
        const quiz = await this.prisma.$queryRaw<Array<{ question_count: number; quiz: boolean }>>`
          SELECT (SELECT COUNT(*)::int FROM public.learning_assignment_question_versions q WHERE q.assignment_id=a.id) AS question_count,
            a.constraints->>'kind'='knowledge_check' AS quiz
          FROM public.learning_assignments a WHERE a.id=${ref.id}::uuid AND a.lesson_id=${activity.learning_sections.lesson_id}::uuid`;
        if (!quiz[0]?.quiz || quiz[0].question_count < 1) throw new ConflictException('Canonical quiz needs at least one Question Bank question before it can be published.');
      }
    } else if (activity.status === 'published') {
      const evidence = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM public.learning_activity_progress WHERE activity_definition_id=${activityId}::uuid
        UNION ALL
        SELECT ca.id FROM public.learning_classroom_assignments ca
        JOIN public.learning_activities a ON a.content_ref->>'kind'='assignment' AND a.content_ref->>'id'=ca.assignment_id::text
        WHERE a.id=${activityId}::uuid AND ca.status='published'
        UNION ALL
        SELECT att.id FROM public.learning_assignment_attempts att
        JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
        JOIN public.learning_activities a ON a.content_ref->>'kind'='assignment' AND a.content_ref->>'id'=ca.assignment_id::text
        WHERE a.id=${activityId}::uuid LIMIT 1`;
      if (evidence.length) throw new ConflictException('An activity with learner progress cannot be unpublished.');
    }
    return this.prisma.learning_activities.update({ where: { id: activityId }, data: { status, updated_at: new Date() } });
  }

  private async lessonRow(lessonId: string): Promise<LessonRow> {
    const rows = await this.prisma.$queryRaw<LessonRow[]>`
      SELECT l.id,l.course_id,l.ordinal,EXISTS (
        SELECT 1 FROM public.learning_lessons first
        WHERE first.course_id=l.course_id AND first.ordinal=1
          AND first.content->'courseOverview'->>'label'='Course 1'
      ) AS legacy_course FROM public.learning_lessons l WHERE l.id=${lessonId}::uuid`;
    if (!rows[0]) throw new NotFoundException('Lesson was not found.');
    return rows[0];
  }

  private async authorLesson(user: AuthenticatedUser, lessonId: string): Promise<LessonRow> {
    if (user.status !== 'active') throw new NotFoundException('Lesson was not found.');
    const rows = await this.prisma.$queryRaw<LessonRow[]>`
      SELECT l.id,l.course_id,l.ordinal,EXISTS (
        SELECT 1 FROM public.learning_lessons first WHERE first.course_id=l.course_id
          AND first.ordinal=1 AND first.content->'courseOverview'->>'label'='Course 1'
      ) AS legacy_course
      FROM public.learning_lessons l JOIN public.learning_courses c ON c.id=l.course_id
      WHERE l.id=${lessonId}::uuid AND (
        ${user.systemPermissions.includes('org.manage')} OR EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.role_permissions rp ON rp.role_id=m.role_id
          JOIN public.permissions p ON p.id=rp.permission_id
          WHERE m.user_id=${user.vistaUserId}::uuid AND m.organization_id=c.organization_id
            AND m.status='active' AND p.code='learning.delivery.manage'
        )
      )`;
    const lesson = rows[0];
    if (!lesson) throw new NotFoundException('Lesson was not found.');
    if (lesson.legacy_course) throw new ConflictException('Course 1 uses the legacy activity adapter.');
    return lesson;
  }

  private async sectionForAuthor(user: AuthenticatedUser, sectionId: string) {
    const section = await this.prisma.learning_sections.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section was not found.');
    const lesson = await this.authorLesson(user, section.lesson_id);
    await assertCourseNotArchived(this.prisma, lesson.course_id, 'Changing lesson sections');
    return { ...section, course_id: lesson.course_id };
  }

  private async activityForAuthor(user: AuthenticatedUser, activityId: string) {
    const activity = await this.prisma.learning_activities.findUnique({ where: { id: activityId }, include: { learning_sections: true } });
    if (!activity) throw new NotFoundException('Activity was not found.');
    const lesson = await this.authorLesson(user, activity.learning_sections.lesson_id);
    await assertCourseNotArchived(this.prisma, lesson.course_id, 'Changing lesson activities');
    return { ...activity, course_id: lesson.course_id };
  }

  private async validObjectiveIds(ids: string[], lessonId: string): Promise<string[]> {
    if (!Array.isArray(ids) || ids.some((id) => !uuid.test(id)) || new Set(ids).size !== ids.length) throw new BadRequestException('Objective IDs are invalid.');
    if (!ids.length) return [];
    const found = await this.prisma.learning_objectives.findMany({ where: { id: { in: ids }, lesson_id: lessonId }, select: { id: true } });
    if (found.length !== ids.length) throw new BadRequestException('Objectives must belong to the activity lesson.');
    return ids;
  }

  private async validateAssignmentRef(ref: ContentRef, lessonId: string, type?: string) {
    if (ref.kind !== 'assignment') return;
    const rows = await this.prisma.$queryRaw<{ id: string; constraints: unknown }[]>`
      SELECT id,constraints FROM public.learning_assignments WHERE id=${ref.id}::uuid AND lesson_id=${lessonId}::uuid`;
    if (!rows.length) throw new BadRequestException('Referenced assignment must belong to the activity lesson.');
    if (type) assertAssignmentMatchesActivityType(type, rows[0].constraints);
  }

  // ---- Programming Assignment authoring (reuses learning_assignments; the activity stays `guided_practice`) ----

  /** The programming template linked to a guided_practice activity, or null while none is linked. */
  async programmingAssignment(user: AuthenticatedUser, activityId: string) {
    const activity = await this.programmingActivity(user, activityId);
    const ref = validContentRef(activity.content_ref);
    if (ref.kind !== 'assignment') return null;
    return this.programmingTemplate(ref.id, activity.learning_sections.lesson_id, this.prisma);
  }

  /** Creates the template on first save and links it to the activity; later saves edit it in place. */
  async saveProgrammingAssignment(user: AuthenticatedUser, activityId: string, input: ProgrammingAssignmentInput) {
    const activity = await this.programmingActivity(user, activityId);
    await assertCurriculumMutable(this.prisma, activity.course_id, 'Changing a programming assignment');
    const data = validProgrammingAssignment(input);
    const lessonId = activity.learning_sections.lesson_id;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.learning_activities WHERE id=${activityId}::uuid FOR UPDATE`;
      const current = await tx.learning_activities.findUnique({ where: { id: activityId }, select: { content_ref: true } });
      const ref = validContentRef(current?.content_ref);
      if (ref.kind === 'assignment') {
        const existing = await this.programmingTemplate(ref.id, lessonId, tx, true);
        const delivered = await tx.learning_classroom_assignments.findFirst({
          where: { assignment_id: ref.id, OR: [{ status: { not: 'draft' } }, { learning_assignment_attempts: { some: {} } }] }, select: { id: true } });
        if (delivered) throw new ConflictException('A delivered programming assignment cannot be edited.');
        await tx.learning_assignments.update({ where: { id: existing.id }, data: { title: data.title, instructions: data.instructions, allowed_blocks: data.allowedBlocks } });
        return this.programmingTemplate(existing.id, lessonId, tx);
      }
      const created = await tx.learning_assignments.create({ data: {
        lesson_id: lessonId, title: data.title, instructions: data.instructions,
        allowed_blocks: data.allowedBlocks, constraints: { kind: PROGRAMMING_KIND },
      } });
      await tx.learning_activities.update({ where: { id: activityId }, data: { content_ref: { kind: 'assignment', id: created.id }, updated_at: new Date() } });
      return this.programmingTemplate(created.id, lessonId, tx);
    });
  }

  private async programmingActivity(user: AuthenticatedUser, activityId: string) {
    const activity = await this.activityForAuthor(user, activityId);
    if (activity.type !== 'guided_practice') throw new BadRequestException('Programming assignments belong to Programming Assignment activities.');
    return activity;
  }

  private async programmingTemplate(id: string, lessonId: string, db: Pick<PrismaService, '$queryRaw'>, requireEditable = false) {
    const rows = await db.$queryRaw<Array<{ id: string; lesson_id: string; challenge_id: string | null; title: string; instructions: string; allowed_blocks: unknown; constraints: unknown }>>`
      SELECT id,lesson_id,challenge_id,title,instructions,allowed_blocks,constraints
      FROM public.learning_assignments WHERE id=${id}::uuid AND lesson_id=${lessonId}::uuid`;
    const row = rows[0];
    if (!row) throw new BadRequestException('Referenced assignment must belong to the activity lesson.');
    if (requireEditable && assignmentKind(row.constraints) !== PROGRAMMING_KIND) {
      throw new ConflictException('The linked assignment was not created as a programming assignment and cannot be edited here.');
    }
    return { id: row.id, lessonId: row.lesson_id, title: row.title, instructions: row.instructions, allowedBlocks: Array.isArray(row.allowed_blocks) ? row.allowed_blocks : [], challengeId: row.challenge_id, kind: assignmentKind(row.constraints) };
  }
}

function validTitle(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) throw new BadRequestException('Title is invalid.');
}
function validOrdinal(value: number) {
  if (!Number.isInteger(value) || value < 1) throw new BadRequestException('Ordinal must be a positive integer.');
}
function validType(value: string) {
  if (!activityTypes.has(value)) throw new BadRequestException('Activity type is invalid.');
}
function validContentRef(value: unknown): ContentRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Content reference is invalid.');
  const ref = value as Record<string, unknown>;
  const keys = Object.keys(ref).sort().join(',');
  if (ref.kind === 'none' && keys === 'kind') return { kind: 'none' };
  if (ref.kind === 'lesson_content' && keys === 'key,kind' && typeof ref.key === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,120}$/.test(ref.key)) return { kind: 'lesson_content', key: ref.key };
  if (ref.kind === 'assignment' && keys === 'id,kind' && typeof ref.id === 'string' && uuid.test(ref.id)) return { kind: 'assignment', id: ref.id };
  throw new BadRequestException('Content reference is invalid.');
}
function validTypeRef(type: string, ref: ContentRef) {
  if (ref.kind === 'none') return;
  const evaluated = ['guided_practice', 'knowledge_check', 'simulation', 'challenge', 'physical_lab'].includes(type);
  if ((evaluated && ref.kind !== 'assignment') || (!evaluated && ref.kind !== 'lesson_content')) {
    throw new BadRequestException('Content reference does not match activity type.');
  }
}
function validOrder(ids: string[]) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !uuid.test(id)) || new Set(ids).size !== ids.length) throw new BadRequestException('Order is invalid.');
}
function sameIds(a: string[], b: string[]) { return a.length === b.length && a.every((id) => b.includes(id)); }
function uniqueConflict(error: unknown): Error {
  if (error && typeof error === 'object' && ('code' in error) && (error.code === 'P2002' || error.code === '23505')) return new ConflictException('Ordinal is already in use.');
  return error instanceof Error ? error : new Error('Curriculum write failed.');
}
