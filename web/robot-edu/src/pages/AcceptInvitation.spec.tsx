// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = { updateUser: vi.fn(), getSession: vi.fn() };
const mocks = vi.hoisted(() => ({ roles: vi.fn(), complete: vi.fn() }));
const session: { value: Record<string, unknown> } = { value: {} };
vi.mock('../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => session.value }));
vi.mock('../lib/api', () => ({ identityApi: { roles: mocks.roles } }));

import { AcceptInvitation } from './AcceptInvitation';

let container: HTMLDivElement; let root: Root;
const mount = async () => { await act(async () => { root.render(<MemoryRouter initialEntries={['/accept-invitation']}><Routes>
  <Route path="/accept-invitation" element={<AcceptInvitation />} /><Route path="/" element={<p>workspace</p>} /><Route path="/login" element={<p>login page</p>} /></Routes></MemoryRouter>); }); };
const type = async (selector: string, index: number, value: string) => {
  const input = container.querySelectorAll(selector)[index] as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const submit = async () => { await act(async () => { (container.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
const ready = () => ({ client: { auth }, session: { user: { email: 'new.admin@school.edu' }, access_token: 'invite-token' }, loading: false, invitationSetup: true, invitationLinkError: null, completeInvitation: mocks.complete });

beforeEach(() => {
  auth.updateUser.mockReset().mockResolvedValue({ error: null }); auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'after-update' } } });
  mocks.roles.mockReset().mockResolvedValue({ memberships: [] }); mocks.complete.mockReset();
  session.value = ready();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); });

describe('accept invitation page', () => {
  it('shows no password form when the invitation was not validated in this browser (forged fragment, signed-in visitor, no session)', async () => {
    for (const patch of [{ invitationSetup: false }, { session: null }, { client: null }]) {
      session.value = { ...ready(), ...patch }; await act(async () => { root.unmount(); }); root = createRoot(container); await mount();
      expect(container.textContent).toContain('This invitation link cannot be used');
      expect(container.querySelector('input[type="password"]')).toBeNull();
    }
  });
  it('explains an expired or already used invitation and points to the administrator', async () => {
    session.value = { ...ready(), invitationSetup: false, session: null, invitationLinkError: 'otp_expired' }; await mount();
    expect(container.textContent).toContain('expired or was already used'); expect(container.textContent).toContain('Ask your administrator');
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
  it('keeps the button disabled until password and confirmation satisfy the policy and match', async () => {
    await mount(); const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await type('input[type="password"]', 0, 'A-valid-new-Passw0rd'); await type('input[type="password"]', 1, 'A-different-Passw0rd');
    expect(button.disabled).toBe(true);
    await type('input[type="password"]', 1, 'A-valid-new-Passw0rd'); expect(button.disabled).toBe(false);
  });
  it('sets the password, activates the account through one API call, clears the invitation state and opens the workspace', async () => {
    await mount(); await type('input[type="password"]', 0, 'A-valid-new-Passw0rd'); await type('input[type="password"]', 1, 'A-valid-new-Passw0rd'); await submit();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'A-valid-new-Passw0rd' });
    expect(mocks.roles).toHaveBeenCalledWith('after-update');
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('workspace');
  });
  it('stays on the page with a clear error and does not clear the invitation when saving the password fails', async () => {
    auth.updateUser.mockResolvedValueOnce({ error: new Error('Password should be different from the old password.') });
    await mount(); await type('input[type="password"]', 0, 'A-valid-new-Passw0rd'); await type('input[type="password"]', 1, 'A-valid-new-Passw0rd'); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('different');
    expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.roles).not.toHaveBeenCalled();
  });
});
