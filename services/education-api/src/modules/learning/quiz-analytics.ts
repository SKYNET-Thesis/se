/**
 * Quiz result analytics and deterministic learning recommendations. Pure functions: no I/O, no randomness, no external AI.
 * Inputs are the learner's own graded attempt (snapshot + server-recorded per-question outcome) and immutable question-version metadata.
 * Never reads or returns answer keys. Grading is untouched (exact_match_v1); the weighted score is earned / possible points.
 */
export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PerformanceRating = 'Excellent' | 'Good' | 'Satisfactory' | 'Needs Improvement' | 'Needs Review';

export interface AnalyticsObjective { id: string; code: string; description: string }
export interface AnalyticsQuestion {
  versionId: string; ordinal: number; type: string; difficulty: string | null; topic: string | null;
  objectives: AnalyticsObjective[]; possiblePoints: number; earnedPoints: number; correct: boolean; answered: boolean;
}
export interface Bucket { key: string; label: string; total: number; correct: number; accuracy: number | null; earnedPoints: number; possiblePoints: number; weightedScore: number | null }

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 10000) / 100 : null);

/** Informational only; never overrides PASS/FAIL. Boundaries: >=90, >=80, >=70, >=50, else. Returns null when there is nothing to rate. */
export function performanceRating(weightedScore: number | null): PerformanceRating | null {
  if (weightedScore === null || !Number.isFinite(weightedScore)) return null;
  if (weightedScore >= 90) return 'Excellent';
  if (weightedScore >= 80) return 'Good';
  if (weightedScore >= 70) return 'Satisfactory';
  if (weightedScore >= 50) return 'Needs Improvement';
  return 'Needs Review';
}

const TYPE_LABEL: Record<string, string> = { single_choice: 'Single Choice', multiple_choice: 'Multiple Choice', true_false: 'True/False' };
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];
const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', unknown: 'Unknown' };

function bucketOf(key: string, label: string, items: AnalyticsQuestion[]): Bucket {
  const correct = items.filter((q) => q.correct).length;
  const earned = items.reduce((s, q) => s + q.earnedPoints, 0);
  const possible = items.reduce((s, q) => s + q.possiblePoints, 0);
  return { key, label, total: items.length, correct, accuracy: pct(correct, items.length), earnedPoints: earned, possiblePoints: possible, weightedScore: pct(earned, possible) };
}
function group(questions: AnalyticsQuestion[], keyOf: (q: AnalyticsQuestion) => string[]): Map<string, AnalyticsQuestion[]> {
  const map = new Map<string, AnalyticsQuestion[]>();
  for (const q of questions) for (const k of keyOf(q)) map.set(k, [...(map.get(k) ?? []), q]);
  return map;
}

export interface QuizAnalytics {
  overall: { earnedPoints: number; possiblePoints: number; weightedScore: number | null; accuracy: number | null; correct: number; incorrect: number; unanswered: number; total: number; rating: PerformanceRating | null };
  /** Only question types actually present in the attempt; absent types are not listed. */
  byType: Bucket[];
  byDifficulty: Bucket[];
  /** Topic = the question's own topic (domain). Questions without one are grouped as "Unspecified" and flagged. */
  byTopic: Bucket[];
  /** Learning objectives mapped to the questions; a question mapped to several objectives counts in each. */
  byObjective: Array<Bucket & { objectiveId: string; code: string; description: string }>;
  metadata: { questionsWithoutDifficulty: number; questionsWithoutTopic: number; questionsWithoutObjective: number };
}

export function buildQuizAnalytics(questions: AnalyticsQuestion[]): QuizAnalytics {
  const answered = questions.filter((q) => q.answered);
  const correct = questions.filter((q) => q.answered && q.correct).length;
  const earned = questions.reduce((s, q) => s + q.earnedPoints, 0);
  const possible = questions.reduce((s, q) => s + q.possiblePoints, 0);
  const weighted = pct(earned, possible);
  const types = group(questions, (q) => [q.type]);
  const byType = [...types.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, items]) => bucketOf(k, TYPE_LABEL[k] ?? k, items));
  const diffs = group(questions, (q) => [q.difficulty && DIFFICULTY_ORDER.includes(q.difficulty) ? q.difficulty : 'unknown']);
  const byDifficulty = [...diffs.entries()].sort(([a], [b]) => (DIFFICULTY_ORDER.indexOf(a) + (a === 'unknown' ? 99 : 0)) - (DIFFICULTY_ORDER.indexOf(b) + (b === 'unknown' ? 99 : 0))).map(([k, items]) => bucketOf(k, DIFFICULTY_LABEL[k], items));
  const topics = group(questions, (q) => [q.topic?.trim() || 'Unspecified']);
  const byTopic = [...topics.entries()].sort(([a], [b]) => (a === 'Unspecified' ? 1 : 0) - (b === 'Unspecified' ? 1 : 0) || a.localeCompare(b)).map(([k, items]) => bucketOf(k, k, items));
  const objectives = new Map<string, { objective: AnalyticsObjective; items: AnalyticsQuestion[] }>();
  for (const q of questions) for (const o of q.objectives) { const e = objectives.get(o.id) ?? { objective: o, items: [] }; e.items.push(q); objectives.set(o.id, e); }
  const byObjective = [...objectives.values()].sort((a, b) => a.objective.code.localeCompare(b.objective.code, undefined, { numeric: true }))
    .map(({ objective, items }) => ({ ...bucketOf(objective.id, `${objective.code}: ${objective.description}`, items), objectiveId: objective.id, code: objective.code, description: objective.description }));
  return {
    overall: { earnedPoints: earned, possiblePoints: possible, weightedScore: weighted, accuracy: pct(correct, questions.length), correct, incorrect: answered.length - correct, unanswered: questions.length - answered.length, total: questions.length, rating: performanceRating(weighted) },
    byType, byDifficulty, byTopic, byObjective,
    metadata: { questionsWithoutDifficulty: questions.filter((q) => !q.difficulty || !DIFFICULTY_ORDER.includes(q.difficulty)).length, questionsWithoutTopic: questions.filter((q) => !q.topic?.trim()).length, questionsWithoutObjective: questions.filter((q) => q.objectives.length === 0).length },
  };
}

// ---- recommendations ----
export interface ReviewTarget { courseId: string; lessonId: string; lessonTitle: string; sectionId: string | null; sectionTitle: string | null; activityId: string | null; activityTitle: string | null }
export type Priority = 'High' | 'Medium' | 'Low';
export interface Recommendation {
  topic: string; objectiveId: string; objectiveCode: string; priority: Priority; reason: string;
  evidence: { incorrectQuestions: number; totalQuestions: number; lostPoints: number; possiblePoints: number; hardOrMediumMissed: number };
  target: ReviewTarget; targetKind: 'section' | 'lesson';
}
export interface RecommendationResult { status: 'ok' | 'none_needed' | 'insufficient_evidence'; items: Recommendation[]; note: string }
export const MAX_RECOMMENDATIONS = 5;
const SINGLE_ATTEMPT_NOTE = 'Based on this single quiz attempt only; it is not an assessment of overall ability.';

/**
 * Deterministic rules. Per learning objective: lost points = sum over incorrect questions of their points. Rank by lost points desc, then
 * incorrect count desc, then objective code. Priority: High when >= 50% of the objective's points were lost, Medium >= 25%, else Low.
 * `targets` must already be restricted to published content the learner can access; an objective with none is skipped (nothing is invented).
 */
export function buildRecommendations(questions: AnalyticsQuestion[], targets: Map<string, ReviewTarget[]>): RecommendationResult {
  const incorrect = questions.filter((q) => q.answered && !q.correct);
  if (!questions.length) return { status: 'insufficient_evidence', items: [], note: `Insufficient Evidence: the attempt has no questions. ${SINGLE_ATTEMPT_NOTE}` };
  if (!incorrect.length) return { status: 'none_needed', items: [], note: `All questions were answered correctly, so no review is suggested. ${SINGLE_ATTEMPT_NOTE}` };
  const perObjective = new Map<string, { o: AnalyticsObjective; lost: number; possible: number; wrong: number; total: number; hardMed: number }>();
  for (const q of questions) for (const o of q.objectives) {
    const e = perObjective.get(o.id) ?? { o, lost: 0, possible: 0, wrong: 0, total: 0, hardMed: 0 };
    e.possible += q.possiblePoints; e.total += 1;
    if (q.answered && !q.correct) { e.lost += q.possiblePoints - q.earnedPoints; e.wrong += 1; if (q.difficulty === 'hard' || q.difficulty === 'medium') e.hardMed += 1; }
    perObjective.set(o.id, e);
  }
  const missed = [...perObjective.values()].filter((e) => e.wrong > 0);
  if (!missed.length) return { status: 'insufficient_evidence', items: [], note: `Insufficient Evidence: the incorrect questions have no learning objective metadata to base a recommendation on. ${SINGLE_ATTEMPT_NOTE}` };
  const ranked = missed.sort((a, b) => b.lost - a.lost || b.wrong - a.wrong || a.o.code.localeCompare(b.o.code, undefined, { numeric: true }));
  const items: Recommendation[] = [];
  for (const e of ranked) {
    const options = targets.get(e.o.id) ?? [];
    if (!options.length) continue;
    const best = [...options].sort((a, b) => Number(!!b.sectionId) - Number(!!a.sectionId) || a.lessonTitle.localeCompare(b.lessonTitle) || (a.sectionTitle ?? '').localeCompare(b.sectionTitle ?? ''))[0];
    const share = e.possible > 0 ? e.lost / e.possible : 0;
    const topic = best.sectionTitle ?? best.lessonTitle;
    items.push({
      topic, objectiveId: e.o.id, objectiveCode: e.o.code, priority: share >= 0.5 ? 'High' : share >= 0.25 ? 'Medium' : 'Low',
      reason: `You missed ${e.wrong} of ${e.total} question${e.total === 1 ? '' : 's'} on "${e.o.description}" and lost ${e.lost} of ${e.possible} point${e.possible === 1 ? '' : 's'}.`,
      evidence: { incorrectQuestions: e.wrong, totalQuestions: e.total, lostPoints: e.lost, possiblePoints: e.possible, hardOrMediumMissed: e.hardMed },
      target: best, targetKind: best.sectionId ? 'section' : 'lesson',
    });
    if (items.length === MAX_RECOMMENDATIONS) break;
  }
  if (!items.length) return { status: 'insufficient_evidence', items: [], note: `Insufficient Evidence: no published, accessible learning content is linked to the objectives you missed. ${SINGLE_ATTEMPT_NOTE}` };
  return { status: 'ok', items, note: SINGLE_ATTEMPT_NOTE };
}
