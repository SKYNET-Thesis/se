import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api';
import { describeLearningLoadFailure } from './learningLoadError';

describe('describeLearningLoadFailure', () => {
  it('tells a dropped connection from a refusal, and only offers Try again where it can help', () => {
    expect(describeLearningLoadFailure(new TypeError('Failed to fetch'))).toMatchObject({ kind: 'network', canRetry: true });
    expect(describeLearningLoadFailure(new Error('NetworkError when attempting to fetch resource.'))).toMatchObject({ kind: 'network', canRetry: true });
    expect(describeLearningLoadFailure(new ApiError(401, 'Unauthorized'))).toMatchObject({ kind: 'session', canRetry: false });
    expect(describeLearningLoadFailure(new ApiError(403, 'Forbidden'))).toMatchObject({ kind: 'permission', canRetry: false });
    expect(describeLearningLoadFailure(new ApiError(500, 'boom'))).toMatchObject({ kind: 'server', canRetry: true });
    expect(describeLearningLoadFailure(new ApiError(503, 'x'))).toMatchObject({ kind: 'server', canRetry: true });
  });
  it('never shows raw server or database text, and names the subject', () => {
    const raw = 'FATAL: (EMAXCONNSESSION) max clients reached in session mode; relation "learning_classrooms" does not exist';
    for (const reason of [new ApiError(500, raw), new Error(raw), 'text']) {
      const { message } = describeLearningLoadFailure(reason);
      expect(message).not.toMatch(/FATAL|EMAXCONN|relation|learning_classrooms/);
    }
    expect(describeLearningLoadFailure(new ApiError(500, 'x'), 'Your teaching overview').message).toContain('Your teaching overview');
    expect(describeLearningLoadFailure(new ApiError(403, 'x'), 'Your courses').message).toContain('your courses');
  });
});
