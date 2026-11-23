// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = { resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), signInWithPassword: vi.fn() };
const session: { value: Record<string, unknown> } = { value: {} };
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => session.value }));
vi.mock('../contexts/RoleContext', () => ({ useRole: () => ({ role: 'teacher' }) }));
vi.mock('../lib/displayName', () => ({ isInternalAlias: (value?: string) => Boolean(value?.endsWith('@students.vista.invalid')), useDisplayName: () => 'Test Teacher' }));

import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { AccountSettings } from './AccountSettings';

let container: HTMLDivElement; let root: Root;
const mount = async (path: string) => {
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/forgot-password" element={<ForgotPassword />} /><Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/login" element={<p>login page</p>} /><Route path="/account" element={<AccountSettings />} /></Routes></MemoryRouter>); });
};
const type = async (selector: string, value: string) => {
  const input = container.querySelector(selector) as HTMLInputElement;
  await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const submit = async () => { await act(async () => { (container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };

beforeEach(() => {
  Object.values(auth).forEach((fn) => fn.mockReset());
  auth.resetPasswordForEmail.mockResolvedValue({ error: null }); auth.updateUser.mockResolvedValue({ error: null }); auth.signOut.mockResolvedValue({ error: null }); auth.signInWithPassword.mockResolvedValue({ error: null });
  session.value = { client: { auth }, session: { user: { email: 'teacher@school.edu' }, access_token: 't' }, loading: false, passwordRecovery: false, configurationError: null };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); });

describe('staff password recovery', () => {
  it('requests a reset link with the /reset-password redirect and gives the same answer for any address', async () => {
    await mount('/forgot-password');
    await type('input[type="email"]', ' someone@school.edu '); await submit();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('someone@school.edu', { redirectTo: `${window.location.origin}/reset-password` });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('If an account exists');
  });
  it('does not reveal whether an address is registered when the provider errors, but reports a rate limit', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { status: 500, message: 'user not found' } });
    await mount('/forgot-password'); await type('input[type="email"]', 'nobody@school.edu'); await submit();
    expect(container.textContent).toContain('If an account exists'); expect(container.textContent).not.toContain('user not found');
    await act(async () => { root.unmount(); }); root = createRoot(container);
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { status: 429, message: 'rate' } });
    await mount('/forgot-password'); await type('input[type="email"]', 'x@school.edu'); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Too many requests');
  });
});

describe('reset password page', () => {
  it('refuses to show the form without a recovery link (signed-in or not), and offers a new link', async () => {
    await mount('/reset-password');
    expect(container.textContent).toContain('This reset link cannot be used');
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('a[href="/forgot-password"]')).toBeTruthy();
    session.value = { ...session.value, session: null };
    await act(async () => { root.unmount(); }); root = createRoot(container); await mount('/reset-password');
    expect(container.textContent).toContain('This reset link cannot be used');
  });
  it('validates the new password, then updates it and revokes every session', async () => {
    session.value = { ...session.value, passwordRecovery: true };
    await mount('/reset-password');
    await type('input[autocomplete="new-password"]', 'short'); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/at least 12/);
    const inputs = container.querySelectorAll('input[autocomplete="new-password"]');
    await type('input[autocomplete="new-password"]', 'a-valid-new-passphrase');
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(inputs[1], 'a-different-passphrase'); inputs[1].dispatchEvent(new Event('input', { bubbles: true })); });
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('do not match');
    expect(auth.updateUser).not.toHaveBeenCalled();
    await act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(inputs[1], 'a-valid-new-passphrase'); inputs[1].dispatchEvent(new Event('input', { bubbles: true })); });
    await submit();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a-valid-new-passphrase' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(container.textContent).toContain('login page');
  });
});

describe('account settings password change (staff)', () => {
  it('verifies the current password before changing it and signs out other sessions', async () => {
    await mount('/account');
    const fields = container.querySelectorAll('form[aria-label="Change password"] input');
    const set = async (index: number, value: string) => act(async () => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(fields[index], value); fields[index].dispatchEvent(new Event('input', { bubbles: true })); });
    auth.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    await set(0, 'wrong-current-password'); await set(1, 'a-valid-new-passphrase'); await set(2, 'a-valid-new-passphrase'); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Your current password is incorrect.');
    expect(auth.updateUser).not.toHaveBeenCalled();
    await set(0, 'the-right-current-password'); await submit();
    expect(auth.signInWithPassword).toHaveBeenLastCalledWith({ email: 'teacher@school.edu', password: 'the-right-current-password' });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'a-valid-new-passphrase' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Password changed');
  });
  it('shows students the Recovery Code route instead of a password form', async () => {
    session.value = { ...session.value, session: { user: { email: 'abc@students.vista.invalid' }, access_token: 't' } };
    await mount('/account');
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).toContain('Recovery Code');
  });
});
