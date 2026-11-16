import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LearningScopeService, COURSE_AUTHOR_PERMISSION } from './learning-scope.service';
import { LearningService } from './learning.service';
import { QuestionBankService } from './question-bank.service';

const SCHOOL_A = 'a0000000-0000-4000-8000-00000000000a';
const SCHOOL_B = 'b0000000-0000-4000-8000-00000000000b';
const user = (over: Record<string, unknown> = {}) => ({
  vistaUserId: 'u1', authUserId: 'a1', email: 'x@y.z', status: 'active', systemRoleCodes: [], systemPermissions: [],
  memberships: [{ id: 'm1', organizationId: SCHOOL_A, roleCode: 'instructor', status: 'active', permissions: [COURSE_AUTHOR_PERMISSION, 'learning.delivery.manage'] }],
  ...over,
}) as never;

describe('school-scoped course authoring authority', () => {
  const scope = new LearningScopeService({} as never);

  describe('LearningScopeService', () => {
    it('takes authoring schools from the caller\'s own active memberships that carry learning.course.author', () => {
      expect(scope.authoringOrganizationIds(user())).toEqual([SCHOOL_A]);
    });
    it('does not treat classroom delivery (learning.delivery.manage) as authoring', () => {
      const delivery = user({ memberships: [{ id: 'm', organizationId: SCHOOL_A, roleCode: 'x', status: 'active', permissions: ['learning.delivery.manage'] }] });
      expect(scope.authoringOrganizationIds(delivery)).toEqual([]);
      expect(scope.canAuthorOrganization(delivery, SCHOOL_A)).toBe(false);
    });
    it('ignores inactive memberships and inactive users', () => {
      const inactiveMembership = user({ memberships: [{ id: 'm', organizationId: SCHOOL_A, roleCode: 'x', status: 'suspended', permissions: [COURSE_AUTHOR_PERMISSION] }] });
      expect(scope.authoringOrganizationIds(inactiveMembership)).toEqual([]);
      expect(scope.canAuthorOrganization(user({ status: 'suspended' }), SCHOOL_A)).toBe(false);
    });
    it('never lets an author of school A act on school B', () => {
      expect(scope.canAuthorOrganization(user(), SCHOOL_A)).toBe(true);
      expect(scope.canAuthorOrganization(user(), SCHOOL_B)).toBe(false);
    });
    it('keeps global (organization-less) content for System Administrators only', () => {
      expect(scope.canAuthorOrganization(user(), null)).toBe(false);
      expect(scope.canAuthorOrganization(user({ systemPermissions: ['org.manage'], memberships: [] }), null)).toBe(true);
    });
  });

  describe('LearningService.createGlobalCourse', () => {
    const make = () => {
      const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', ...data }));
      return { create, service: new LearningService({ learning_courses: { create } } as never, scope as never) };
    };
    it('derives the owning school from the membership and ignores nothing else', async () => {
      const { create, service } = make();
      await service.createGlobalCourse(user(), { title: 'Course' });
      expect(create.mock.calls[0][0].data).toMatchObject({ organization_id: SCHOOL_A, status: 'draft', created_by: 'u1' });
    });
    it('rejects a client-supplied school the caller cannot author for, without creating anything', async () => {
      const { create, service } = make();
      await expect(service.createGlobalCourse(user(), { title: 'Course', organizationId: SCHOOL_B })).rejects.toBeInstanceOf(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });
    it('requires an explicit school when the caller can author for several', async () => {
      const { create, service } = make();
      const many = user({ memberships: [
        { id: '1', organizationId: SCHOOL_A, roleCode: 'i', status: 'active', permissions: [COURSE_AUTHOR_PERMISSION] },
        { id: '2', organizationId: SCHOOL_B, roleCode: 'i', status: 'active', permissions: [COURSE_AUTHOR_PERMISSION] },
      ] });
      await expect(service.createGlobalCourse(many, { title: 'Course' })).rejects.toBeInstanceOf(BadRequestException);
      await service.createGlobalCourse(many, { title: 'Course', organizationId: SCHOOL_B });
      expect(create.mock.calls[0][0].data).toMatchObject({ organization_id: SCHOOL_B });
    });
    it('refuses callers with no authoring capability (students, delivery-only staff)', async () => {
      const { create, service } = make();
      const student = user({ memberships: [{ id: 'm', organizationId: SCHOOL_A, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] });
      await expect(service.createGlobalCourse(student, { title: 'Course' })).rejects.toBeInstanceOf(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });
    it('lets a System Administrator keep creating global courses', async () => {
      const { create, service } = make();
      await service.createGlobalCourse(user({ systemPermissions: ['org.manage'], memberships: [] }), { title: 'Global' });
      expect(create.mock.calls[0][0].data).not.toHaveProperty('organization_id');
    });
  });

  describe('LearningService authoring of an existing course', () => {
    it('hides another school\'s course from update, publish and archive', async () => {
      const course = { id: 'c1', organization_id: SCHOOL_B, status: 'draft', title: 't' };
      const update = jest.fn();
      const tx = { $queryRaw: jest.fn(async () => [course]), learning_courses: { update } };
      const service = new LearningService({ learning_courses: { findUnique: jest.fn(async () => course), update }, $transaction: jest.fn(async (work: (c: unknown) => unknown) => work(tx)) } as never, scope as never);
      await expect(service.updateGlobalCourse(user(), 'c1', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.publishCourse(user(), 'c1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.archiveCourse(user(), 'c1')).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('QuestionBankService', () => {
    const lesson = (organizationId: string | null) => ({ id: 'l1', course_id: 'c1', learning_courses: { organization_id: organizationId } });
    const bank = (organizationId: string | null) => new QuestionBankService({
      learning_lessons: { findUnique: jest.fn(async () => lesson(organizationId)) },
      $queryRaw: jest.fn(async () => [{ id: 'm1' }]),
    } as never);
    const content = { type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem: 's', options: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }], answerKey: ['a'], explanation: 'e' };

    it('keeps the global Question Bank read-only for school authors', async () => {
      await expect(bank(null).authorLessonQuestion(user(), 'l1', { content, newObjective: 'o' } as never)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('takes the question\'s school from the lesson\'s course, never from the client', async () => {
      await expect(bank(SCHOOL_A).createQuestion(user(), { code: 'Q', courseId: 'c1', lessonId: 'l1', organizationId: SCHOOL_B })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
