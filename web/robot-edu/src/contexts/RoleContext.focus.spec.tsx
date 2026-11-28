// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireRole } from '../components/auth/RequireRole';
import { RoleProvider, useRole } from './RoleContext';

const mocks = vi.hoisted(() => ({
  session: { access_token: 'token-1', user: { id: 'user-1' } } as { access_token: string; user: { id: string } } | null,
  roles: vi.fn(),
}));

vi.mock('./SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: mocks.session }) }));
vi.mock('../lib/api', () => ({ identityApi: { roles: mocks.roles } }));

function DraftForm() {
  const [title, setTitle] = useState('');
  const [dialogOpen, setDialogOpen] = useState(true);
  const { memberships } = useRole();
  return <section><output data-testid="memberships">{memberships.map((membership) => `${membership.organizationId}:${membership.roleCode}`).join(',')}</output><label>Organization name<input aria-label="Organization name" value={title} onChange={(event) => setTitle(event.target.value)} /></label>{dialogOpen && <div role="dialog">Create organization</div>}<button onClick={() => setDialogOpen(false)}>Close dialog</button></section>;
}

describe('RoleProvider session refresh stability', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = () => root.render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RoleProvider><RequireRole roles={['admin']}><DraftForm /></RequireRole></RoleProvider></MemoryRouter>);
  const requiredInput = () => {
    const input = container.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('Expected the protected form input to be mounted.');
    return input;
  };

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.session = { access_token: 'token-1', user: { id: 'user-1' } };
    mocks.roles.mockReset().mockResolvedValue({ systemRoleCodes: ['system_admin'], memberships: [] });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });

  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

  it('keeps dirty fields and an open dialog mounted while the same user refreshes a token', async () => {
    let finishRefresh!: (access: { systemRoleCodes: string[]; memberships: [] }) => void;
    mocks.roles.mockImplementationOnce(async () => ({ systemRoleCodes: ['system_admin'], memberships: [] }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));

    await act(async () => { render(); await Promise.resolve(); });
    const input = requiredInput();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Input value setter is unavailable.');
    await act(async () => { setter.call(input, 'North Campus'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(input.value).toBe('North Campus');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => { mocks.session = { access_token: 'token-2', user: { id: 'user-1' } }; render(); await Promise.resolve(); });

    expect(container.querySelector('input')).toBe(input);
    expect(requiredInput().value).toBe('North Campus');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => { finishRefresh({ systemRoleCodes: ['system_admin'], memberships: [] }); await Promise.resolve(); });
    expect(container.querySelector('input')).toBe(input);
  });

  it('fails closed if the server cannot refresh the same-user role', async () => {
    mocks.roles.mockResolvedValueOnce({ systemRoleCodes: ['system_admin'], memberships: [] })
      .mockRejectedValueOnce(new Error('temporary network error'));
    await act(async () => { render(); await Promise.resolve(); });
    await act(async () => { mocks.session = { access_token: 'token-2', user: { id: 'user-1' } }; render(); await Promise.resolve(); });
    expect(container.querySelector('input')).toBeNull();
  });

  it('removes the admin workspace when a successful role refresh revokes admin access', async () => {
    mocks.roles.mockResolvedValueOnce({ systemRoleCodes: ['system_admin'], memberships: [] })
      .mockResolvedValueOnce({ systemRoleCodes: [], memberships: [{ status: 'active', roleCode: 'student' }] });
    await act(async () => { render(); await Promise.resolve(); });
    expect(container.querySelector('input')).not.toBeNull();
    await act(async () => { mocks.session = { access_token: 'token-2', user: { id: 'user-1' } }; render(); await Promise.resolve(); });
    expect(container.querySelector('input')).toBeNull();
  });

  it('replaces organization memberships from the refreshed server context', async () => {
    mocks.roles.mockResolvedValueOnce({ systemRoleCodes: ['system_admin'], memberships: [{ organizationId: 'school-1', roleCode: 'school_admin', status: 'active' }] })
      .mockResolvedValueOnce({ systemRoleCodes: ['system_admin'], memberships: [{ organizationId: 'school-2', roleCode: 'instructor', status: 'active' }] });
    await act(async () => { render(); await Promise.resolve(); });
    expect(container.querySelector('[data-testid="memberships"]')?.textContent).toBe('school-1:school_admin');
    await act(async () => { mocks.session = { access_token: 'token-2', user: { id: 'user-1' } }; render(); await Promise.resolve(); });
    expect(container.querySelector('[data-testid="memberships"]')?.textContent).toBe('school-2:instructor');
  });

  it('ignores an older concurrent refresh response after a newer token response wins', async () => {
    let finishOlder!: (access: { systemRoleCodes: string[]; memberships: [] }) => void;
    let finishNewer!: (access: { systemRoleCodes: string[]; memberships: [] }) => void;
    mocks.roles.mockResolvedValueOnce({ systemRoleCodes: ['system_admin'], memberships: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { finishOlder = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNewer = resolve; }));
    await act(async () => { render(); await Promise.resolve(); });
    await act(async () => { mocks.session = { access_token: 'token-2', user: { id: 'user-1' } }; render(); });
    await act(async () => { mocks.session = { access_token: 'token-3', user: { id: 'user-1' } }; render(); });
    await act(async () => { finishNewer({ systemRoleCodes: [], memberships: [{ status: 'active', roleCode: 'student' }] }); await Promise.resolve(); });
    expect(container.querySelector('input')).toBeNull();
    await act(async () => { finishOlder({ systemRoleCodes: ['system_admin'], memberships: [] }); await Promise.resolve(); });
    expect(container.querySelector('input')).toBeNull();
  });

  it('hides the prior user workspace while a different user role is being resolved', async () => {
    let finishNewUser!: (access: { systemRoleCodes: string[]; memberships: [] }) => void;
    mocks.roles.mockResolvedValueOnce({ systemRoleCodes: ['system_admin'], memberships: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { finishNewUser = resolve; }));
    await act(async () => { render(); await Promise.resolve(); });
    expect(container.querySelector('input')).not.toBeNull();

    await act(async () => { mocks.session = { access_token: 'other-user-token', user: { id: 'user-2' } }; render(); });
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain('Resolving authorized workspace');

    await act(async () => { finishNewUser({ systemRoleCodes: ['system_admin'], memberships: [] }); await Promise.resolve(); });
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('clears protected workspace content after logout', async () => {
    mocks.roles.mockResolvedValue({ systemRoleCodes: ['system_admin'], memberships: [] });
    await act(async () => { render(); await Promise.resolve(); });
    expect(container.querySelector('input')).not.toBeNull();
    await act(async () => { mocks.session = null; render(); });
    expect(container.querySelector('input')).toBeNull();
  });
});
