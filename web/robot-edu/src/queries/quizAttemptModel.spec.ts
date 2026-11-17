import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api';
import { legacyOptionLabel, answersPayload, attemptsSentence, canRetryQuiz, isLessonKnowledgeCheck, passMarkOf, quizAction, quizErrorMessage, quizWindow, selectionFromDraft, windowSentence } from './quizAttemptModel';

const now = new Date('2026-11-17T10:00:00Z');
const delivery = (over: Record<string, unknown> = {}) => ({ status: 'published', available_from: null, due_at: null, close_at: null, ...over });

describe('quizAttemptModel', () => {
  it('derives the window exactly like startAttempt: published, already available and not closed', () => {
    expect(quizWindow(delivery(), now)).toBe('open');
    expect(quizWindow(delivery({ available_from: '2026-11-18T08:00:00Z' }), now)).toBe('scheduled');
    expect(quizWindow(delivery({ close_at: '2026-11-17T09:00:00Z' }), now)).toBe('closed');
    expect(quizWindow(delivery({ status: 'closed' }), now)).toBe('closed');
    expect(quizWindow(delivery({ status: 'draft' }), now)).toBe('unpublished');
    expect(quizWindow(delivery({ due_at: '2026-11-16T09:00:00Z' }), now)).toBe('open'); // late answers are accepted until close_at
  });

  it('describes when the quiz can be taken in one sentence', () => {
    expect(windowSentence(delivery({ available_from: '2026-11-18T08:00:00Z' }), now)).toMatch(/^Opens /);
    expect(windowSentence(delivery({ due_at: '2026-11-20T08:00:00Z', close_at: '2026-11-21T08:00:00Z' }), now)).toMatch(/^Due .*, closes .*\.$/);
    expect(windowSentence(delivery({ due_at: '2026-11-16T08:00:00Z' }), now)).toMatch(/^Was due .*\. Late answers are still accepted\.$/);
    expect(windowSentence(delivery({ due_at: '2026-11-16T08:00:00Z', close_at: '2026-11-19T08:00:00Z' }), now)).toMatch(/^Was due .*\. Late answers are accepted until .*\.$/);
    expect(windowSentence(delivery({ close_at: '2026-11-19T08:00:00Z' }), now)).toMatch(/^Closes /);
    expect(windowSentence(delivery(), now)).toBeNull();
  });

  it('offers one action: continue an open attempt, start, try again, or a reason it is blocked', () => {
    const open = { id: 'a2', status: 'in_progress', passed: null };
    const failed = { id: 'a1', status: 'evaluated', passed: false };
    expect(quizAction({ window: 'open', attempts: [open, failed], maxAttempts: 2, lessonQuiz: false })).toEqual({ kind: 'continue', attemptId: 'a2' });
    expect(quizAction({ window: 'open', attempts: [], maxAttempts: 2, lessonQuiz: false })).toEqual({ kind: 'start', retake: false });
    expect(quizAction({ window: 'open', attempts: [failed], maxAttempts: 2, lessonQuiz: false })).toEqual({ kind: 'start', retake: true });
    expect(quizAction({ window: 'open', attempts: [failed, failed], maxAttempts: 2, lessonQuiz: false })).toEqual({ kind: 'blocked', reason: 'You’ve used all 2 attempts.' });
    expect(quizAction({ window: 'open', attempts: [failed], maxAttempts: 1, lessonQuiz: false })).toEqual({ kind: 'blocked', reason: 'You’ve used your only attempt.' });
    expect(quizAction({ window: 'closed', attempts: [open], maxAttempts: null, lessonQuiz: false }).kind).toBe('blocked');
    expect(quizAction({ window: 'scheduled', attempts: [open], maxAttempts: null, lessonQuiz: false }).kind).toBe('blocked');
    expect(quizAction({ window: 'open', attempts: [], maxAttempts: null, lessonQuiz: true })).toEqual({ kind: 'lesson' });
  });

  it('builds the payload the server grades and restores drafts', () => {
    const questions = [{ questionVersionId: 'q1', type: 'single_choice', stem: '', options: [] }, { questionVersionId: 'q2', type: 'multiple_choice', stem: '', options: [] }, { questionVersionId: 'q3', type: 'true_false', stem: '', options: [] }];
    expect(answersPayload(questions, { q1: ['a'], q2: ['b', 'c'], q3: [] })).toEqual([{ questionId: 'q1', optionId: 'a' }, { questionId: 'q2', optionIds: ['b', 'c'] }]);
    expect(selectionFromDraft([{ questionId: 'q1', optionId: 'a' }, { questionId: 'q2', optionIds: ['b'] }])).toEqual({ q1: ['a'], q2: ['b'] });
  });

  it('tells lesson knowledge checks apart from server-issued quizzes and reads the pass mark', () => {
    expect(isLessonKnowledgeCheck({ kind: 'knowledge_check', questions: [{ id: 'x' }] })).toBe(true);
    expect(isLessonKnowledgeCheck({ kind: 'knowledge_check', passPercent: 80 })).toBe(false);
    expect(passMarkOf({ kind: 'knowledge_check', passPercent: 80 })).toBe(80);
    expect(passMarkOf(null)).toBeNull();
    expect(attemptsSentence(1, 3)).toBe('1 of 3 used');
    expect(attemptsSentence(0, null)).toBe('No limit');
  });

  it('maps server answers to plain wording and only offers a retry when it can help', () => {
    expect(quizErrorMessage(new ApiError(409, 'x', 'ASSIGNMENT_CLOSED'), 'submit')).toBe('This quiz closed before your answers were submitted.');
    expect(quizErrorMessage(new ApiError(409, 'x', 'ATTEMPT_NOT_IN_PROGRESS'), 'draft')).toBe('This attempt has already been submitted.');
    expect(quizErrorMessage(new ApiError(409, 'Complete Lesson 1 before starting this lesson.', 'PREREQUISITE_NOT_COMPLETED'), 'start')).toBe('Complete Lesson 1 before starting this lesson.');
    expect(quizErrorMessage(new ApiError(404, 'Assignment was not found.'), 'start')).toMatch(/may not be open yet, it may have closed, or you may have used all your attempts/);
    expect(quizErrorMessage(new ApiError(401, 'Unauthorized'), 'load')).toMatch(/session has ended/);
    expect(quizErrorMessage(new TypeError('Failed to fetch'), 'submit')).toMatch(/submitting again is safe/);
    expect(canRetryQuiz(new TypeError('Failed to fetch'))).toBe(true);
    expect(canRetryQuiz(new ApiError(503, 'x'))).toBe(true);
    expect(canRetryQuiz(new ApiError(409, 'x', 'ASSIGNMENT_CLOSED'))).toBe(false);
  });

  it('labels Course 1 options in plain words', () => {
    expect(legacyOptionLabel('visual_inspection')).toBe('Visual inspection');
  });
});
