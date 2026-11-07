import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';

const lessonId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const activityId = '33333333-3333-4333-8333-333333333333';
const objectiveId = '44444444-4444-4444-8444-444444444444';
const teacher = { vistaUserId: '55555555-5555-4555-8555-555555555555', status: 'active', systemPermissions: [], memberships: [] };
const learner = { ...teacher, vistaUserId: '66666666-6666-4666-8666-666666666666' };
const lesson = { id: lessonId, course_id: '77777777-7777-4777-8777-777777777777', legacy_course: false };

describe('CurriculumService', () => {
  const query = jest.fn();
  const transaction = jest.fn();
  const sections = { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() };
  const activities = { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() };
  const objectives = { findMany: jest.fn() };
  const mappings = { createMany: jest.fn(), deleteMany: jest.fn() };
  const coursePath = jest.fn();
  const service = new CurriculumService({
    $queryRaw: query, $transaction: transaction,
    learning_sections: sections, learning_activities: activities,
    learning_objectives: objectives, learning_activity_objectives: mappings,
  } as never, { coursePath } as never);

  beforeEach(() => {
    for (const mock of [query, transaction, coursePath, ...Object.values(sections), ...Object.values(activities), ...Object.values(objectives), ...Object.values(mappings)]) mock.mockReset();
    query.mockResolvedValue([lesson]);
    transaction.mockImplementation(async (work) => work({
      $queryRaw: query, $executeRaw: jest.fn(),
      learning_sections: sections, learning_activities: activities,
      learning_activity_objectives: mappings,
    }));
    sections.findUnique.mockResolvedValue({ id: sectionId, lesson_id: lessonId, status: 'draft' });
    activities.findUnique.mockResolvedValue({ id: activityId, section_id: sectionId, status: 'draft', type: 'reading', content_ref: { kind: 'lesson_content', key: 'summary' } });
    objectives.findMany.mockResolvedValue([{ id: objectiveId }]);
  });

  it('creates a draft section in an authorized lesson', async () => {
    sections.create.mockResolvedValue({ id: sectionId, lesson_id: lessonId, title: 'Basics', ordinal: 1, status: 'draft' });
    await expect(service.createSection(teacher as never, lessonId, { title: 'Basics', ordinal: 1 })).resolves.toMatchObject({ id: sectionId, status: 'draft' });
    expect(sections.create).toHaveBeenCalledWith({ data: { lesson_id: lessonId, title: 'Basics', ordinal: 1 } });
  });

  it('rejects unauthorized and legacy Course 1 authoring', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.createSection(teacher as never, lessonId, { title: 'Basics', ordinal: 1 })).rejects.toBeInstanceOf(NotFoundException);
    query.mockResolvedValueOnce([{ ...lesson, legacy_course: true }]);
    await expect(service.createSection(teacher as never, lessonId, { title: 'Basics', ordinal: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect(sections.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate section ordering', async () => {
    sections.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.createSection(teacher as never, lessonId, { title: 'Basics', ordinal: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('reorders every section atomically under the lesson lock', async () => {
    const another = '88888888-8888-4888-8888-888888888888';
    sections.findMany.mockResolvedValueOnce([{ id: sectionId }, { id: another }]);
    await expect(service.reorderSections(teacher as never, lessonId, [another, sectionId])).resolves.toEqual({ lessonId, orderedIds: [another, sectionId] });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map(([sql]) => sql.join('?')).join('\n')).not.toContain('SET CONSTRAINTS');
  });

  it('rejects a reordered list that omits a section', async () => {
    sections.findMany.mockResolvedValueOnce([{ id: sectionId }, { id: '88888888-8888-4888-8888-888888888888' }]);
    await expect(service.reorderSections(teacher as never, lessonId, [sectionId])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an activity only with an objective from the same lesson', async () => {
    activities.create.mockResolvedValue({ id: activityId, section_id: sectionId, status: 'draft' });
    mappings.createMany.mockResolvedValue({ count: 1 });
    await expect(service.createActivity(teacher as never, sectionId, {
      title: 'Read', type: 'reading', ordinal: 1, required: true,
      contentRef: { kind: 'lesson_content', key: 'summary' }, objectiveIds: [objectiveId],
    })).resolves.toMatchObject({ id: activityId, status: 'draft' });
    expect(mappings.createMany).toHaveBeenCalledWith({ data: [{ activity_id: activityId, objective_id: objectiveId }] });
  });

  it('rejects invalid type, unsafe content references and cross-lesson objectives', async () => {
    await expect(service.createActivity(teacher as never, sectionId, { title: 'X', type: 'unknown', ordinal: 1, contentRef: { kind: 'none' } } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createActivity(teacher as never, sectionId, { title: 'X', type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'summary', answerKey: 'stop' } } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createActivity(teacher as never, sectionId, { title: 'X', type: 'simulation', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'summary' } } as never)).rejects.toBeInstanceOf(BadRequestException);
    objectives.findMany.mockResolvedValueOnce([]);
    await expect(service.createActivity(teacher as never, sectionId, { title: 'X', type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'summary' }, objectiveIds: [objectiveId] } as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(activities.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate activity ordering', async () => {
    activities.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.createActivity(teacher as never, sectionId, {
      title: 'Read', type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'summary' },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('reorders activities only within their section', async () => {
    const another = '99999999-9999-4999-8999-999999999999';
    activities.findMany.mockResolvedValueOnce([{ id: activityId }, { id: another }]);
    await expect(service.reorderActivities(teacher as never, sectionId, [another, activityId])).resolves.toEqual({ sectionId, orderedIds: [another, activityId] });
    activities.findMany.mockResolvedValueOnce([{ id: activityId }]);
    await expect(service.reorderActivities(teacher as never, sectionId, [another])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves activity ordinals out of the unique range before assigning their replacement order', async () => {
    const another = '99999999-9999-4999-8999-999999999999';
    const execute = jest.fn();
    transaction.mockImplementationOnce(async (work) => work({
      $queryRaw: query, $executeRaw: execute,
      learning_sections: sections, learning_activities: activities,
      learning_activity_objectives: mappings,
    }));
    activities.findMany.mockResolvedValueOnce([{ id: activityId }, { id: another }]);

    await expect(service.reorderActivities(teacher as never, sectionId, [another, activityId]))
      .resolves.toEqual({ sectionId, orderedIds: [another, activityId] });

    expect(execute.mock.calls.map(([sql]) => sql.join('?')).join('\n')).not.toContain('SET CONSTRAINTS');
    expect(execute.mock.calls.map(([sql]) => sql.join('?')).join('\n')).toContain('ordinal=ordinal+');
  });

  it('keeps Course 1 on its original activity IDs without creating database rows', async () => {
    query.mockReset().mockResolvedValueOnce([{ ...lesson, ordinal: 1, legacy_course: true }]);
    coursePath.mockResolvedValue({ lessons: [{ id: lessonId, status: 'current' }] });
    const result = await service.lessonSections(learner as never, lessonId);
    expect(result).toMatchObject({ source: 'legacy', activityIds: [`${lessonId}-reading-1`, `${lessonId}-demonstration`, `${lessonId}-reading-2`, `${lessonId}-knowledge-check`] });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects authoring when the lesson is outside the teacher organization', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.authorSections(teacher as never, lessonId)).rejects.toBeInstanceOf(NotFoundException);
    const sql = (query.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('m.organization_id=c.organization_id');
    expect(sql).toContain("p.code='learning.delivery.manage'");
  });

  it('publishes a section and its validated activity without exposing draft content to learners', async () => {
    sections.update.mockResolvedValueOnce({ id: sectionId, status: 'published' });
    await expect(service.setSectionStatus(teacher as never, sectionId, 'published')).resolves.toMatchObject({ status: 'published' });
    activities.findUnique.mockResolvedValueOnce({
      id: activityId, section_id: sectionId, status: 'draft', type: 'reading',
      content_ref: { kind: 'lesson_content', key: 'summary' },
      learning_sections: { id: sectionId, lesson_id: lessonId, status: 'published' },
    });
    activities.update.mockResolvedValueOnce({ id: activityId, status: 'published' });
    await expect(service.setActivityStatus(teacher as never, activityId, 'published')).resolves.toMatchObject({ status: 'published' });
    expect(activities.update).toHaveBeenCalledWith({ where: { id: activityId }, data: expect.objectContaining({ status: 'published' }) });
  });

  it('rejects edits to a published activity definition used by learner progress', async () => {
    activities.findUnique.mockResolvedValueOnce({
      id: activityId, section_id: sectionId, status: 'published', type: 'reading',
      content_ref: { kind: 'lesson_content', key: 'summary' },
      learning_sections: { id: sectionId, lesson_id: lessonId, status: 'published' },
    });
    query.mockReset()
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 0, progressRows: 1, attemptRows: 0 }]);
    await expect(service.updateActivity(teacher as never, activityId, { contentRef: { kind: 'lesson_content', key: 'robotConcept' } })).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not unpublish an assignment-backed activity after a learner attempt', async () => {
    activities.findUnique.mockResolvedValueOnce({
      id: activityId, section_id: sectionId, status: 'published', type: 'knowledge_check',
      content_ref: { kind: 'assignment', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      learning_sections: { id: sectionId, lesson_id: lessonId, status: 'published' },
    });
    query.mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 0, progressRows: 0, attemptRows: 0 }])
      .mockResolvedValueOnce([{ id: 'attempt-1' }]);
    await expect(service.setActivityStatus(teacher as never, activityId, 'draft')).rejects.toBeInstanceOf(ConflictException);
    expect(activities.update).not.toHaveBeenCalled();
    expect((query.mock.calls[4][0] as TemplateStringsArray).join('?')).toContain('learning_assignment_attempts');
  });

  it('keeps a new-course physical lab in draft until a general physical evidence policy exists', async () => {
    activities.findUnique.mockResolvedValueOnce({
      id: activityId, section_id: sectionId, status: 'draft', type: 'physical_lab',
      content_ref: { kind: 'assignment', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      learning_sections: { id: sectionId, lesson_id: lessonId, status: 'published' },
    });
    await expect(service.setActivityStatus(teacher as never, activityId, 'published')).rejects.toBeInstanceOf(ConflictException);
    expect(activities.update).not.toHaveBeenCalled();
  });

  it('shows only published sections, activities and mapped outcomes to an enrolled learner', async () => {
    coursePath.mockResolvedValue({ lessons: [{ id: lessonId, status: 'current' }] });
    query.mockReset().mockResolvedValueOnce([{ id: lessonId, course_id: lesson.course_id, legacy_course: false }])
      .mockResolvedValueOnce([{ id: sectionId, title: 'Basics', ordinal: 1 }])
      .mockResolvedValueOnce([{ id: activityId, section_id: sectionId, title: 'Read', type: 'reading', ordinal: 1, required: true, objectives: [{ code: 'LO1', description: 'Explain safety' }] }]);
    const result = await service.lessonSections(learner as never, lessonId);
    expect(result.sections).toEqual([{ id: sectionId, title: 'Basics', ordinal: 1, activities: [{ id: activityId, title: 'Read', type: 'reading', ordinal: 1, required: true, objectives: [{ code: 'LO1', description: 'Explain safety' }] }] }]);
    expect(query.mock.calls[1][0].join('?')).toContain("status='published'");
    expect(query.mock.calls[2][0].join('?')).toContain("status='published'");
  });

  it('rejects learner access outside the enrolled course', async () => {
    query.mockReset().mockResolvedValueOnce([lesson]);
    coursePath.mockRejectedValueOnce(new NotFoundException());
    await expect(service.lessonSections(learner as never, lessonId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects curriculum edits once the course is archived', async () => {
    query.mockReset().mockResolvedValueOnce([lesson]).mockResolvedValueOnce([{ status: 'archived' }]);
    await expect(service.createSection(teacher as never, lessonId, { title: 'Basics', ordinal: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect(sections.create).not.toHaveBeenCalled();
  });

  it('rejects section reordering on a published course with learner delivery', async () => {
    query.mockReset()
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 0, progressRows: 1, attemptRows: 0 }]);
    await expect(service.reorderSections(teacher as never, lessonId, [sectionId])).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('still allows a cosmetic section rename on a published course in delivery', async () => {
    sections.findUnique.mockResolvedValueOnce({ id: sectionId, lesson_id: lessonId, status: 'draft', ordinal: 1 });
    query.mockReset()
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 2, progressRows: 0, attemptRows: 0 }]);
    sections.update.mockResolvedValueOnce({ id: sectionId, title: 'Renamed' });
    await expect(service.updateSection(teacher as never, sectionId, { title: 'Renamed' })).resolves.toMatchObject({ title: 'Renamed' });
  });

  it('rejects activity reordering on a published course with attempts', async () => {
    query.mockReset()
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 0, progressRows: 0, attemptRows: 3 }]);
    await expect(service.reorderActivities(teacher as never, sectionId, [activityId])).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects adding curriculum content after published course delivery begins', async () => {
    query.mockReset()
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 1, progressRows: 0, attemptRows: 0 }]);

    await expect(service.createSection(teacher as never, lessonId, { title: 'New material', ordinal: 2 }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(sections.create).not.toHaveBeenCalled();
  });

  it('rejects publishing a section after published course delivery begins', async () => {
    sections.findUnique.mockResolvedValueOnce({ id: sectionId, lesson_id: lessonId, status: 'draft', ordinal: 1 });
    query.mockReset()
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 1, progressRows: 0, attemptRows: 0 }]);

    await expect(service.setSectionStatus(teacher as never, sectionId, 'published'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(sections.update).not.toHaveBeenCalled();
  });

  it('allows changing a published activity before any learner delivery exists', async () => {
    activities.findUnique.mockResolvedValueOnce({
      id: activityId, section_id: sectionId, status: 'published', type: 'reading', ordinal: 1,
      content_ref: { kind: 'lesson_content', key: 'summary' },
      learning_sections: { id: sectionId, lesson_id: lessonId, status: 'published' },
    });
    query.mockReset()
      .mockResolvedValueOnce([lesson])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ status: 'published' }])
      .mockResolvedValueOnce([{ activeEnrollments: 0, progressRows: 0, attemptRows: 0 }]);
    activities.update.mockResolvedValueOnce({ id: activityId, content_ref: { kind: 'lesson_content', key: 'robotConcept' } });

    await expect(service.updateActivity(teacher as never, activityId, {
      contentRef: { kind: 'lesson_content', key: 'robotConcept' },
    })).resolves.toMatchObject({ id: activityId });
  });
});
