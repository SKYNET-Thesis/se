// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from './Login';

const authMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  roles: vi.fn(),
  studentLogin: vi.fn(),
  studentSetup: vi.fn(),
  studentRecover: vi.fn(),
}));

const mockSessionState = {
  client: {
    auth: {
      signInWithPassword: authMocks.signInWithPassword,
      setSession: authMocks.setSession,
      signOut: authMocks.signOut,
    },
  },
  session: null,
  loading: false,
  configurationError: null,
};

vi.mock('../contexts/SupabaseSessionContext', () => ({
  useSupabaseSession: () => mockSessionState,
}));

vi.mock('../lib/api', () => ({
  identityApi: {
    roles: authMocks.roles,
  },
  studentAuthApi: {
    login: authMocks.studentLogin,
    setup: authMocks.studentSetup,
    recover: authMocks.studentRecover,
  },
}));

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('Login Component', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    Object.values(authMocks).forEach((mock) => mock.mockReset());
    mockSessionState.session = null;
    mockSessionState.loading = false;
    mockSessionState.configurationError = null;

    authMocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'email-token', refresh_token: 'email-refresh' } },
      error: null,
    });
    authMocks.setSession.mockResolvedValue({
      data: { session: { access_token: 'student-token', refresh_token: 'student-refresh' } },
      error: null,
    });
    authMocks.signOut.mockResolvedValue({});
    authMocks.roles.mockResolvedValue({
      systemRoleCodes: ['system_admin'],
      memberships: [{ roleCode: 'student', status: 'active' }],
    });
    authMocks.studentLogin.mockResolvedValue({
      access_token: 'student-token',
      refresh_token: 'student-refresh',
      expires_in: 3600,
      token_type: 'bearer',
    });
    authMocks.studentSetup.mockResolvedValue({
      access_token: 'setup-token',
      refresh_token: 'setup-refresh',
      expires_in: 3600,
      token_type: 'bearer',
    });
    authMocks.studentRecover.mockResolvedValue({
      status: 'password_updated',
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>,
      );
    });
    await tick();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const input = (selector: string) => container.querySelector(selector) as HTMLInputElement;

  const change = async (selector: string, value: string) => {
    await act(async () => {
      const field = input(selector);
      if (!field) throw new Error(`Input not found: ${selector}`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });
  };

  const clickButton = async (text: string) => {
    await act(async () => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));
      if (!btn) throw new Error(`Button "${text}" not found`);
      btn.click();
    });
    await tick();
  };

  it('renders email sign-in by default and submits successfully', async () => {
    expect(container.querySelector('#login-email')).toBeDefined();
    await change('#login-email', 'teacher@school.edu');
    await change('#login-password', 'SecretPassword123');
    await clickButton('Sign in');

    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'teacher@school.edu',
      password: 'SecretPassword123',
    });
    expect(authMocks.roles).toHaveBeenCalledWith('email-token');
  });

  it('switches to Student Code tab and signs in with school and student codes', async () => {
    await clickButton('Student Code');

    expect(container.querySelector('#login-school-code')).toBeDefined();
    expect(container.querySelector('#login-student-code')).toBeDefined();

    await change('#login-school-code', 'vst-school');
    await change('#login-student-code', 'stu-42');
    await change('#login-password', 'StudentPassword123');
    await clickButton('Sign in');

    expect(authMocks.studentLogin).toHaveBeenCalledWith({
      schoolCode: 'vst-school',
      studentCode: 'stu-42',
      password: 'StudentPassword123',
    });
    expect(authMocks.setSession).toHaveBeenCalledWith({
      access_token: 'student-token',
      refresh_token: 'student-refresh',
    });
    expect(authMocks.roles).toHaveBeenCalledWith('student-token');
  });

  it('navigates to first-time setup and activates account', async () => {
    await clickButton('Student Code');
    await clickButton('First time here? Set up your account');

    expect(container.textContent).toContain('Set up account.');
    expect(container.querySelector('#login-setup-code')).toBeDefined();
    expect(container.querySelector('#login-password-confirm')).toBeDefined();

    await change('#login-school-code', 'VST-ACADEMY');
    await change('#login-student-code', 'NEW-STUDENT');
    await change('#login-setup-code', 'ONE-TIME-SETUP-CODE-12345');
    await change('#login-password', 'LongSecurePassword123');
    await change('#login-password-confirm', 'LongSecurePassword123');

    await clickButton('Activate account & sign in');

    expect(authMocks.studentSetup).toHaveBeenCalledWith({
      schoolCode: 'VST-ACADEMY',
      studentCode: 'NEW-STUDENT',
      setupCode: 'ONE-TIME-SETUP-CODE-12345',
      password: 'LongSecurePassword123',
    });
    expect(authMocks.setSession).toHaveBeenCalledWith({
      access_token: 'setup-token',
      refresh_token: 'setup-refresh',
    });
  });

  it('rejects first-time setup when passwords do not match', async () => {
    await clickButton('Student Code');
    await clickButton('First time here? Set up your account');

    await change('#login-school-code', 'VST-ACADEMY');
    await change('#login-student-code', 'NEW-STUDENT');
    await change('#login-setup-code', 'ONE-TIME-SETUP-CODE-12345');
    await change('#login-password', 'LongSecurePassword123');
    await change('#login-password-confirm', 'DifferentPassword123');

    await clickButton('Activate account & sign in');

    expect(authMocks.studentSetup).not.toHaveBeenCalled();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('passwords do not match');
  });

  it('navigates to account recovery, resets password and returns to sign-in with success message', async () => {
    await clickButton('Student Code');
    await clickButton('Forgot password?');

    expect(container.textContent).toContain('Reset password.');
    expect(container.querySelector('#login-recovery-code')).toBeDefined();

    await change('#login-school-code', 'VST-SCHOOL');
    await change('#login-student-code', 'STU-100');
    await change('#login-recovery-code', 'RECOVERY-TOKEN-ABCDE-12345');
    await change('#login-password', 'NewFreshPassword123');
    await change('#login-password-confirm', 'NewFreshPassword123');

    await clickButton('Reset password');

    expect(authMocks.studentRecover).toHaveBeenCalledWith({
      schoolCode: 'VST-SCHOOL',
      studentCode: 'STU-100',
      recoveryCode: 'RECOVERY-TOKEN-ABCDE-12345',
      password: 'NewFreshPassword123',
    });

    // Returned to sign-in screen
    expect(container.textContent).toContain('Enter VISTA.');
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('password has been reset');
  });

  it('toggles password visibility with accessible button', async () => {
    const passwordInput = input('#login-password');
    expect(passwordInput.type).toBe('password');

    const toggleBtn = container.querySelector('button[aria-label="Show password"]') as HTMLButtonElement;
    expect(toggleBtn).toBeDefined();

    await act(async () => { toggleBtn.click(); });
    await tick();

    expect(passwordInput.type).toBe('text');
    expect(toggleBtn.getAttribute('aria-label')).toBe('Hide password');
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('displays error and signs out client when credentials are invalid', async () => {
    authMocks.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('Invalid login credentials'),
    });

    await change('#login-email', 'wrong@school.edu');
    await change('#login-password', 'wrong-pass');
    await clickButton('Sign in');

    expect(authMocks.signOut).toHaveBeenCalled();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Invalid login credentials');
  });

  it('rejects student sign-in when account lacks active student membership', async () => {
    authMocks.roles.mockResolvedValueOnce({
      systemRoleCodes: [],
      memberships: [{ roleCode: 'teacher', status: 'active' }],
    });

    await clickButton('Student Code');
    await change('#login-school-code', 'VST-SCHOOL');
    await change('#login-student-code', 'NOT-STUDENT');
    await change('#login-password', 'StudentPassword123');
    await clickButton('Sign in');

    expect(authMocks.signOut).toHaveBeenCalled();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('no active student access');
  });
});
