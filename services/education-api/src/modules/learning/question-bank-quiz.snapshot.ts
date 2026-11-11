import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SubmitKnowledgeCheckDto } from './dto/submit-knowledge-check.dto';

export interface IssuedQuestionRow {
  question_version_id: string; question_id: string; ordinal: number; points: number | string;
  status: string; type: string; stem: string; options: unknown; answer_key: unknown;
  explanation: string | null; objective_count: number | string; organization_id: string | null; lesson_id: string;
}
export interface PublicQuizQuestion { questionVersionId: string; ordinal: number; type: string; stem: string; options: Array<{ id: string; text: string }>; points: number; }
export interface PublicQuizSnapshot {
  kind: 'question_bank_quiz'; schemaVersion: 1; assignmentId: string; lessonId: string;
  issuedAt: string; passPercent: number; gradingPolicy: 'exact_match_v1'; questions: PublicQuizQuestion[];
}
interface PrivateAnswer { questionVersionId: string; answerKey: string[]; explanation: string | null; }
export interface PrivateQuizSnapshot { kind: 'question_bank_quiz_grading'; schemaVersion: 1; checksum: string; answers: PrivateAnswer[]; }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function checksum(publicSnapshot: PublicQuizSnapshot, answers: PrivateAnswer[]): string {
  return createHash('sha256').update(canonical({ publicSnapshot, answers })).digest('hex');
}

export function issueQuestionBankQuiz(rows: IssuedQuestionRow[], assignmentId: string, lessonId: string, organizationId: string | null, passPercent: number, issuedAt = new Date()): { publicSnapshot: PublicQuizSnapshot; privateSnapshot: PrivateQuizSnapshot } {
  if (!Number.isInteger(passPercent) || passPercent < 1 || passPercent > 100 || rows.length === 0) throw new ConflictException('Quiz assignment configuration is incomplete.');
  const questions: PublicQuizQuestion[] = [];
  const answers: PrivateAnswer[] = [];
  for (const row of rows) {
    if (row.status !== 'published' || row.organization_id !== organizationId || row.lesson_id !== lessonId || Number(row.objective_count) < 1) throw new ConflictException('Quiz contains an unavailable QuestionVersion.');
    if (!['single_choice', 'multiple_choice', 'true_false'].includes(row.type) || !row.stem?.trim() || !Array.isArray(row.options) || !Array.isArray(row.answer_key)) throw new ConflictException('Quiz question content is invalid.');
    const options = row.options as Array<{ id?: unknown; text?: unknown }>;
    const answerKey = row.answer_key as unknown[];
    const ids = options.map((option) => option?.id);
    if (options.length < 2 || options.some((option) => typeof option?.id !== 'string' || typeof option?.text !== 'string' || !option.text.trim()) || new Set(ids).size !== ids.length || answerKey.some((id) => !ids.includes(id)) || new Set(answerKey).size !== answerKey.length ||
      (row.type === 'multiple_choice' ? answerKey.length < 2 : answerKey.length !== 1) ||
      (row.type === 'true_false' && (options.length !== 2 || !ids.includes('true') || !ids.includes('false')))) throw new ConflictException('Quiz answer configuration is invalid.');
    const points = Number(row.points);
    if (!Number.isFinite(points) || points <= 0 || !Number.isInteger(row.ordinal)) throw new ConflictException('Quiz points or order are invalid.');
    questions.push({ questionVersionId: row.question_version_id, ordinal: row.ordinal, type: row.type, stem: row.stem, options: options as PublicQuizQuestion['options'], points });
    answers.push({ questionVersionId: row.question_version_id, answerKey: answerKey as string[], explanation: row.explanation });
  }
  if (new Set(questions.map((question) => question.questionVersionId)).size !== questions.length || new Set(questions.map((question) => question.ordinal)).size !== questions.length) throw new ConflictException('Quiz question order is invalid.');
  const publicSnapshot: PublicQuizSnapshot = { kind: 'question_bank_quiz', schemaVersion: 1, assignmentId, lessonId, issuedAt: issuedAt.toISOString(), passPercent, gradingPolicy: 'exact_match_v1', questions };
  return { publicSnapshot, privateSnapshot: { kind: 'question_bank_quiz_grading', schemaVersion: 1, checksum: checksum(publicSnapshot, answers), answers } };
}

export function gradeQuestionBankQuiz(publicValue: unknown, privateValue: unknown, assignmentId: string, lessonId: string, dto: SubmitKnowledgeCheckDto) {
  const publicSnapshot = publicValue as PublicQuizSnapshot;
  const privateSnapshot = privateValue as PrivateQuizSnapshot;
  if (!publicSnapshot || publicSnapshot.kind !== 'question_bank_quiz' || publicSnapshot.schemaVersion !== 1 || publicSnapshot.assignmentId !== assignmentId || publicSnapshot.lessonId !== lessonId || publicSnapshot.gradingPolicy !== 'exact_match_v1' || !Array.isArray(publicSnapshot.questions) || !Number.isInteger(publicSnapshot.passPercent) || publicSnapshot.passPercent < 1 || publicSnapshot.passPercent > 100 ||
      !privateSnapshot || privateSnapshot.kind !== 'question_bank_quiz_grading' || privateSnapshot.schemaVersion !== 1 || !Array.isArray(privateSnapshot.answers) || privateSnapshot.checksum !== checksum(publicSnapshot, privateSnapshot.answers) || publicSnapshot.questions.length !== privateSnapshot.answers.length) {
    throw new ConflictException('Quiz snapshot integrity check failed.');
  }
  if (!Array.isArray(dto.answers) || dto.answers.length !== publicSnapshot.questions.length || new Set(dto.answers.map((answer) => answer.questionId)).size !== dto.answers.length) throw new BadRequestException('Answer every quiz question exactly once.');
  let earnedPoints = 0;
  let possiblePoints = 0;
  const feedback = publicSnapshot.questions.map((question, index) => {
    const key = privateSnapshot.answers[index];
    if (key.questionVersionId !== question.questionVersionId || !Array.isArray(key.answerKey) || !Array.isArray(question.options) || !Number.isFinite(question.points) || question.points <= 0) throw new ConflictException('Quiz snapshot integrity check failed.');
    const answer = dto.answers.find((item) => item.questionId === question.questionVersionId);
    if (!answer) throw new BadRequestException('Answer every quiz question exactly once.');
    const selected = question.type === 'multiple_choice' ? answer.optionIds : answer.optionId ? [answer.optionId] : undefined;
    if (!selected || !selected.length || (question.type === 'multiple_choice' && answer.optionId !== undefined) || (question.type !== 'multiple_choice' && answer.optionIds !== undefined) || new Set(selected).size !== selected.length || selected.some((id) => !question.options.some((option) => option.id === id))) throw new BadRequestException('Quiz answer format is invalid.');
    const correct = selected.length === key.answerKey.length && selected.every((id) => key.answerKey.includes(id));
    possiblePoints += question.points;
    if (correct) earnedPoints += question.points;
    return { questionVersionId: question.questionVersionId, correct, earnedPoints: correct ? question.points : 0, possiblePoints: question.points, explanation: key.explanation };
  });
  const score = Math.round(earnedPoints / possiblePoints * 10000) / 100;
  return { score, passed: score >= publicSnapshot.passPercent, passPercent: publicSnapshot.passPercent, earnedPoints, possiblePoints, feedback };
}
