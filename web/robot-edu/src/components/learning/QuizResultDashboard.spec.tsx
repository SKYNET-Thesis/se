// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QuizResultView, reviewPath } from './QuizResultDashboard';
import type { QuizResultAnalytics } from '../../lib/api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const bucket = (key: string, label: string, total: number, correct: number, earned: number, possible: number) => ({ key, label, total, correct, accuracy: total ? Math.round(correct / total * 10000) / 100 : null, earnedPoints: earned, possiblePoints: possible, weightedScore: possible ? Math.round(earned / possible * 10000) / 100 : null });
const base = (over: Partial<QuizResultAnalytics> = {}): QuizResultAnalytics => ({
  attemptId: 'a1', submittedAt: null, passed: false, passPercent: 70, weightedScore: 66.67, earnedPoints: 4, possiblePoints: 6, gradingPolicy: 'Exact match: no partial credit.',
  analytics: {
    overall: { earnedPoints: 4, possiblePoints: 6, weightedScore: 66.67, accuracy: 50, correct: 2, incorrect: 2, unanswered: 0, total: 4, rating: 'Needs Improvement' },
    byType: [bucket('single_choice', 'Single Choice', 3, 2, 3, 4), bucket('true_false', 'True/False', 1, 0, 0, 2)],
    byDifficulty: [bucket('easy', 'Easy', 2, 1, 1, 2), bucket('hard', 'Hard', 2, 1, 3, 4)],
    byTopic: [bucket('Safety', 'Safety', 4, 2, 4, 6)],
    byObjective: [{ ...bucket('o1', 'LO-1: Stay safe', 4, 2, 4, 6), objectiveId: 'o1', code: 'LO-1', description: 'Stay safe' }],
    metadata: { questionsWithoutDifficulty: 0, questionsWithoutTopic: 0, questionsWithoutObjective: 0 },
  },
  recommendations: { status: 'ok', note: 'Based on this single quiz attempt only; it is not an assessment of overall ability.', items: [{
    topic: 'Safety basics', objectiveId: 'o1', objectiveCode: 'LO-1', priority: 'High', reason: 'You missed 2 of 4 questions on "Stay safe" and lost 2 of 6 points.',
    evidence: { incorrectQuestions: 2, totalQuestions: 4, lostPoints: 2, possiblePoints: 6, hardOrMediumMissed: 1 },
    target: { courseId: 'c1', lessonId: 'l1', lessonTitle: 'Lesson 1', sectionId: 's1', sectionTitle: 'Safety basics', activityId: 'act1', activityTitle: 'Reading' }, targetKind: 'section' }] },
  ...over,
});

describe('QuizResultView', () => {
  let root: Root | undefined;
  afterEach(() => { root?.unmount(); root = undefined; document.body.innerHTML = ''; });
  const mount = async (data: QuizResultAnalytics, retakeTo?: string) => {
    const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => { root?.render(createElement(MemoryRouter, null, createElement(QuizResultView, { data, retakeTo }))); });
    return host;
  };
  const text = () => document.body.textContent ?? '';

  it('shows weighted score, earned/max points, PASS/FAIL, rating, counts and distinguishes accuracy from the weighted score', async () => {
    await mount(base());
    expect(document.querySelector('[data-testid="quiz-weighted-score"]')?.textContent).toBe('66.67%');
    expect(document.querySelector('[data-testid="quiz-pass-fail"]')?.textContent).toBe('FAIL');
    expect(document.querySelector('[data-testid="quiz-rating"]')?.textContent).toBe('Needs Improvement');
    expect(document.querySelector('[data-testid="quiz-points-summary"]')?.textContent).toContain('4 of 6 points earned');
    expect(document.querySelector('[data-testid="quiz-points-summary"]')?.textContent).toContain('pass mark 70%');
    expect(document.querySelector('[data-testid="quiz-counts"]')?.textContent).toContain('2 correct · 2 incorrect · 0 unanswered (4 questions)');
    expect(text()).toContain('Question accuracy: 50%');
    expect(text()).toContain('does not change PASS/FAIL');
  });
  it('shows PASS independently of the rating (a passing result can be only Satisfactory)', async () => {
    const d = base({ passed: true, passPercent: 60 }); d.analytics.overall.rating = 'Satisfactory';
    await mount(d);
    expect(document.querySelector('[data-testid="quiz-pass-fail"]')?.textContent).toBe('PASS');
    expect(document.querySelector('[data-testid="quiz-rating"]')?.textContent).toBe('Satisfactory');
  });
  it('lists only question types that are present and shows correct/total with accuracy', async () => {
    await mount(base());
    const section = document.querySelector('[data-testid="quiz-type-analytics"]')!;
    expect(section.textContent).toContain('Single Choice'); expect(section.textContent).toContain('2/3 correct · accuracy 66.67%');
    expect(section.textContent).toContain('True/False'); expect(section.textContent).not.toContain('Multiple Choice');
    expect(section.querySelectorAll('circle').length).toBe(3); // track + one segment per present type
  });
  it('renders difficulty bars with correct/total, accuracy and earned points', async () => {
    await mount(base());
    const bars = document.querySelector('[data-testid="quiz-difficulty-analytics"]')!;
    expect(bars.textContent).toContain('Easy'); expect(bars.textContent).toContain('1/2 correct · 50% · 1/2 pts');
    expect(bars.textContent).toContain('Hard'); expect(bars.textContent).toContain('1/2 correct · 50% · 3/4 pts');
    expect(bars.querySelectorAll('[role="progressbar"]').length).toBe(2);
  });
  it('renders recommendations with priority, reason and a Review Lesson link to the section activity', async () => {
    await mount(base(), '/my-learning/ca1');
    const item = document.querySelector('[data-testid="quiz-recommendation"]')!;
    expect(item.textContent).toContain('High priority'); expect(item.textContent).toContain('Safety basics'); expect(item.textContent).toContain('lost 2 of 6 points');
    expect(item.querySelector('a')?.getAttribute('href')).toBe('/courses/c1/lessons/l1/activities/act1');
    expect(item.querySelector('a')?.textContent).toContain('Review Lesson');
    expect(text()).toContain('not an assessment of overall ability');
    expect([...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/my-learning/ca1' && /Retake quiz/.test(a.textContent ?? ''))).toBe(true);
  });
  it('shows Insufficient Evidence instead of recommendations, and nothing invented', async () => {
    await mount(base({ recommendations: { status: 'insufficient_evidence', items: [], note: 'Insufficient Evidence: the incorrect questions have no learning objective metadata to base a recommendation on.' } }));
    expect(document.querySelector('[data-testid="quiz-recommendations"]')?.textContent).toContain('Insufficient Evidence');
    expect(document.querySelector('[data-testid="quiz-recommendation"]')).toBeNull();
  });
  it('handles missing metadata and zero denominators without NaN', async () => {
    const d = base();
    d.analytics.overall = { earnedPoints: 0, possiblePoints: 0, weightedScore: null, accuracy: null, correct: 0, incorrect: 0, unanswered: 0, total: 0, rating: null };
    d.analytics.byObjective = []; d.analytics.byTopic = [bucket('Unspecified', 'Unspecified', 0, 0, 0, 0)];
    d.analytics.metadata = { questionsWithoutDifficulty: 0, questionsWithoutTopic: 0, questionsWithoutObjective: 0 };
    d.weightedScore = 0; d.earnedPoints = 0; d.possiblePoints = 0;
    await mount(d);
    expect(text()).not.toMatch(/NaN|undefined/);
    expect(document.querySelector('[data-testid="quiz-weighted-score"]')?.textContent).toBe('N/A');
    expect(document.querySelector('[data-testid="quiz-rating"]')).toBeNull();
  });
  it('explains when no learning objective metadata exists', async () => {
    const d = base(); d.analytics.byObjective = []; d.analytics.metadata.questionsWithoutObjective = d.analytics.overall.total;
    await mount(d);
    expect(document.querySelector('[data-testid="quiz-knowledge-performance"]')?.textContent).toContain('Learning objective information is not available');
  });
  it('builds a lesson-level review path when no activity is linked', () => {
    expect(reviewPath({ courseId: 'c', lessonId: 'l', activityId: null })).toBe('/courses/c/lessons/l');
  });
});
