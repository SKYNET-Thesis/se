// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassroomMembersSection } from './ClassroomMembersSection';

const api = vi.hoisted(() => ({
  classroomMembers: vi.fn(), memberCandidates: vi.fn(), upsertMember: vi.fn(), revokeMember: vi.fn(),
  previewClassroomStudentImport: vi.fn(), confirmClassroomStudentImport: vi.fn(), toast: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: api.toast } }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, educationAdminApi: { ...actual.educationAdminApi, classroomMembers: api.classroomMembers, memberCandidates: api.memberCandidates, upsertMember: api.upsertMember, revokeMember: api.revokeMember, previewClassroomStudentImport: api.previewClassroomStudentImport, confirmClassroomStudentImport: api.confirmClassroomStudentImport } };
});

const member = (over: Record<string, unknown>) => ({ id: 'cm-1', user_id: 'u-1', classroom_role: 'student', status: 'active', joined_at: '2026-09-01T08:00:00Z', full_name: 'Nguyen Minh Anh', email: 'anh@example.test', membership_role: 'student', ...over });
const roster = [
  member({}),
  member({ id: 'cm-2', user_id: 'u-2', full_name: 'Tran Bao Chau', email: 'chau.tran.with.a.very.long.address@students.example.test' }),
  member({ id: 'cm-3', user_id: 'u-3', classroom_role: 'teacher', full_name: 'Le Hoang Duc', email: 'duc@example.test', membership_role: 'instructor' }),
];
const preview = {
  processed: 4, newStudents: 1, existingStudents: 1, alreadyInClass: 1, needsReview: 1,
  rows: [
    { row: 2, firstName: 'An', lastName: 'Le', studentCode: 'S1', gradeLevel: '8', email: null, status: 'new_student', errors: [], warnings: [] },
    { row: 3, firstName: 'Bao', lastName: 'Tran', studentCode: 'S2', gradeLevel: '8', email: null, status: 'existing_student', errors: [], warnings: ['Profile data differs from CSV.'] },
    { row: 4, firstName: 'Chi', lastName: 'Pham', studentCode: 'S3', gradeLevel: '8', email: null, status: 'already_in_class', errors: [], warnings: [] },
    { row: 5, firstName: 'Dung', lastName: '', studentCode: 'S4', gradeLevel: '8', email: null, status: 'needs_review', errors: ['Last name is required.'], warnings: [] },
  ],
};
const CSV = 'first_name,last_name,student_code,grade_level\nAn,Le,S1,8\nBao,Tran,S2,8\nChi,Pham,S3,8\nDung,,S4,8\n';

let container: HTMLDivElement; let root: Root;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
/** Lets the Dialog's exit animation (200 ms) finish so a closed dialog has left the DOM. */
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); }); await flush(); };
const text = () => document.body.textContent ?? '';
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement;
const buttons = (label: string) => [...document.body.querySelectorAll('button')].filter((item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
const button = (label: string) => buttons(label)[0] as HTMLButtonElement;
const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); }); await flush(); };
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await flush();
};
const chooseFile = async (content: string, name = 'class-8a.csv') => {
  const input = dialog().querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => content });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await flush();
};
const mount = async () => {
  await act(async () => { root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ClassroomMembersSection organizationId="org1" classroomId="c1" classroomName="Robotics 8A" token="tok" /></QueryClientProvider>); });
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  api.classroomMembers.mockResolvedValue(roster);
  api.memberCandidates.mockResolvedValue({ items: [{ userId: 'u-9', displayName: 'Pham Quoc Huy', organizationRole: 'student', schoolCode: 'S-0099', accountState: 'account_setup_pending', alreadyMember: false }], page: 1, pageSize: 20, total: 1 });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.body.innerHTML = ''; });

describe('Classroom members roster', () => {
  it('lists students and teachers with the API’s names, emails and roles, and offers Remove only for students', async () => {
    await mount();
    expect(api.classroomMembers).toHaveBeenCalledWith('org1', 'c1', 'tok');
    expect(document.querySelector('#classroom-members')?.textContent).toBe('Members3');
    expect(text()).toContain('chau.tran.with.a.very.long.address@students.example.test');
    expect(buttons('Remove Nguyen Minh Anh').length).toBeGreaterThan(0);
    expect(buttons('Remove Le Hoang Duc')).toHaveLength(0); // the API removes students only
    const filters = [...document.querySelectorAll('[aria-label="Filter by role"] button')].map((item) => item.textContent);
    expect(filters).toEqual(['All3', 'Students2', 'Teachers1']);
  });

  it('searches by name or email, filters by role and offers a way out of no results', async () => {
    await mount();
    const search = document.querySelector('input[aria-label="Search members"]') as HTMLInputElement;
    await type(search, 'example.test');
    expect(text()).toContain('3 of 3');
    await click(button('Teachers1'));
    expect(document.querySelector('table tbody')?.textContent).toContain('Le Hoang Duc');
    expect(document.querySelector('table tbody')?.textContent).not.toContain('Nguyen Minh Anh');
    await type(search, 'nobody');
    expect(text()).toContain('No members match “nobody” among teachers.');
    await click(button('Clear filters'));
    expect(document.querySelectorAll('table tbody tr')).toHaveLength(3);
  });

  it('shows an empty roster and a load error with retry', async () => {
    api.classroomMembers.mockResolvedValueOnce([]);
    await mount();
    expect(text()).toContain('No members yet');
    expect(document.querySelector('input[aria-label="Search members"]')).toBeNull();
    await act(async () => root.unmount()); root = createRoot(container);
    api.classroomMembers.mockRejectedValueOnce(new Error('Members are unavailable.')).mockResolvedValueOnce(roster);
    await mount();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Members are unavailable.');
    await click(button('Try again'));
    expect(text()).toContain('Tran Bao Chau');
  });
});

describe('Remove student', () => {
  it('confirms in a VISTA dialog, sends one request, and refreshes the roster only after success', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    let resolveRemoval: (value: unknown) => void = () => undefined;
    api.revokeMember.mockReturnValue(new Promise((resolve) => { resolveRemoval = resolve; }));
    await mount();
    await click(button('Remove Nguyen Minh Anh'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain('Remove student?');
    expect(dialog().textContent).toContain('Nguyen Minh Anh');
    expect(dialog().textContent).toContain('Access through their other classrooms isn’t affected.');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.activeElement?.textContent).toBe('Cancel');
    const membersCalls = api.classroomMembers.mock.calls.length;
    await click(button('Remove student'));
    expect(button('Removing…').disabled).toBe(true); // pending, cannot be sent twice
    await click(button('Removing…'));
    expect(api.revokeMember).toHaveBeenCalledTimes(1);
    expect(api.revokeMember).toHaveBeenCalledWith('org1', 'c1', 'u-1', 'tok');
    expect(api.classroomMembers.mock.calls.length).toBe(membersCalls);
    await act(async () => { resolveRemoval({ removed: true }); }); await settle();
    expect(dialog()).toBeNull();
    expect(api.classroomMembers.mock.calls.length).toBeGreaterThan(membersCalls);
    expect(api.toast).toHaveBeenCalledWith('Nguyen Minh Anh removed from Robotics 8A');
  });

  it('keeps the dialog open with the server message when removal fails', async () => {
    api.revokeMember.mockRejectedValue(new Error('Classroom student was not found.'));
    await mount();
    await click(button('Remove Tran Bao Chau'));
    await click(button('Remove student'));
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('Classroom student was not found.');
    expect(api.toast).not.toHaveBeenCalled();
  });
});

describe('Add member', () => {
  it('adds the selected person with the existing { userId } body and refreshes members and candidates', async () => {
    api.upsertMember.mockResolvedValue({ id: 'cm-9' });
    await mount();
    await click(button('Add member'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); }); await flush();
    expect(dialog().textContent).toContain('Setup pending');
    expect((buttons('Add member').at(-1) as HTMLButtonElement).disabled).toBe(true);
    await click(dialog().querySelector('input[value="u-9"]') as HTMLInputElement);
    expect(dialog().textContent).toContain('Pham Quoc Huy joins as a student.');
    const candidateCalls = api.memberCandidates.mock.calls.length;
    await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); }); await flush();
    expect(api.upsertMember).toHaveBeenCalledWith('org1', 'c1', 'tok', { userId: 'u-9' });
    await settle();
    expect(dialog()).toBeNull();
    expect(api.toast).toHaveBeenCalledWith('Pham Quoc Huy added to Robotics 8A');
    expect(api.classroomMembers.mock.calls.length).toBeGreaterThan(1);
    expect(api.memberCandidates.mock.calls.length).toBeGreaterThanOrEqual(candidateCalls);
  });

  it('shows the server error inside the dialog and keeps the selection', async () => {
    api.upsertMember.mockRejectedValue(new Error('An active organization membership was not found.'));
    await mount();
    await click(button('Add member'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); }); await flush();
    await click(dialog().querySelector('input[value="u-9"]') as HTMLInputElement);
    await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); }); await flush();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('An active organization membership was not found.');
    expect((dialog().querySelector('input[value="u-9"]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('CSV import', () => {
  it('previews with the server, imports the addable rows and reports the server’s per-row results', async () => {
    api.previewClassroomStudentImport.mockResolvedValue(preview);
    api.confirmClassroomStudentImport.mockResolvedValue({ processed: 4, createdAndAdded: 1, existingAdded: 1, unchanged: 1, failed: 1, results: [
      { row: 2, status: 'created_and_added', name: 'An Le', studentCode: 'S1' }, { row: 3, status: 'existing_added', name: 'Bao Tran', studentCode: 'S2' },
      { row: 4, status: 'unchanged', name: 'Chi Pham', studentCode: 'S3' }, { row: 5, status: 'failed', code: 'VALIDATION_ERROR', message: 'Last name is required.', name: 'Dung', studentCode: 'S4' },
    ] });
    await mount();
    await click(button('Import students'));
    expect(dialog().querySelector('[aria-current="step"]')?.textContent).toContain('Choose file');
    await chooseFile(CSV);
    const sent = api.previewClassroomStudentImport.mock.calls[0][3] as { rows: unknown[] };
    expect(sent.rows).toHaveLength(4);
    expect(dialog().textContent).toContain('2 students will be added');
    expect(dialog().textContent).toContain('1 row needs fixing and will be skipped.');
    expect(dialog().textContent).toContain('Last name is required.');
    const confirm = button('Add 2 students');
    expect(confirm.disabled).toBe(false);
    await click(button('Needs fixing1'));
    expect(dialog().querySelectorAll('table tbody tr')).toHaveLength(1);
    const membersCalls = api.classroomMembers.mock.calls.length;
    await click(confirm);
    expect(api.confirmClassroomStudentImport).toHaveBeenCalledTimes(1);
    expect(api.confirmClassroomStudentImport.mock.calls[0][3]).toEqual(sent);
    expect(dialog().textContent).toContain('2 students added to Robotics 8A');
    expect(dialog().textContent).toContain('1 student was already in this class');
    expect(dialog().textContent).toContain('Row 5');
    expect(dialog().textContent).toContain('Download as CSV');
    expect(api.classroomMembers.mock.calls.length).toBeGreaterThan(membersCalls);
  });

  it('stops before calling the server when required columns are missing', async () => {
    await mount();
    await click(button('Import students'));
    await chooseFile('first_name,last_name\nAn,Le\n');
    expect(api.previewClassroomStudentImport).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('missing required columns: student_code, grade_level');
  });

  it('stops a file with quoted values before preview, so shifted columns are never sent or imported', async () => {
    await mount();
    await click(button('Import students'));
    await chooseFile('first_name,last_name,student_code,grade_level\n"Nguyen, Van",An,S2,8\n');
    expect(api.previewClassroomStudentImport).not.toHaveBeenCalled();
    expect(api.confirmClassroomStudentImport).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Quotation marks aren’t supported yet (row 2)');
  });

  it('cannot import when no row can be added', async () => {
    api.previewClassroomStudentImport.mockResolvedValue({ ...preview, newStudents: 0, existingStudents: 0, rows: preview.rows.slice(2) , processed: 2 });
    await mount();
    await click(button('Import students'));
    await chooseFile(CSV);
    expect(button('Nothing to add').disabled).toBe(true);
  });

  it('keeps the preview and refreshes the roster when the import request fails, without claiming success', async () => {
    api.previewClassroomStudentImport.mockResolvedValue(preview);
    api.confirmClassroomStudentImport.mockRejectedValue(new Error('Request timed out.'));
    await mount();
    await click(button('Import students'));
    await chooseFile(CSV);
    const membersCalls = api.classroomMembers.mock.calls.length;
    await click(button('Add 2 students'));
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('The import didn’t finish. Some students may already have been added');
    expect(dialog().textContent).not.toContain('added to Robotics 8A');
    expect(api.classroomMembers.mock.calls.length).toBeGreaterThan(membersCalls);
    expect(button('Add 2 students')).toBeDefined();
  });
});
