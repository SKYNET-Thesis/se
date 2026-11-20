// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, AUTH_RESTRICTION_EVENT, ApiError } from './api';

const respond = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('student-auth restrictions reported by the API', () => {
  const assign = vi.fn();
  const original = window.location;
  beforeEach(() => {
    assign.mockReset();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, pathname: '/courses', assign } });
  });
  afterEach(() => { Object.defineProperty(window, 'location', { configurable: true, value: original }); vi.unstubAllGlobals(); });

  it('sends a restricted first-login session to the password-change page and keeps the error code', async () => {
    vi.stubGlobal('fetch', respond(403, { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password to continue.' }));
    await expect(apiGet('/me/learning', 't')).rejects.toMatchObject({ status: 403, code: 'PASSWORD_CHANGE_REQUIRED' });
    expect(assign).toHaveBeenCalledWith('/student/change-password');
  });

  it('does not redirect again when already on the password-change page', async () => {
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, pathname: '/student/change-password', assign } });
    vi.stubGlobal('fetch', respond(403, { code: 'PASSWORD_CHANGE_REQUIRED', message: 'x' }));
    await expect(apiGet('/me/roles', 't')).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([[401, 'SESSION_ROTATED'], [403, 'TEMPORARY_PASSWORD_EXPIRED']])('signals the session layer for %i %s', async (status, code) => {
    const listener = vi.fn();
    window.addEventListener(AUTH_RESTRICTION_EVENT, listener);
    vi.stubGlobal('fetch', respond(status, { code, message: 'x' }));
    await expect(apiGet('/me/roles', 't')).rejects.toMatchObject({ code });
    window.removeEventListener(AUTH_RESTRICTION_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('ignores unrelated errors (a plain 403 or an unknown code)', async () => {
    vi.stubGlobal('fetch', respond(403, { message: 'Forbidden' }));
    await expect(apiGet('/x', 't')).rejects.toMatchObject({ status: 403, code: undefined });
    expect(assign).not.toHaveBeenCalled();
  });
});
