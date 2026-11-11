import { BadRequestException, ConflictException } from '@nestjs/common';
import { gradeQuestionBankQuiz, issueQuestionBankQuiz, IssuedQuestionRow } from './question-bank-quiz.snapshot';

const assignmentId = '11111111-1111-4111-8111-111111111111';
const lessonId = '22222222-2222-4222-8222-222222222222';
const orgId = '33333333-3333-4333-8333-333333333333';
const rows: IssuedQuestionRow[] = [
  { question_version_id: 'single', question_id: 'q1', ordinal: 1, points: 2, status: 'published', type: 'single_choice', stem: 'Single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer_key: ['a'], explanation: 'A', objective_count: 1, organization_id: orgId, lesson_id: lessonId },
  { question_version_id: 'multi', question_id: 'q2', ordinal: 2, points: 3, status: 'published', type: 'multiple_choice', stem: 'Multi', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], answer_key: ['a', 'b'], explanation: 'A and B', objective_count: 1, organization_id: orgId, lesson_id: lessonId },
  { question_version_id: 'tf', question_id: 'q3', ordinal: 3, points: 1, status: 'published', type: 'true_false', stem: 'True?', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], answer_key: ['true'], explanation: 'True', objective_count: 1, organization_id: orgId, lesson_id: lessonId },
];
const correct = { answers: [{ questionId: 'single', optionId: 'a' }, { questionId: 'multi', optionIds: ['b', 'a'] }, { questionId: 'tf', optionId: 'true' }] };

describe('Question Bank quiz snapshot and grading', () => {
  it('issues ordered public questions without keys or explanations', () => {
    const issued = issueQuestionBankQuiz(rows, assignmentId, lessonId, orgId, 80, new Date('2026-11-05T00:00:00Z'));
    expect(issued.publicSnapshot.questions.map((q) => q.questionVersionId)).toEqual(['single', 'multi', 'tf']);
    expect(JSON.stringify(issued.publicSnapshot)).not.toContain('answerKey');
    expect(JSON.stringify(issued.publicSnapshot)).not.toContain('explanation');
    expect(issued.privateSnapshot.answers[1].answerKey).toEqual(['a', 'b']);
    expect(issued.publicSnapshot.passPercent).toBe(80);
  });
  it('issues a canonical global-course quiz with NULL organization scope without exposing grading data', () => {
    const globalRow = { ...rows[0], organization_id: null };
    const issued = issueQuestionBankQuiz([globalRow], assignmentId, lessonId, null, 80, new Date('2026-11-05T00:00:00Z'));
    expect(issued.publicSnapshot).toMatchObject({ kind: 'question_bank_quiz', assignmentId, lessonId, passPercent: 80 });
    expect(JSON.stringify(issued.publicSnapshot)).not.toContain('answerKey');
    expect(JSON.stringify(issued.publicSnapshot)).not.toContain('explanation');
    expect(() => issueQuestionBankQuiz([globalRow], assignmentId, lessonId, orgId, 80)).toThrow(ConflictException);
  });
  it('grades all three types with exact match and assignment threshold', () => {
    const issued = issueQuestionBankQuiz(rows, assignmentId, lessonId, orgId, 80);
    expect(gradeQuestionBankQuiz(issued.publicSnapshot, issued.privateSnapshot, assignmentId, lessonId, correct)).toMatchObject({ score: 100, passed: true, earnedPoints: 6, possiblePoints: 6 });
    const partial = { answers: [{ questionId: 'single', optionId: 'a' }, { questionId: 'multi', optionIds: ['a'] }, { questionId: 'tf', optionId: 'true' }] };
    expect(gradeQuestionBankQuiz(issued.publicSnapshot, issued.privateSnapshot, assignmentId, lessonId, partial)).toMatchObject({ score: 50, passed: false, earnedPoints: 3, possiblePoints: 6 });
  });
  it('grades from issued snapshots even after source rows change', () => {
    const issued = issueQuestionBankQuiz(rows, assignmentId, lessonId, orgId, 80);
    const replacement = rows.map((row) => ({ ...row, answer_key: ['b'], stem: 'Changed' }));
    expect(replacement[0].stem).toBe('Changed');
    expect(gradeQuestionBankQuiz(issued.publicSnapshot, issued.privateSnapshot, assignmentId, lessonId, correct).score).toBe(100);
  });
  it('rejects draft, archived, wrong organization and missing LO at issue time', () => {
    for (const invalid of [{ status: 'draft' }, { status: 'archived' }, { organization_id: 'other' }, { objective_count: 0 }]) {
      expect(() => issueQuestionBankQuiz([{ ...rows[0], ...invalid }], assignmentId, lessonId, orgId, 80)).toThrow(ConflictException);
    }
  });
  it('rejects snapshot tampering and mismatched identity', () => {
    const issued = issueQuestionBankQuiz(rows, assignmentId, lessonId, orgId, 80);
    expect(() => gradeQuestionBankQuiz({ ...issued.publicSnapshot, passPercent: 1 }, issued.privateSnapshot, assignmentId, lessonId, correct)).toThrow(ConflictException);
    expect(() => gradeQuestionBankQuiz(issued.publicSnapshot, issued.privateSnapshot, 'other', lessonId, correct)).toThrow(ConflictException);
    expect(() => gradeQuestionBankQuiz(issued.publicSnapshot, { ...issued.privateSnapshot, answers: [] }, assignmentId, lessonId, correct)).toThrow(ConflictException);
  });
  it('rejects incomplete, duplicated and forged answers', () => {
    const issued = issueQuestionBankQuiz(rows, assignmentId, lessonId, orgId, 80);
    for (const answers of [
      correct.answers.slice(0, 2),
      [correct.answers[0], correct.answers[0], correct.answers[2]],
      [{ questionId: 'single', optionId: 'x' }, correct.answers[1], correct.answers[2]],
      [{ questionId: 'single', optionId: 'a', optionIds: ['a'] }, correct.answers[1], correct.answers[2]],
    ]) expect(() => gradeQuestionBankQuiz(issued.publicSnapshot, issued.privateSnapshot, assignmentId, lessonId, { answers })).toThrow(BadRequestException);
  });
});
