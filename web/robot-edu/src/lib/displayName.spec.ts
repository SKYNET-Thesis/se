import { describe, expect, it } from 'vitest';
import { displayNameFromUser, initialsOf, isInternalAlias } from './displayName';

describe('display names never expose the internal student alias', () => {
  const alias = 'student-cba22edf-627d-4591-82c3-a2cc8759653f@students.auth.vista.invalid';
  it('recognises the internal alias and nothing else', () => {
    expect(isInternalAlias(alias)).toBe(true);
    expect(isInternalAlias('teacher@school.edu')).toBe(false);
    expect(isInternalAlias(null)).toBe(false);
  });
  it('prefers the profile name, then a real email local part, and never the alias', () => {
    expect(displayNameFromUser({ email: alias, user_metadata: { full_name: 'Student S1' } })).toBe('Student S1');
    expect(displayNameFromUser({ email: 'ann@school.edu' })).toBe('ann');
    expect(displayNameFromUser({ email: alias })).toBe('Learner');
    expect(displayNameFromUser({ email: alias }, 'Student')).toBe('Student');
  });
  it('derives initials from a name', () => { expect(initialsOf('Student S1')).toBe('SS'); });
});
