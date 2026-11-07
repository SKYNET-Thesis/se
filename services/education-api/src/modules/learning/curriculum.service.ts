import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { ProgressionService } from './progression.service';
import { activityIdsForLesson } from './activity-progress.service';
import { assertCourseNotArchived, assertCurriculumMutable } from './course-lifecycle';

const activityTypes = new Set([
  'reading', 'video', 'demonstration', 'guided_practice', 'knowledge_check',
  'simulation', 'challenge', 'physical_lab', 'result', 'reflection',
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ContentRef = { kind: 'lesson_content'; key: string } | { kind: 'assignment'; id: string } | { kind: 'none' };
type SectionInput = { title: string; ordinal: number };
type ActivityInput = { title: string; type: string; ordinal: number; required?: boolean; contentRef: unknown; objectiveIds?: string[] };
type ActivityPatch = Partial<ActivityInput>;
type LessonRow = { id: string; course_id: string; ordinal: number; legacy_course: boolean };
type SectionRow = { id: string; title: string; ordinal: number };
type ActivityRow = { id: string; section_id: string; title: string; type: string; ordinal: number; required: boolean; objectives: unknown };

@Injectable()
export class CurriculumService {
  constructor(private readonly prisma: PrismaService, private readonly progression: ProgressionService) {}

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
      SELECT a.id,a.section_id,a.title,a.type,a.ordinal,a.required,
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
    return this.prisma.learning_sections.findMany({ where: { lesson_id: lessonId }, orderBy: { ordinal: 'asc' }, include: { learning_activities: { orderBy: { ordinal: 'asc' }, include: { learning_activity_objectives: true } } } });
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
    await this.validateAssignmentRef(contentRef, section.lesson_id);
    const objectiveIds = await this.validObjectiveIds(input.objectiveIds ?? [], section.lesson_id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const activity = await tx.learning_activities.create({ data: {
          section_id: sectionId, title: input.title.trim(), type: input.type, ordinal: input.ordinal,
          required: input.required ?? true, content_ref: contentRef,
        } });
        if (objectiveIds.length) await tx.learning_activity_objectives.createMany({ data: objectiveIds.map((objective_id) => ({ activity_id: activity.id, objective_id })) });
        return activity;
      });
    } catch (error) { throw uniqueConflict(error); }
  }

  async updateActivity(user: AuthenticatedUser, activityId: string, input: ActivityPatch) {
    const activity = await this.activityForAuthor(user, activityId);
    if (input.title !== undefined) validTitle(input.title);
    if (input.type !== undefined) validType(input.type);
    if (input.ordinal !== undefined) validOrdinal(input.ordinal);
    const meaningBearing = input.type !== undefined || input.contentRef !== undefined || input.required !== undefined
      || input.objectiveIds !== undefined || (input.ordinal !== undefined && input.ordinal !== activity.ordinal);
    if (meaningBearing) await assertCurriculumMutable(this.prisma, activity.course_id, 'Changing activity definitions');
    const contentRef = input.contentRef === undefined ? undefined : validContentRef(input.contentRef);
    if (contentRef) await this.validateAssignmentRef(contentRef, activity.learning_sections.lesson_id);
    validTypeRef(input.type ?? activity.type, contentRef ?? validContentRef(activity.content_ref));
    const objectiveIds = input.objectiveIds === undefined ? undefined : await this.validObjectiveIds(input.objectiveIds, activity.learning_sections.lesson_id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.learning_activities.update({ where: { id: activityId }, data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.ordinal !== undefined ? { ordinal: input.ordinal } : {}),
          ...(input.required !== undefined ? { required: input.required } : {}),
          ...(contentRef ? { content_ref: contentRef } : {}), updated_at: new Date(),
        } });
        if (objectiveIds) {
          await tx.learning_activity_objectives.deleteMany({ where: { activity_id: activityId } });
          if (objectiveIds.length) await tx.learning_activity_objectives.createMany({ data: objectiveIds.map((objective_id) => ({ activity_id: activityId, objective_id })) });
        }
        return updated;
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
      if (activity.learning_sections.status !== 'published') throw new ConflictException('Publish the section first.');
      const ref = validContentRef(activity.content_ref);
      if (ref.kind === 'none') throw new ConflictException('Published activity requires a content reference.');
      validTypeRef(activity.type, ref);
      await this.validateAssignmentRef(ref, activity.learning_sections.lesson_id);
    } else if (activity.status === 'published') {
      const evidence = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM public.learning_activity_progress WHERE activity_definition_id=${activityId}::uuid
        UNION ALL
        SELECT att.id FROM public.learning_assignment_attempts att
        JOIN public.learning_classroom_assignments ca ON ca.id=att.classroom_assignment_id
        JOIN public.learning_activities a ON a.content_ref->>'kind'='assignment'
          AND a.content_ref->>'id'=ca.assignment_id::text
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

  private async validateAssignmentRef(ref: ContentRef, lessonId: string) {
    if (ref.kind !== 'assignment') return;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM public.learning_assignments WHERE id=${ref.id}::uuid AND lesson_id=${lessonId}::uuid`;
    if (!rows.length) throw new BadRequestException('Referenced assignment must belong to the activity lesson.');
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
