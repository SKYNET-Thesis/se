import { describe, expect, it } from 'vitest';
import { fallbackMessage } from './api';

describe('fallbackMessage', () => {
  it('never shows a bare status code for the common failures', () => {
    expect(fallbackMessage(429)).toMatch(/wait a minute/i);
    expect(fallbackMessage(401)).toMatch(/sign in again/i);
    expect(fallbackMessage(403)).toMatch(/permission/i);
    expect(fallbackMessage(404)).toMatch(/not be found/i);
    expect(fallbackMessage(503)).toMatch(/temporarily unavailable/i);
    expect(fallbackMessage(418)).not.toMatch(/API request failed/);
  });
});
