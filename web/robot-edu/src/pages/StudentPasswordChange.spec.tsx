// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentPasswordChange } from './StudentPasswordChange';

const mocks = vi.hoisted(() => ({ changePassword: vi.fn(), staffChangePassword: vi.fn(), setSession: vi.fn() }));
const state = vi.hoisted(() => ({ session: { access_token: 'restricted-token' } as { access_token: string } | null, loading: false }));
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ client: { auth: { setSession: mocks.setSession } }, session: state.session, loading: state.loading }) }));
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error { constructor(readonly status: number, message: string, readonly code?: string) { super(message); } },
  studentAuthApi: { changePassword: mocks.changePassword }, staffAccountApi: { changePassword: mocks.staffChangePassword },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const setValue = (input: HTMLInputElement, value: string) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
const render = async () => { await act(async () => { root.render(<MemoryRouter initialEntries={['/student/change-password']}><Routes><Route path="/student/change-password" element={<StudentPasswordChange />} /><Route path="/my-learning" element={<p>My Learning page</p>} /><Route path="/login" element={<p>Login page</p>} /></Routes></MemoryRouter>); }); };
const fields = () => ({ current: container.querySelector('input[autocomplete="current-password"]') as HTMLInputElement, next: container.querySelectorAll('input[autocomplete="new-password"]')[0] as HTMLInputElement, confirm: container.querySelectorAll('input[autocomplete="new-password"]')[1] as HTMLInputElement });
const submit = async () => { await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };

describe('StudentPasswordChange', () => {
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mocks.changePassword.mockReset(); mocks.staffChangePassword.mockReset(); mocks.setSession.mockReset().mockResolvedValue({ error: null }); state.session = { access_token: 'restricted-token' }; });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('sends signed-out visitors to the login page', async () => { state.session = null; await render(); expect(container.textContent).toContain('Login page'); });

  it('explains a mismatch and a reused temporary password without calling the API', async () => {
    await render(); const f = fields();
    await act(async () => { setValue(f.current, 'temp-password-value'); setValue(f.next, 'A-valid-new-Passw0rd'); setValue(f.confirm, 'A-different-Passw0rd'); }); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/do not match/i);
    await act(async () => { setValue(f.next, 'temp-password-value'); setValue(f.confirm, 'temp-password-value'); }); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/differ/i);
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password, installs the replacement session and opens My Learning', async () => {
    mocks.changePassword.mockResolvedValue({ access_token: 'new-access', refresh_token: 'new-refresh' });
    await render(); const f = fields();
    await act(async () => { setValue(f.current, 'temp-password-value'); setValue(f.next, 'A-valid-new-Passw0rd'); setValue(f.confirm, 'A-valid-new-Passw0rd'); }); await submit();
    expect(mocks.changePassword).toHaveBeenCalledWith('restricted-token', { currentPassword: 'temp-password-value', newPassword: 'A-valid-new-Passw0rd' });
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'new-access', refresh_token: 'new-refresh' });
    expect(container.textContent).toContain('My Learning page');
  });

  it('uses the staff endpoint when the student gate reports nothing pending (School Administrator / Instructor first login)', async () => {
    const { ApiError } = await import('../lib/api');
    mocks.changePassword.mockRejectedValue(new ApiError(409, 'No first-login password change is pending.'));
    mocks.staffChangePassword.mockResolvedValue({ access_token: 'staff-access', refresh_token: 'staff-refresh' });
    await render(); const f = fields();
    await act(async () => { setValue(f.current, 'temp-password-value'); setValue(f.next, 'A-valid-new-Passw0rd'); setValue(f.confirm, 'A-valid-new-Passw0rd'); }); await submit();
    expect(mocks.staffChangePassword).toHaveBeenCalledWith('restricted-token', { currentPassword: 'temp-password-value', newPassword: 'A-valid-new-Passw0rd' });
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'staff-access', refresh_token: 'staff-refresh' });
  });

  it('shows the server error and stays on the page when the temporary password is wrong', async () => {
    mocks.changePassword.mockRejectedValue(new Error('Current temporary password is incorrect.'));
    await render(); const f = fields();
    await act(async () => { setValue(f.current, 'wrong'); setValue(f.next, 'A-valid-new-Passw0rd'); setValue(f.confirm, 'A-valid-new-Passw0rd'); }); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('incorrect');
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});
