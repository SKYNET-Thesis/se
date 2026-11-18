// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddStudentDialog } from './AddStudentDialog';

const mocks = vi.hoisted(() => ({ importUsers: vi.fn() }));
vi.mock('../../lib/api', () => ({ educationAdminApi: { importUsers: mocks.importUsers } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement; let root: Root; const onCreated = vi.fn(); const onClose = vi.fn();
const setValue = (input: HTMLInputElement, value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
const render = async () => { await act(async () => { root.render(<AddStudentDialog open organizationId="org-1" token="tok" onClose={onClose} onCreated={onCreated} />); }); };
const fill = async () => { const inputs = Array.from(document.body.querySelectorAll('form input')) as HTMLInputElement[]; await act(async () => { ['Bao', 'Ngoc', 'S-001', '7'].forEach((v, i) => setValue(inputs[i], v)); }); };
const submit = async () => { await act(async () => { document.body.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };

describe('AddStudentDialog', () => {
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mocks.importUsers.mockReset(); onCreated.mockReset(); onClose.mockReset(); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('creates one student and shows the one-time temporary credential with its expiry', async () => {
    mocks.importUsers.mockResolvedValue({ processed: 1, created: 1, unchanged: 0, failed: 0, schoolCode: 'SCH1', results: [{ row: 2, status: 'created', studentCode: 'S-001', temporaryPassword: 'TempPassw0rd-abcdefghijklmnopqrstuvw', temporaryPasswordExpiresAt: '2030-01-01T00:00:00.000Z' }] });
    await render(); await fill(); await submit();
    expect(mocks.importUsers).toHaveBeenCalledWith('org-1', 'tok', { kind: 'students', rows: [{ firstName: 'Bao', lastName: 'Ngoc', studentCode: 'S-001', gradeLevel: '7' }] });
    expect(document.body.textContent).toContain('TempPassw0rd-abcdefghijklmnopqrstuvw');
    expect(document.body.textContent).toContain('SCH1'); expect(document.body.textContent).toMatch(/expires/i);
    expect(document.body.textContent).toContain('Copy credentials');
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('shows the legacy Setup Code when the rollout is off', async () => {
    mocks.importUsers.mockResolvedValue({ processed: 1, created: 1, unchanged: 0, failed: 0, schoolCode: 'SCH1', results: [{ row: 2, status: 'created', studentCode: 'S-001', setupCode: 'SetupCode-abcdefghijklmnopqrstuvwxyz' }] });
    await render(); await fill(); await submit();
    expect(document.body.textContent).toContain('SetupCode-abcdefghijklmnopqrstuvwxyz'); expect(document.body.textContent).toContain('Setup Code');
  });

  it('handles a duplicate student without issuing a credential', async () => {
    mocks.importUsers.mockResolvedValue({ processed: 1, created: 0, unchanged: 1, failed: 0, schoolCode: 'SCH1', results: [{ row: 2, status: 'unchanged', studentCode: 'S-001' }] });
    await render(); await fill(); await submit();
    expect(document.body.textContent).toContain('already exists'); expect(document.body.textContent).not.toContain('Copy credentials');
  });

  it('shows validation and server errors and stays on the form', async () => {
    mocks.importUsers.mockResolvedValue({ processed: 1, created: 0, unchanged: 0, failed: 1, results: [{ row: 2, status: 'failed', code: 'VALIDATION_ERROR', message: 'Grade is required.' }] });
    await render(); await fill(); await submit();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Grade is required.');
    mocks.importUsers.mockRejectedValue(new Error('Network down')); await submit();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Network down');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('keeps the submit button disabled until the required fields are filled', async () => {
    await render();
    const create = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Create student') as HTMLButtonElement;
    expect(create.disabled).toBe(true);
  });
});
