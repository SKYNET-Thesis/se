// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  classrooms: vi.fn(), members: vi.fn(), publishedCourses: vi.fn(), createCourseOffering: vi.fn(), createClassroom: vi.fn(),
  updateClassroom: vi.fn(), archiveClassroom: vi.fn(), reactivateClassroom: vi.fn(), offerings: vi.fn(), assignClassroomOffering: vi.fn(), toast: vi.fn(),
  role: { memberships: [{ id: 'm1', organizationId: 'org1', roleCode: 'school_admin', status: 'active' }], loading: false } as { memberships: unknown[]; loading: boolean },
}));
vi.mock('../../contexts/SupabaseSessionContext', () => ({ useSupabaseSession: () => ({ session: { access_token: 'tok' }, loading: false }) }));
vi.mock('../../contexts/RoleContext', () => ({ useRole: () => ({ role: 'school_admin', error: null, ...mocks.role }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.toast } }));
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, educationAdminApi: { ...actual.educationAdminApi, classrooms: mocks.classrooms, classroomMembers: mocks.members, publishedCourses: mocks.publishedCourses,
    createCourseOffering: mocks.createCourseOffering, createClassroom: mocks.createClassroom, updateClassroom: mocks.updateClassroom, archiveClassroom: mocks.archiveClassroom,
    reactivateClassroom: mocks.reactivateClassroom, offerings: mocks.offerings, assignClassroomOffering: mocks.assignClassroomOffering } };
});

import { ApiError } from '../../lib/api';
import { ClassroomDetailPage } from './ClassroomDetailPage';
import { ClassroomsPage } from './ClassroomsPage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
let container: HTMLDivElement; let root: Root; let location = '';
function LocationProbe() { const current = useLocation(); location = current.pathname + current.search; return null; }
const mount = async (path: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><LocationProbe /><Routes>
    <Route path="/school/classrooms" element={<ClassroomsPage />} />
    <Route path="/school/classrooms/:classroomId" element={<ClassroomDetailPage />} />
  </Routes></MemoryRouter></QueryClientProvider>); });
  await flush();
};
const text = () => document.body.textContent ?? '';
const button = (label: string) => [...document.body.querySelectorAll('button')].find((item) => item.textContent?.trim() === label) as HTMLButtonElement;
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement;
const type = async (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
  const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => { setValue?.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
const click = async (element: Element) => { await act(async () => { (element as HTMLElement).click(); }); await flush(); };
const moreActions = () => document.body.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
/** Archive sits in the More actions menu: open it, check the menu semantics, choose the item. */
const openArchiveFromMenu = async () => {
  const trigger = moreActions() as HTMLButtonElement;
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  await click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const item = document.body.querySelector('[role="menu"] [role="menuitem"]') as HTMLElement;
  expect(item.textContent).toBe('Archive classroom');
  expect(document.activeElement).toBe(item);
  await click(item);
};
const room = (over: Record<string, unknown>) => ({ id: 'c1', organization_id: 'org1', offering_id: 'f1', name: 'Robotics 8A', code: 'ROB-8A', description: null, capacity: 30, status: 'active', offering_title: 'Robotics Foundations', student_count: 12, teaching_staff_count: 1, allocated_robot: null, ...over });

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mocks.role.loading = false; mocks.role.memberships = [{ id: 'm1', organizationId: 'org1', roleCode: 'school_admin', status: 'active' }];
  mocks.classrooms.mockResolvedValue([room({}), room({ id: 'c2', name: 'Coding 9B', code: 'COD-9B', status: 'archived', capacity: null, student_count: 0, teaching_staff_count: 0, offering_title: 'Blockly Basics' })]);
  mocks.members.mockResolvedValue([]); mocks.offerings.mockResolvedValue([]);
  mocks.publishedCourses.mockResolvedValue([{ id: 'k1', title: 'Robotics Foundations', description: null, status: 'published' }]);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); });

describe('Classroom list', () => {
  it('lists classrooms with real status labels, enrollment against capacity and row links', async () => {
    await mount('/school/classrooms');
    const rows = [...document.body.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Coding 9B'); expect(rows[0].textContent).toContain('Archived');
    expect(rows[1].textContent).toContain('12 / 30'); expect(rows[1].textContent).toContain('Active');
    expect(rows[0].querySelector('.bg-ok-soft')).toBeNull(); // archived is never shown in the success colour
    expect(rows[1].querySelector('a')?.getAttribute('href')).toBe('/school/classrooms/c1');
    expect(document.body.querySelector('.vista-school')).toBeNull(); // one VISTA palette for every role, no role scope
  });

  it('searches and filters through the URL and offers a way out of no results', async () => {
    await mount('/school/classrooms');
    await type(document.body.querySelector('input[type="search"]') as HTMLInputElement, 'cod');
    expect(location).toBe('/school/classrooms?q=cod');
    expect(document.body.querySelectorAll('tbody tr')).toHaveLength(1);
    await click(button('Active1'));
    expect(location).toContain('status=active');
    expect(text()).toContain('No classrooms match');
    await click(button('Clear filters'));
    expect(location).toBe('/school/classrooms');
    expect(document.body.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('restores filters from the URL on reload', async () => {
    await mount('/school/classrooms?status=archived');
    expect(button('Archived1').getAttribute('aria-pressed')).toBe('true');
    expect(document.body.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('shows an empty state with the create action, and a load error with retry', async () => {
    mocks.classrooms.mockResolvedValueOnce([]);
    await mount('/school/classrooms');
    expect(text()).toContain('No classrooms yet');
    await act(async () => root.unmount()); root = createRoot(container);
    mocks.classrooms.mockRejectedValueOnce(new ApiError(500, 'Classrooms are unavailable.'));
    await mount('/school/classrooms');
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Classrooms are unavailable.');
    const filters = () => [...document.body.querySelectorAll('[aria-label="Filter by status"] button')].map((item) => item.textContent);
    expect(filters()).toEqual(['All', 'Active', 'Archived']); // no "0" counts for a list that failed to load
    await click(button('Try again'));
    expect(filters()).toEqual(['All2', 'Active1', 'Archived1']);
    expect(mocks.classrooms).toHaveBeenCalledTimes(3);
    expect(document.body.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});

describe('Create classroom', () => {
  it('validates before sending and focuses the first invalid field', async () => {
    await mount('/school/classrooms');
    await click(button('Create classroom'));
    await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); });
    await flush();
    expect(mocks.createCourseOffering).not.toHaveBeenCalled();
    expect(dialog().textContent).toContain('Enter a classroom name.');
    expect(dialog().textContent).toContain('Choose a catalog course.');
    expect(document.activeElement?.getAttribute('name')).toBe('name');
    expect((dialog().querySelector('[name="name"]') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a duplicate classroom code on the Code field inside the dialog and keeps the input', async () => {
    mocks.createCourseOffering.mockResolvedValue({ id: 'f9' });
    mocks.createClassroom.mockRejectedValue(new ApiError(409, 'A classroom with this code already exists in the organization.'));
    await mount('/school/classrooms');
    await click(button('Create classroom'));
    await type(dialog().querySelector('[name="name"]') as HTMLInputElement, 'Robotics 8C');
    await type(dialog().querySelector('[name="code"]') as HTMLInputElement, 'ROB-8A');
    await type(dialog().querySelector('[name="courseId"]') as HTMLSelectElement, 'k1');
    await type(dialog().querySelector('[name="offeringCode"]') as HTMLInputElement, 'ROB-2026-8C');
    await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); });
    await flush();
    expect(mocks.createCourseOffering).toHaveBeenCalledWith('org1', 'tok', { courseId: 'k1', code: 'ROB-2026-8C', title: undefined });
    expect(mocks.createClassroom).toHaveBeenCalledWith('org1', 'tok', expect.objectContaining({ name: 'Robotics 8C', code: 'ROB-8A', offeringId: 'f9' }));
    const code = dialog().querySelector('[name="code"]') as HTMLInputElement;
    expect(code.getAttribute('aria-invalid')).toBe('true');
    expect(dialog().textContent).toContain('A classroom with this code already exists');
    expect((dialog().querySelector('[name="name"]') as HTMLInputElement).value).toBe('Robotics 8C');
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('lists the eligible published global courses returned for the organization', async () => {
    mocks.publishedCourses.mockResolvedValue([
      { id: 'k1', title: 'Robotics Foundations', description: null, status: 'published' },
      { id: 'k2', title: 'Sensors and Motion', description: null, status: 'published' },
    ]);
    await mount('/school/classrooms');
    await click(button('Create classroom'));
    expect(mocks.publishedCourses).toHaveBeenCalledWith('org1', 'tok');
    const select = dialog().querySelector('[name="courseId"]') as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect([...select.options].map((option) => option.textContent)).toEqual(['Choose a course', 'Robotics Foundations', 'Sensors and Motion']);
    expect(dialog().querySelector('[role="status"]')).toBeNull();
    const submit = [...dialog().querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Create classroom') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('explains why creation is unavailable when no published global course exists, and blocks submit', async () => {
    mocks.publishedCourses.mockResolvedValue([]);
    await mount('/school/classrooms');
    await click(button('Create classroom'));
    const notice = dialog().querySelector('[role="status"]');
    expect(notice?.textContent).toContain('Classroom creation is unavailable right now.');
    expect(notice?.textContent).toContain('Courses that belong only to your school cannot be used here.');
    expect(notice?.textContent).toContain('Ask a System Administrator to publish a catalog course');
    // The notice comes before the first field, so it is read before anyone starts typing.
    const nameField = dialog().querySelector('[name="name"]') as HTMLInputElement;
    expect((notice as Element).compareDocumentPosition(nameField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((dialog().querySelector('[name="courseId"]') as HTMLSelectElement).disabled).toBe(true);
    const submit = [...dialog().querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Create classroom') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(mocks.createCourseOffering).not.toHaveBeenCalled();
  });

  it('reports a course list failure with retry, blocks submit, and recovers when the retry succeeds', async () => {
    mocks.publishedCourses.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    await mount('/school/classrooms');
    await click(button('Create classroom'));
    const alert = dialog().querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The course catalog couldn’t be loaded.');
    expect(dialog().querySelector('[role="status"]')).toBeNull();
    expect((dialog().querySelector('[name="courseId"]') as HTMLSelectElement).disabled).toBe(true);
    const submit = () => [...dialog().querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Create classroom') as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    await click(button('Try again'));
    expect(mocks.publishedCourses).toHaveBeenCalledTimes(2);
    expect(dialog().querySelector('[role="alert"]')).toBeNull();
    expect((dialog().querySelector('[name="courseId"]') as HTMLSelectElement).disabled).toBe(false);
    expect(submit().disabled).toBe(false);
  });

  it('navigates to the new classroom only after the server confirms', async () => {
    mocks.createCourseOffering.mockResolvedValue({ id: 'f9' });
    mocks.createClassroom.mockResolvedValue(room({ id: 'c9', name: 'Robotics 8C', code: 'ROB-8C' }));
    await mount('/school/classrooms');
    await click(button('Create classroom'));
    await type(dialog().querySelector('[name="name"]') as HTMLInputElement, 'Robotics 8C');
    await type(dialog().querySelector('[name="code"]') as HTMLInputElement, 'ROB-8C');
    await type(dialog().querySelector('[name="courseId"]') as HTMLSelectElement, 'k1');
    await type(dialog().querySelector('[name="offeringCode"]') as HTMLInputElement, 'ROB-2026-8C');
    await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); });
    await flush();
    expect(mocks.toast).toHaveBeenCalledWith('Classroom created', { description: 'Robotics 8C' });
    expect(location).toBe('/school/classrooms/c9');
  });
});

describe('Classroom detail', () => {
  it('loads on direct navigation while the role resolves, then shows the classroom', async () => {
    mocks.role.loading = true; mocks.role.memberships = [];
    await mount('/school/classrooms/c1');
    expect(document.body.querySelector('[aria-label="Loading classroom…"]')).not.toBeNull();
    expect(text()).not.toContain('Classroom not found');
    await act(async () => root.unmount()); root = createRoot(container);
    mocks.role.loading = false; mocks.role.memberships = [{ id: 'm1', organizationId: 'org1', roleCode: 'school_admin', status: 'active' }];
    await mount('/school/classrooms/c1');
    expect(document.body.querySelector('h1')?.textContent).toBe('Robotics 8A');
    expect(text()).toContain('12 of 30');
    expect(document.body.querySelector('[aria-hidden="true"] > [style*="width: 40%"]')).not.toBeNull();
    expect(button('Edit details').className).toContain('bg-accent');
    expect(document.body.querySelector('a[href="/school/quizzes?classroomId=c1"]')?.textContent).toBe('Open quizzes');
    expect(mocks.members).toHaveBeenCalledWith('org1', 'c1', 'tok');
  });

  it('shows not found for an unknown or inaccessible classroom', async () => {
    await mount('/school/classrooms/nope');
    expect(text()).toContain('Classroom not found');
    expect(document.body.querySelector('a[href="/school/classrooms"]')).not.toBeNull();
  });

  it('explains why an archived classroom cannot change course and offers Reactivate', async () => {
    await mount('/school/classrooms/c2');
    const reassign = button('Change course');
    expect(reassign.disabled).toBe(true);
    expect(document.getElementById(reassign.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Reactivate it to change the course');
    expect(button('Reactivate').className).toContain('bg-accent');
    expect(moreActions()).toBeNull();
  });

  it('archives only after confirmation and reports success after the server answers', async () => {
    mocks.archiveClassroom.mockResolvedValue({ id: 'c1', status: 'archived' });
    await mount('/school/classrooms/c1');
    await openArchiveFromMenu();
    expect(dialog().textContent).toContain('Archive classroom?');
    expect(mocks.archiveClassroom).not.toHaveBeenCalled();
    await click(button('Archive classroom'));
    expect(mocks.archiveClassroom).toHaveBeenCalledWith('org1', 'c1', 'tok');
    expect(mocks.toast).toHaveBeenCalledWith('Robotics 8A archived', { description: 'Students keep their work. You can reactivate the classroom later.' });
  });

  it('keeps the archive dialog open with the server error when archiving fails', async () => {
    mocks.archiveClassroom.mockRejectedValue(new ApiError(409, 'Only active classrooms can be archived.'));
    await mount('/school/classrooms/c1');
    await openArchiveFromMenu();
    await click(button('Archive classroom'));
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('Only active classrooms can be archived.');
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('sends an emptied description as "" so the server clears it', async () => {
    mocks.classrooms.mockResolvedValue([room({ description: 'Tuesday lab group', capacity: null })]);
    mocks.updateClassroom.mockResolvedValue(room({}));
    await mount('/school/classrooms/c1');
    expect(document.body.querySelector('[style*="width:"]')).toBeNull(); // no capacity, no invented bar
    await click(button('Edit details'));
    await type(dialog().querySelector('[name="description"]') as HTMLTextAreaElement, '');
    await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); });
    await flush();
    expect(mocks.updateClassroom).toHaveBeenCalledWith('org1', 'c1', 'tok', { name: 'Robotics 8A', code: 'ROB-8A', description: '' });
    expect(mocks.toast).toHaveBeenCalledWith('Classroom saved');
  });
});

describe('Classroom lifecycle (A03)', () => {
  const offerings = [
    { id: 'f1', code: 'RF-2026', title: 'Robotics Foundations', status: 'active' },
    { id: 'f2', code: 'RD-2026', title: 'Robot Discovery', status: 'active' },
    { id: 'f3', code: 'OLD-2025', title: 'Retired Course', status: 'archived' },
  ];
  const buttons = (label: string) => [...document.body.querySelectorAll('button')].filter((item) => item.textContent?.trim() === label);
  const options = () => [...dialog().querySelectorAll('select[name="offeringId"] option')].map((item) => item.textContent);
  const choose = async (value: string) => type(dialog().querySelector('select[name="offeringId"]') as HTMLSelectElement, value);
  const submitChange = async () => { await act(async () => { (dialog().querySelector('form') as HTMLFormElement).requestSubmit(); }); await flush(); };

  it('reports the enrollments the server released when archiving, then refreshes the classroom', async () => {
    mocks.archiveClassroom.mockResolvedValue({ id: 'c1', status: 'archived', releasedEnrollments: 12 });
    await mount('/school/classrooms/c1');
    const loads = mocks.classrooms.mock.calls.length;
    await openArchiveFromMenu();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.activeElement?.textContent).toBe('Cancel'); // the safe action starts focused
    await click(button('Archive classroom'));
    expect(mocks.archiveClassroom).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith('Robotics 8A archived', { description: 'Course access ended for 12 students in this classroom. Their work is kept.' });
    expect(mocks.classrooms.mock.calls.length).toBeGreaterThan(loads);
  });

  it('does not claim access came back when the server restored none', async () => {
    mocks.classrooms.mockResolvedValue([room({ id: 'c2', name: 'Coding 9B', status: 'archived', student_count: 5 })]);
    mocks.reactivateClassroom.mockResolvedValue({ id: 'c2', status: 'active', restoredEnrollments: 0 });
    await mount('/school/classrooms/c2');
    await click(button('Reactivate'));
    expect(dialog().textContent).toContain('get course access back if its course is still running');
    await click(button('Reactivate classroom'));
    expect(mocks.toast).toHaveBeenCalledWith('Coding 9B reactivated', { description: 'No course access was restored. Check that the classroom’s course is still running.' });
  });

  it('reports restored access from the List row menu too', async () => {
    mocks.classrooms.mockResolvedValue([room({ id: 'c2', name: 'Coding 9B', code: 'COD-9B', status: 'archived', student_count: 3 })]);
    mocks.reactivateClassroom.mockResolvedValue({ id: 'c2', status: 'active', restoredEnrollments: 3 });
    await mount('/school/classrooms');
    await click(document.body.querySelector('button[aria-label="Actions for Coding 9B"]') as HTMLButtonElement);
    await click([...document.body.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === 'Reactivate classroom') as HTMLElement);
    await click(button('Reactivate classroom'));
    expect(mocks.reactivateClassroom).toHaveBeenCalledWith('org1', 'c2', 'tok');
    expect(mocks.toast).toHaveBeenCalledWith('Coding 9B reactivated', { description: 'Course access is back for 3 students.' });
  });

  it('explains permission and stale-data errors, keeps the dialog open and refreshes on 404', async () => {
    mocks.reactivateClassroom.mockRejectedValueOnce(new ApiError(403, 'Forbidden resource'));
    mocks.classrooms.mockResolvedValue([room({ id: 'c2', name: 'Coding 9B', status: 'archived' })]);
    await mount('/school/classrooms/c2');
    await click(button('Reactivate'));
    await click(button('Reactivate classroom'));
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('Your account isn’t allowed to manage classrooms in this school.');
    const loads = mocks.classrooms.mock.calls.length;
    mocks.reactivateClassroom.mockRejectedValueOnce(new ApiError(404, 'Classroom was not found.'));
    await click(button('Reactivate classroom'));
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('wasn’t found');
    expect(mocks.classrooms.mock.calls.length).toBeGreaterThan(loads);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('shows the current course, offers only other active courses, and changes it after the server confirms', async () => {
    mocks.offerings.mockResolvedValue(offerings);
    mocks.assignClassroomOffering.mockResolvedValue({ id: 'c1', offeringId: 'f2', status: 'active' });
    await mount('/school/classrooms/c1');
    await click(button('Change course'));
    expect(dialog().textContent).toContain('Robotics FoundationsRF-2026Current');
    expect(options()).toEqual(['Choose a course', 'Robot Discovery (RD-2026)']); // not the current one, not the archived one
    expect((buttons('Change course').at(-1) as HTMLButtonElement).disabled).toBe(true);
    await choose('f2');
    const loads = mocks.classrooms.mock.calls.length;
    await submitChange();
    expect(mocks.assignClassroomOffering).toHaveBeenCalledTimes(1);
    expect(mocks.assignClassroomOffering).toHaveBeenCalledWith('org1', 'c1', 'f2', 'tok');
    expect(mocks.toast).toHaveBeenCalledWith('Course changed', { description: 'Robotics 8A now uses Robot Discovery.' });
    expect(mocks.classrooms.mock.calls.length).toBeGreaterThan(loads);
  });

  it('explains a course the server refuses and refreshes the data behind the dialog', async () => {
    mocks.offerings.mockResolvedValue(offerings);
    mocks.assignClassroomOffering.mockRejectedValue(new ApiError(404, 'An active offering for a published global course was not found.'));
    await mount('/school/classrooms/c1');
    await click(button('Change course'));
    await choose('f2');
    const loads = mocks.offerings.mock.calls.length;
    await submitChange();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('This course can’t be assigned. Only VISTA catalog courses your school is running can be used. Choose another course.');
    expect(mocks.offerings.mock.calls.length).toBeGreaterThan(loads);
    expect(mocks.toast).not.toHaveBeenCalled();
    // The refused course stays listed but can't be chosen again, and the selection is cleared.
    const refused = dialog().querySelector('select[name="offeringId"] option[value="f2"]') as HTMLOptionElement;
    expect(refused.disabled).toBe(true);
    expect(refused.textContent).toBe('Robot Discovery (RD-2026) · can’t be assigned');
    expect((dialog().querySelector('select[name="offeringId"]') as HTMLSelectElement).value).toBe('');
    expect((buttons('Change course').at(-1) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not mark a course ineligible after network, server or classroom-not-found errors', async () => {
    mocks.offerings.mockResolvedValue(offerings);
    mocks.assignClassroomOffering
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new ApiError(500, 'Database unavailable.'))
      .mockRejectedValueOnce(new ApiError(404, 'Classroom was not found.'))
      .mockResolvedValueOnce({ id: 'c1', offeringId: 'f2', status: 'active' });
    await mount('/school/classrooms/c1');
    await click(button('Change course'));
    await choose('f2');
    const option = () => dialog().querySelector('select[name="offeringId"] option[value="f2"]') as HTMLOptionElement;
    const expectRetryable = (message: string) => {
      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(message);
      expect(option().disabled).toBe(false);
      expect(option().textContent).toBe('Robot Discovery (RD-2026)');
      expect((dialog().querySelector('select[name="offeringId"]') as HTMLSelectElement).value).toBe('f2');
    };
    await submitChange();
    expectRetryable('VISTA couldn’t be reached.');
    await submitChange();
    expectRetryable('Database unavailable.');
    await submitChange();
    expectRetryable('This classroom wasn’t found.');
    await submitChange(); // the same choice can be retried and succeeds
    expect(mocks.assignClassroomOffering).toHaveBeenCalledTimes(4);
    expect(mocks.toast).toHaveBeenCalledWith('Course changed', { description: 'Robotics 8A now uses Robot Discovery.' });
  });

  it('explains a classroom archived elsewhere when changing its course', async () => {
    mocks.offerings.mockResolvedValue(offerings);
    mocks.assignClassroomOffering.mockRejectedValue(new ApiError(409, 'Reactivate the classroom before changing its course offering.'));
    await mount('/school/classrooms/c1');
    await click(button('Change course'));
    await choose('f2');
    await submitChange();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('This classroom has been archived, so its course can’t be changed. Reactivate it first.');
  });

  it('offers retry when courses fail to load, and says so when there is no other course', async () => {
    mocks.offerings.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce([offerings[0], offerings[2]]);
    await mount('/school/classrooms/c1');
    await click(button('Change course'));
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Your school’s courses couldn’t be loaded.');
    expect(dialog().querySelector('select')).toBeNull();
    await click(button('Try again'));
    expect(dialog().textContent).toContain('Your school isn’t running another course right now.');
    expect((buttons('Change course').at(-1) as HTMLButtonElement).disabled).toBe(true);
  });
});
