import { createDb, createStudent, createWorld, describeDb, type Db } from './db-test-support';

/** Real PostgreSQL: migration G restores the guard that binds a progress row's activity definition to its lesson. */
describeDb('real PostgreSQL activity-progress scope guard (migration G)', () => {
  const db: Db = createDb();
  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture() {
    const world = await createWorld(db);
    const student = await createStudent(db, world);
    const activity = await db.learning_activities.findFirstOrThrow({ where: { learning_sections: { lesson_id: world.lesson.id } } });
    const otherLesson = await db.learning_lessons.create({ data: { course_id: world.course.id, title: 'L2', ordinal: 2 } });
    return { world, student, activity, otherLesson };
  }

  it('accepts progress whose activity definition belongs to the lesson', async () => {
    const { world, student, activity } = await fixture();
    const row = await db.learning_activity_progress.create({ data: {
      learner_user_id: student.user.id, lesson_id: world.lesson.id, activity_id: activity.id, activity_definition_id: activity.id,
    } });
    expect(row.activity_definition_id).toBe(activity.id);
  });

  it('rejects an insert whose activity definition belongs to another lesson with check_violation', async () => {
    const { student, activity, otherLesson } = await fixture();
    await expect(db.learning_activity_progress.create({ data: {
      learner_user_id: student.user.id, lesson_id: otherLesson.id, activity_id: activity.id, activity_definition_id: activity.id,
    } })).rejects.toThrow(/must belong to its lesson|23514/);
  });

  it('rejects moving an existing row to another lesson and rolls the update back', async () => {
    const { world, student, activity, otherLesson } = await fixture();
    const row = await db.learning_activity_progress.create({ data: {
      learner_user_id: student.user.id, lesson_id: world.lesson.id, activity_id: activity.id, activity_definition_id: activity.id,
    } });
    await expect(db.learning_activity_progress.update({ where: { id: row.id }, data: { lesson_id: otherLesson.id } })).rejects.toThrow(/must belong to its lesson|23514/);
    expect((await db.learning_activity_progress.findUniqueOrThrow({ where: { id: row.id } })).lesson_id).toBe(world.lesson.id);
  });

  it('keeps legacy Course 1 rows (no activity definition) valid', async () => {
    const { world, student } = await fixture();
    const row = await db.learning_activity_progress.create({ data: {
      learner_user_id: student.user.id, lesson_id: world.lesson.id, activity_id: `${world.lesson.id}-reading-1`,
    } });
    expect(row.activity_definition_id).toBeNull();
  });
});
