import { describe, expect, it } from 'vitest';
import { nextSessionRevision } from './sessionRevision';

describe('Supabase session revision', () => {
  it('advances only when the effective access token changes', () => {
    expect(nextSessionRevision(null, 'token-a', 0)).toBe(1);
    expect(nextSessionRevision('token-a', 'token-a', 1)).toBe(1);
    expect(nextSessionRevision('token-a', 'token-b', 1)).toBe(2);
    expect(nextSessionRevision('token-b', null, 2)).toBe(3);
  });
});
