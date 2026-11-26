import { AnalyticsQuestion, ReviewTarget, buildQuizAnalytics, buildRecommendations, performanceRating } from './quiz-analytics';

const o1 = { id: 'o1', code: 'LO-1', description: 'Stay safe' };
const o2 = { id: 'o2', code: 'LO-2', description: 'Read joints' };
const q = (id: string, over: Partial<AnalyticsQuestion> = {}): AnalyticsQuestion => ({ versionId: id, ordinal: 1, type: 'single_choice', difficulty: 'easy', topic: 'Safety', objectives: [o1], possiblePoints: 1, earnedPoints: 0, correct: false, answered: true, ...over });
const target = (over: Partial<ReviewTarget> = {}): ReviewTarget => ({ courseId: 'c1', lessonId: 'l1', lessonTitle: 'Lesson 1', sectionId: 's1', sectionTitle: 'Safety basics', activityId: 'a1', activityTitle: 'Reading', ...over });

describe('performance rating boundaries (informational)', () => {
  it.each([[100, 'Excellent'], [90, 'Excellent'], [89.99, 'Good'], [80, 'Good'], [79.99, 'Satisfactory'], [70, 'Satisfactory'], [69.99, 'Needs Improvement'], [50, 'Needs Improvement'], [49.99, 'Needs Review'], [0, 'Needs Review']])('%s -> %s', (score, rating) => {
    expect(performanceRating(score)).toBe(rating);
  });
  it('has no rating without a score', () => { expect(performanceRating(null)).toBeNull(); expect(performanceRating(Number.NaN)).toBeNull(); });
});

describe('buildQuizAnalytics', () => {
  it('keeps the weighted score and question accuracy separate', () => {
    const a = buildQuizAnalytics([
      q('1', { difficulty: 'hard', possiblePoints: 3, earnedPoints: 3, correct: true }),
      q('2', { difficulty: 'easy', possiblePoints: 1, earnedPoints: 0 }),
      q('3', { difficulty: 'easy', possiblePoints: 1, earnedPoints: 0 }),
      q('4', { difficulty: 'easy', possiblePoints: 1, earnedPoints: 1, correct: true }),
    ]);
    expect(a.overall).toMatchObject({ earnedPoints: 4, possiblePoints: 6, weightedScore: 66.67, accuracy: 50, correct: 2, incorrect: 2, unanswered: 0, total: 4, rating: 'Needs Improvement' });
  });
  it('lists only the question types present and never invents categories', () => {
    const a = buildQuizAnalytics([q('1', { type: 'single_choice' }), q('2', { type: 'true_false', correct: true, earnedPoints: 1 })]);
    expect(a.byType.map((b) => b.key)).toEqual(['single_choice', 'true_false']);
    expect(a.byType.find((b) => b.key === 'multiple_choice')).toBeUndefined();
    expect(a.byType.find((b) => b.key === 'true_false')).toMatchObject({ total: 1, correct: 1, accuracy: 100, label: 'True/False' });
  });
  it('orders difficulty easy/medium/hard, groups unknown separately and reports missing metadata', () => {
    const a = buildQuizAnalytics([q('1', { difficulty: 'hard' }), q('2', { difficulty: null, topic: null, objectives: [] }), q('3', { difficulty: 'easy' }), q('4', { difficulty: 'medium' })]);
    expect(a.byDifficulty.map((b) => b.key)).toEqual(['easy', 'medium', 'hard', 'unknown']);
    expect(a.metadata).toEqual({ questionsWithoutDifficulty: 1, questionsWithoutTopic: 1, questionsWithoutObjective: 1 });
    expect(a.byTopic.map((b) => b.key)).toEqual(['Safety', 'Unspecified']);
  });
  it('handles zero denominators and an empty attempt without NaN or division errors', () => {
    const empty = buildQuizAnalytics([]);
    expect(empty.overall).toMatchObject({ weightedScore: null, accuracy: null, rating: null, total: 0, correct: 0, incorrect: 0, unanswered: 0 });
    const zero = buildQuizAnalytics([q('1', { possiblePoints: 0 })]);
    expect(zero.overall.weightedScore).toBeNull();
    expect(zero.byType[0].weightedScore).toBeNull();
  });
  it('counts unanswered questions separately from incorrect ones', () => {
    const a = buildQuizAnalytics([q('1', { answered: false }), q('2', { correct: true, earnedPoints: 1 }), q('3')]);
    expect(a.overall).toMatchObject({ correct: 1, incorrect: 1, unanswered: 1, total: 3 });
  });
  it('counts a question in every objective it maps to', () => {
    const a = buildQuizAnalytics([q('1', { objectives: [o1, o2] }), q('2', { objectives: [o1], correct: true, earnedPoints: 1 })]);
    expect(a.byObjective.map((b) => [b.code, b.total, b.correct])).toEqual([['LO-1', 2, 1], ['LO-2', 1, 0]]);
  });
});

describe('buildRecommendations (deterministic, no external AI)', () => {
  const targets = new Map([['o1', [target()]], ['o2', [target({ sectionId: null, sectionTitle: null, activityId: null, activityTitle: null, lessonTitle: 'Lesson 2', lessonId: 'l2' })]]]);
  it('ranks by lost points and gives reason, evidence, priority and a review target', () => {
    const r = buildRecommendations([
      q('1', { objectives: [o1], possiblePoints: 1 }), q('2', { objectives: [o2], possiblePoints: 3, difficulty: 'hard' }), q('3', { objectives: [o1], possiblePoints: 1, correct: true, earnedPoints: 1 }),
    ], targets);
    expect(r.status).toBe('ok');
    expect(r.items.map((i) => i.objectiveCode)).toEqual(['LO-2', 'LO-1']);
    expect(r.items[0]).toMatchObject({ priority: 'High', targetKind: 'lesson', evidence: { incorrectQuestions: 1, totalQuestions: 1, lostPoints: 3, possiblePoints: 3, hardOrMediumMissed: 1 }, target: { lessonId: 'l2' } });
    expect(r.items[0].reason).toContain('lost 3 of 3 points');
    expect(r.items[1]).toMatchObject({ priority: 'High', targetKind: 'section', topic: 'Safety basics', evidence: { lostPoints: 1, possiblePoints: 2 } });
    expect(r.note).toMatch(/single quiz attempt only/);
  });
  it('limits to 5 and is stable for equal evidence (order by objective code)', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, code: `LO-${i + 1}`, description: `Outcome ${i + 1}` }));
    const qs = many.map((o, i) => q(`q${i}`, { objectives: [o] }));
    const tg = new Map(many.map((o) => [o.id, [target({ sectionTitle: `S ${o.code}` })]]));
    const r = buildRecommendations(qs, tg);
    expect(r.items.map((i) => i.objectiveCode)).toEqual(['LO-1', 'LO-2', 'LO-3', 'LO-4', 'LO-5']);
    expect(buildRecommendations(qs, tg)).toEqual(r);
  });
  it('says none are needed when everything is correct', () => {
    const r = buildRecommendations([q('1', { correct: true, earnedPoints: 1 })], targets);
    expect(r).toMatchObject({ status: 'none_needed', items: [] });
  });
  it('reports Insufficient Evidence when missed questions have no objective metadata', () => {
    const r = buildRecommendations([q('1', { objectives: [] })], targets);
    expect(r.status).toBe('insufficient_evidence'); expect(r.note).toMatch(/^Insufficient Evidence/); expect(r.items).toEqual([]);
  });
  it('reports Insufficient Evidence (and invents nothing) when no published accessible content is linked', () => {
    const r = buildRecommendations([q('1')], new Map());
    expect(r.status).toBe('insufficient_evidence'); expect(r.note).toMatch(/no published, accessible learning content/); expect(r.items).toEqual([]);
  });
  it('handles an empty attempt', () => { expect(buildRecommendations([], targets).status).toBe('insufficient_evidence'); });
  it('does not treat unanswered questions as incorrect evidence', () => {
    expect(buildRecommendations([q('1', { answered: false })], targets).status).toBe('none_needed');
  });
});
