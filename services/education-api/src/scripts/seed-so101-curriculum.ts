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
import { syncChallengeConditions } from './seed-course1';

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
  const totals = { modules: 0, lessons: 0, questions: 0, quizzes: 0, assignments: 0, labs: 0 };
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
    const moduleIds: string[] = [];
    // Platform terms: a module is a learning_lessons row; its "lessons" are sections with a reading; the module-end quiz is the last section.
    for (const [moduleIndex, mod] of spec.modules.entries()) {
      const moduleRow = await learning.createCourseLesson(admin as never, course.id, { title: mod.title, content: { summary: mod.summary, learningObjectives: mod.lessons.flatMap((l) => l.objectives), instructorGuidance: mod.lessons.map((l) => `${l.title}: ${l.instructorGuidance}`) } });
      moduleIds.push(moduleRow.id);
      const objectiveIds = new Map<string, string>();
      let ordinal = 1;
      for (const lesson of mod.lessons) for (const objective of lesson.objectives) {
        const row = await db.learning_objectives.create({ data: { lesson_id: moduleRow.id, code: `SO101-${prefix}${moduleIndex + 1}-O${ordinal}`, description: objective, ordinal } });
        objectiveIds.set(objective, row.id); ordinal += 1;
      }
      for (const [lessonIndex, lesson] of mod.lessons.entries()) {
        const section = await curriculum.createSection(admin as never, moduleRow.id, { title: lesson.title, ordinal: lessonIndex + 1 });
        const reading = await curriculum.createActivity(admin as never, section.id, { title: lesson.title, type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: `so101-${prefix}${moduleIndex + 1}-${lessonIndex + 1}` }, content: { version: 1, blocks: lesson.blocks } });
        await curriculum.setSectionStatus(admin as never, section.id, 'published');
        await curriculum.setActivityStatus(admin as never, reading.id, 'published');
        totals.lessons += 1;
      }
      const quiz = await questionBank.createQuizAssignment(admin as never, moduleRow.id, mod.quiz.title, 'Answer every question. Each question shows its score weight before you submit; the server grades your attempt.', mod.quiz.passPercent);
      for (const [index, q] of mod.quiz.questions.entries()) {
        const question = await questionBank.createQuestion(admin as never, { courseId: course.id, lessonId: moduleRow.id, code: `SO101-${q.code}` });
        const version = await questionBank.createVersion(admin as never, question.id, { type: q.type, difficulty: q.difficulty, cognitiveLevel: q.difficulty === 'hard' ? 'apply' : 'remember', stem: q.stem, options: q.options, answerKey: q.answer, explanation: q.explanation });
        await questionBank.mapObjectives(admin as never, version.id, { objectiveIds: [objectiveIds.get(q.objective)!] });
        await questionBank.submitReview(admin as never, version.id);
        await questionBank.publish(admin as never, version.id);
        await questionBank.addToAssignment(admin as never, quiz.id, { questionVersionId: version.id, ordinal: index + 1, points: q.weight });
        totals.questions += 1;
      }
      const quizSection = await curriculum.createSection(admin as never, moduleRow.id, { title: 'Module quiz', ordinal: mod.lessons.length + 1 });
      const check = await curriculum.createActivity(admin as never, quizSection.id, { title: mod.quiz.title, type: 'knowledge_check', ordinal: 1, contentRef: { kind: 'assignment', id: quiz.id } });
      await curriculum.setSectionStatus(admin as never, quizSection.id, 'published');
      await curriculum.setActivityStatus(admin as never, check.id, 'published');
      totals.modules += 1; totals.quizzes += 1;
      // progression: the next module unlocks when this module's quiz is passed
      if (moduleIndex > 0) await db.learning_lesson_prerequisites.create({ data: { lesson_id: moduleRow.id, prerequisite_lesson_id: moduleIds[moduleIndex - 1], required: true } });
    }
    // Assignment and lab templates (delivered per classroom by instructors; they inherit rubric, objectives, blocks and challenge). Outside module navigation.
    const placements: Array<[typeof spec.assignments[number] | typeof spec.labs[number], string, boolean]> = [
      [spec.assignments[0], moduleIds[0], false], [spec.labs[0], moduleIds[1], true], [spec.assignments[1], moduleIds[1], false], [spec.labs[1], moduleIds[2], true],
    ];
    for (const [a, lessonId, isLab] of placements) {
      let challengeId: string | null = null; let allowedBlocks: string[] = []; let constraints: Record<string, unknown> = {};
      if (isLab) {
        const lab = a as typeof spec.labs[number];
        const challenge = await db.learning_challenges.create({ data: { organization_id: null, creator_user_id: adminId, title: lab.challenge.title, description: lab.challenge.description, success_criteria: { kind: 'symbolic_rules' }, permitted_modes: ['blockly'], status: 'published' } });
        await syncChallengeConditions(db as never, challenge.id, lab.challenge.conditions);
        challengeId = challenge.id; allowedBlocks = lab.challenge.allowedBlocks;
        constraints = { kind: 'symbolic_program', ...(lab.challenge.target ? { target: { frame: 'learning_preview_v1', arm: lab.challenge.target.arm, position: { x: lab.challenge.target.x, y: lab.challenge.target.y, z: lab.challenge.target.z } } } : {}) };
      }
      const row = await db.learning_assignments.create({ data: { lesson_id: lessonId, challenge_id: challengeId, title: a.title, instructions: a.instructions, allowed_blocks: allowedBlocks, constraints: constraints as never, difficulty: a.difficulty, assignment_type: a.type, grading_method: a.grading, pass_score: a.passScore, learning_objectives: a.objectives } });
      for (const [index, criterion] of a.rubric.entries()) await db.learning_rubric_criteria.create({ data: { assignment_id: row.id, ordinal: index + 1, title: criterion.title, description: criterion.description, max_points: criterion.maxPoints } });
      if (isLab) totals.labs += 1; else totals.assignments += 1;
    }
    await db.learning_courses.update({ where: { id: course.id }, data: { status: 'published' } });
    created.push(spec.title);
  }
  return { created, skipped, courseIds: ids, totals };
}

void (async () => {
  await db.$connect();
  try { console.log(JSON.stringify(await seed())); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
  finally { await db.$disconnect(); }
})();
