import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { CurriculumService } from '../modules/learning/curriculum.service';
import { LearningScopeService } from '../modules/learning/learning-scope.service';
import { LearningService } from '../modules/learning/learning.service';
import { LearningMediaService } from '../modules/learning/learning-media.service';
import { LearningMediaStorage } from '../modules/learning/learning-media.storage';
import { ProgressionService } from '../modules/learning/progression.service';
import { QuestionBankService } from '../modules/learning/question-bank.service';
import { matchesDisposableDatabaseTarget } from '../modules/learning/isolated-db-target';
import { SO101_CURRICULUM } from './so101-curriculum.data';

/**
 * Idempotent SO-101 curriculum seed for an ISOLATED local database only (same guard as the E2E fixtures).
 *   VISTA_E2E_ADMIN_DATABASE_URL=<loopback vista_test_* url> VISTA_SEED_ADMIN_USER_ID=<existing system admin user id> node dist/scripts/seed-so101-curriculum.js
 * Re-running skips courses that already exist (by title, created by that admin). It never touches other data and is never run against Production.
 */
const databaseUrl = process.env.VISTA_E2E_ADMIN_DATABASE_URL ?? '';
const adminId = process.env.VISTA_SEED_ADMIN_USER_ID ?? '';
if (!matchesDisposableDatabaseTarget(databaseUrl) || process.env.SUPABASE_URL && !/^http:\/\/127\.0\.0\.1:(54321|54323)\/?$/.test(process.env.SUPABASE_URL)) throw new Error('The curriculum seed requires the exact disposable loopback database and local-only auth.');
if (!/^[0-9a-f-]{36}$/.test(adminId)) throw new Error('VISTA_SEED_ADMIN_USER_ID must be an existing system administrator user id.');

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const scope = new LearningScopeService(db as never);
const progression = new ProgressionService(db as never, scope as never);
const learning = new LearningService(db as never, scope as never, progression);
const media = new LearningMediaService(db as never, scope as never, new LearningMediaStorage(new ConfigService()), progression);
const curriculum = new CurriculumService(db as never, progression, media);
const questionBank = new QuestionBankService(db as never);
const admin = { vistaUserId: adminId, status: 'active', systemPermissions: ['org.manage'], memberships: [] };

async function seed() {
  const created: string[] = []; const skipped: string[] = []; const ids: string[] = [];
  for (const [courseIndex, spec] of SO101_CURRICULUM.entries()) {
    const existing = await db.learning_courses.findFirst({ where: { title: spec.title, created_by: adminId } });
    if (existing) {
      if (existing.status !== 'published') throw new Error(`Course "${spec.title}" exists but is incomplete (an earlier run failed). Published Question Bank rows are immutable; recreate the disposable database and re-run.`);
      skipped.push(spec.title); ids[courseIndex] = existing.id; continue;
    }
    const prerequisite = spec.prerequisiteIndex === null ? [] : [ids[spec.prerequisiteIndex]].filter(Boolean);
    const course = await learning.createGlobalCourse(admin as never, { title: spec.title, description: spec.description, level: spec.level, tags: spec.tags, prerequisiteCourseIds: prerequisite });
    ids[courseIndex] = course.id;
    const prefix = ['F', 'M', 'A'][courseIndex];
    const objectiveIds = new Map<string, string>(); const objectiveLesson = new Map<string, string>();
    const lessons: Array<{ id: string }> = [];
    for (const [lessonIndex, lessonSpec] of spec.lessons.entries()) {
      const lesson = await learning.createCourseLesson(admin as never, course.id, { title: lessonSpec.title, content: { summary: lessonSpec.blocks.find((b) => b.type === 'paragraph')?.text ?? '', learningObjectives: lessonSpec.objectives, instructorGuidance: lessonSpec.instructorGuidance } });
      lessons.push(lesson);
      for (const [index, objective] of lessonSpec.objectives.entries()) {
        const row = await db.learning_objectives.create({ data: { lesson_id: lesson.id, code: `SO101-${prefix}${lessonIndex + 1}-O${index + 1}`, description: objective, ordinal: index + 1 } });
        objectiveIds.set(objective, row.id); objectiveLesson.set(objective, lesson.id);
      }
      const section = await curriculum.createSection(admin as never, lesson.id, { title: 'Learn', ordinal: 1 });
      const reading = await curriculum.createActivity(admin as never, section.id, { title: lessonSpec.title, type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: `so101-${prefix}${lessonIndex + 1}` }, content: { version: 1, blocks: lessonSpec.blocks } });
      await curriculum.setSectionStatus(admin as never, section.id, 'published');
      await curriculum.setActivityStatus(admin as never, reading.id, 'published');
    }
    // Module-end quiz: attached to the last lesson of the module, after its reading. A quiz may only use questions of its own lesson, so the
    // module's objectives are restated as review objectives on that lesson and every question maps to one of them.
    const last = lessons[lessons.length - 1];
    const reviewObjective = new Map<string, string>();
    for (const [index, objective] of [...objectiveIds.keys()].entries()) {
      const row = await db.learning_objectives.create({ data: { lesson_id: last.id, code: `SO101-${prefix}-REVIEW-${index + 1}`, description: objective, ordinal: 100 + index } });
      reviewObjective.set(objective, row.id);
    }
    const quiz = await questionBank.createQuizAssignment(admin as never, last.id, spec.quiz.title, 'Answer every question. Each question shows its score weight; the server grades your attempt.', spec.quiz.passPercent);
    for (const [ordinal, q] of spec.quiz.questions.entries()) {
      const question = await questionBank.createQuestion(admin as never, { courseId: course.id, lessonId: last.id, code: `SO101-${q.code}` });
      const version = await questionBank.createVersion(admin as never, question.id, { type: q.type, difficulty: q.difficulty, cognitiveLevel: q.difficulty === 'hard' ? 'apply' : 'remember', stem: q.stem, options: q.options, answerKey: q.answer, explanation: q.explanation });
      await questionBank.mapObjectives(admin as never, version.id, { objectiveIds: [reviewObjective.get(q.objective)!] });
      await questionBank.submitReview(admin as never, version.id);
      await questionBank.publish(admin as never, version.id);
      await questionBank.addToAssignment(admin as never, quiz.id, { questionVersionId: version.id, ordinal: ordinal + 1, points: q.weight });
    }
    const quizSection = await curriculum.createSection(admin as never, last.id, { title: 'Module quiz', ordinal: 2 });
    const check = await curriculum.createActivity(admin as never, quizSection.id, { title: spec.quiz.title, type: 'knowledge_check', ordinal: 1, contentRef: { kind: 'assignment', id: quiz.id } });
    await curriculum.setSectionStatus(admin as never, quizSection.id, 'published');
    await curriculum.setActivityStatus(admin as never, check.id, 'published');
    // Assignment template (delivered to classrooms by instructors, who inherit its rubric and objectives): classroom-specific, outside module navigation.
    const a = spec.assignment;
    const assignment = await db.learning_assignments.create({ data: { lesson_id: last.id, title: a.title, instructions: a.instructions, difficulty: a.difficulty, assignment_type: a.type, grading_method: a.grading, pass_score: a.passScore, learning_objectives: a.objectives } });
    for (const [index, criterion] of a.rubric.entries()) await db.learning_rubric_criteria.create({ data: { assignment_id: assignment.id, ordinal: index + 1, title: criterion.title, description: criterion.description, max_points: criterion.maxPoints } });
    await db.learning_courses.update({ where: { id: course.id }, data: { status: 'published' } });
    created.push(spec.title);
  }
  return { created, skipped, courseIds: ids };
}

void (async () => {
  await db.$connect();
  try { console.log(JSON.stringify(await seed())); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
  finally { await db.$disconnect(); }
})();
