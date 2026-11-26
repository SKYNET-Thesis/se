import { ConflictException, NotFoundException } from '@nestjs/common';
import { QuizResultService } from './quiz-result.service';

const user = { vistaUserId: '11111111-1111-4111-8111-111111111111' } as never;
const v = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const snapshot = { kind: 'question_bank_quiz', passPercent: 70, questions: [
  { questionVersionId: v(1), ordinal: 1, type: 'single_choice', points: 1, stem: 's', options: [] },
  { questionVersionId: v(2), ordinal: 2, type: 'multiple_choice', points: 3, stem: 's', options: [] },
  { questionVersionId: v(3), ordinal: 3, type: 'true_false', points: 2, stem: 's', options: [] }] };
const result = { kind: 'question_bank_quiz_result', score: 16.67, passed: false, passPercent: 70, earnedPoints: 1, possiblePoints: 6, feedback: [
  { questionVersionId: v(1), correct: true, earnedPoints: 1, possiblePoints: 1, explanation: 'x' },
  { questionVersionId: v(2), correct: false, earnedPoints: 0, possiblePoints: 3, explanation: 'x' },
  { questionVersionId: v(3), correct: false, earnedPoints: 0, possiblePoints: 2, explanation: 'x' }] };
const attempt = (over: Record<string, unknown> = {}) => ({ id: 'a1', status: 'evaluated', workspace_snapshot: snapshot, result_snapshot: result, score: 16.67, submitted_at: new Date('2026-11-26'), grading_released_at: new Date('2026-11-26'), lesson_id: 'l1', ...over });
const lo = { id: 'o1', code: 'LO-1', description: 'Stay safe' };
const meta = [
  { id: v(1), difficulty: 'easy', domain: 'Safety', objectives: [lo] },
  { id: v(2), difficulty: 'hard', domain: 'Safety', objectives: [lo] },
  { id: v(3), difficulty: 'medium', domain: null, objectives: [] }];
const target = { objective_id: 'o1', course_id: 'c1', lesson_id: 'l1', lesson_title: 'Lesson 1', section_id: 's1', section_title: 'Safety basics', activity_id: 'a9', activity_title: 'Reading' };

function service(...responses: unknown[][]) {
  const queryRaw = jest.fn(); responses.forEach((r) => queryRaw.mockResolvedValueOnce(r));
  return { svc: new QuizResultService({ $queryRaw: queryRaw } as never), queryRaw };
}

describe('QuizResultService', () => {
  it('returns recorded PASS/FAIL, weighted score and analytics; the rating never overrides PASS/FAIL', async () => {
    const { svc } = service([attempt()], meta, [target]);
    const out = await svc.result(user, 'a1');
    expect(out).toMatchObject({ passed: false, passPercent: 70, weightedScore: 16.67, earnedPoints: 1, possiblePoints: 6 });
    expect(out.analytics.overall).toMatchObject({ correct: 1, incorrect: 2, unanswered: 0, total: 3, accuracy: 33.33, weightedScore: 16.67, rating: 'Needs Review' });
    expect(out.analytics.byType.map((b) => [b.key, b.total, b.correct])).toEqual([['multiple_choice', 1, 0], ['single_choice', 1, 1], ['true_false', 1, 0]]);
    expect(out.analytics.byDifficulty.map((b) => b.key)).toEqual(['easy', 'medium', 'hard']);
    expect(out.analytics.byObjective).toHaveLength(1);
    expect(out.analytics.metadata).toMatchObject({ questionsWithoutTopic: 1, questionsWithoutObjective: 1 });
    expect(out.gradingPolicy).toMatch(/no partial credit/);
  });
  it('recommends published accessible content linked to missed objectives, with reason, evidence and review target', async () => {
    const { svc } = service([attempt()], meta, [target]);
    const { recommendations } = await svc.result(user, 'a1');
    expect(recommendations.status).toBe('ok');
    expect(recommendations.items[0]).toMatchObject({ topic: 'Safety basics', priority: 'High', targetKind: 'section', target: { courseId: 'c1', lessonId: 'l1', sectionId: 's1', activityId: 'a9' }, evidence: { incorrectQuestions: 1, totalQuestions: 2, lostPoints: 3, possiblePoints: 4 } });
  });
  it('falls back to the lesson when no section is linked, and says Insufficient Evidence when nothing accessible exists', async () => {
    const lessonOnly = { ...target, section_id: null, section_title: null, activity_id: null, activity_title: null };
    expect((await service([attempt()], meta, [lessonOnly]).svc.result(user, 'a1')).recommendations.items[0]).toMatchObject({ targetKind: 'lesson', target: { lessonId: 'l1', sectionId: null } });
    const none = await service([attempt()], meta, []).svc.result(user, 'a1');
    expect(none.recommendations).toMatchObject({ status: 'insufficient_evidence', items: [] });
  });
  it('never returns answer keys or the question stems/options', async () => {
    const { svc } = service([attempt({ workspace_snapshot: { ...snapshot, questions: snapshot.questions.map((q) => ({ ...q, stem: 'SECRET-STEM' })) } })], meta, [target]);
    const text = JSON.stringify(await svc.result(user, 'a1'));
    expect(text).not.toMatch(/answerKey|answer_key|SECRET-STEM|explanation/);
  });
  it('is scoped to the learner: another learner\'s or a missing attempt is not found; a non-quiz attempt too', async () => {
    await expect(service([]).svc.result(user, 'a1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service([attempt({ workspace_snapshot: { kind: 'blockly' } })]).svc.result(user, 'a1')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('refuses an attempt without a released graded result', async () => {
    await expect(service([attempt({ status: 'in_progress' })]).svc.result(user, 'a1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service([attempt({ grading_released_at: null })]).svc.result(user, 'a1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service([attempt({ result_snapshot: { kind: 'knowledge_check_result' } })]).svc.result(user, 'a1')).rejects.toBeInstanceOf(ConflictException);
  });
  it('queries the learner id and does not look for targets when everything was answered correctly', async () => {
    const allCorrect = { ...result, feedback: result.feedback.map((f) => ({ ...f, correct: true, earnedPoints: f.possiblePoints })), passed: true, score: 100 };
    const { svc, queryRaw } = service([attempt({ result_snapshot: allCorrect })], meta);
    const out = await svc.result(user, 'a1');
    expect(out.recommendations.status).toBe('none_needed');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
