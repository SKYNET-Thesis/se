import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, passwordProblem } from './passwordPolicy';

describe('passwordProblem', () => {
  it('requires the minimum length, a matching confirmation and a change from the current password', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(passwordProblem('short', 'short')).toMatch(/at least 12/);
    expect(passwordProblem('a-long-enough-pass', 'a-different-one!!')).toBe('The passwords do not match.');
    expect(passwordProblem('same-password-123', 'same-password-123', 'same-password-123')).toMatch(/differ/);
    expect(passwordProblem('a-long-enough-pass', 'a-long-enough-pass', 'old-password-1234')).toBeNull();
    expect(passwordProblem('exactly12chars', 'exactly12chars')).toBeNull();
  });
});
