// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ offerings: vi.fn(), createCourseOffering: vi.fn(), managedOrganizations: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), educationAdminApi: api }));
const role = vi.hoisted(() => ({ value: { role: 'school_admin', memberships: [{ organizationId: 's1', roleCode: 'school_admin', status: 'active' }] } as { role: string; memberships: unknown[] } }));
vi.mock('../../contexts/RoleContext', () => ({ useOptionalRole: () => role.value }));

import { CourseOfferingsPanel } from './CourseOfferingsPanel';

let container: HTMLDivElement; let root: Root;
const course = { id: 'c1', title: 'SO-101 Beginner', status: 'published', organizationId: null as string | null };
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const mount = async (props: Partial<typeof course> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter><CourseOfferingsPanel course={{ ...course, ...props }} token="t" /></MemoryRouter></QueryClientProvider>); });
  await flush();
};
const type = async (selector: string, value: string) => { const input = document.querySelector(selector) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }); };
const click = async (text: string) => { const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(text)) as HTMLButtonElement; await act(async () => { button.click(); }); await flush(); };
const rows = [
  { id: 'o1', code: 'FALL', title: 'Fall class', status: 'active', courseId: 'c1', academicTerm: 'Fall', academicYear: 2026, classrooms: 2 },
  { id: 'o2', code: 'SPRING', title: 'Spring class', status: 'draft', courseId: 'c1', classrooms: 0 },
  { id: 'o3', code: 'OTHER', title: 'Another course', status: 'draft', courseId: 'c2', classrooms: 0 },
];

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.offerings.mockResolvedValue(rows); api.createCourseOffering.mockResolvedValue({ id: 'new' }); api.managedOrganizations.mockResolvedValue([{ id: 's1', name: 'North School', status: 'active' }, { id: 's2', name: 'Closed School', status: 'closed' }]);
  role.value = { role: 'school_admin', memberships: [{ organizationId: 's1', roleCode: 'school_admin', status: 'active' }] };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); });

describe('CourseOfferingsPanel', () => {
  it('lists only this course\'s offerings of the administrator\'s school, with term and classroom counts', async () => {
    await mount();
    expect(api.offerings).toHaveBeenCalledWith('s1', 't');
    const text = container.textContent ?? '';
    expect(text).toContain('2 offerings of this course');
    expect(text).toContain('Fall class'); expect(text).toContain('Fall 2026'); expect(text).toContain('2 classrooms');
    expect(text).toContain('Spring class'); expect(text).toContain('No term set');
    expect(text).not.toContain('Another course');
    expect(text).toContain('shared, never copied');
  });
  it('creates a draft offering of this course through the existing API and refreshes the list', async () => {
    await mount();
    await click('New offering');
    await type('input[name="code"]', ' SUMMER '); await type('input[name="academicTerm"]', 'Summer'); await type('input[name="academicYear"]', '2027');
    await act(async () => { (container.ownerDocument.querySelector('#course-offering-form') as HTMLFormElement).requestSubmit(); }); await flush();
    expect(api.createCourseOffering).toHaveBeenCalledWith('s1', 't', { courseId: 'c1', code: 'SUMMER', title: undefined, academicTerm: 'Summer', academicYear: 2027 });
    expect(api.offerings.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it('validates the code and year before calling the API, and shows the server\'s refusal (for example a duplicate code)', async () => {
    await mount(); await click('New offering');
    await act(async () => { (container.ownerDocument.querySelector('#course-offering-form') as HTMLFormElement).requestSubmit(); }); await flush();
    expect(api.createCourseOffering).not.toHaveBeenCalled();
    await type('input[name="code"]', 'FALL'); await type('input[name="academicYear"]', '26');
    await act(async () => { (container.ownerDocument.querySelector('#course-offering-form') as HTMLFormElement).requestSubmit(); }); await flush();
    expect(container.ownerDocument.body.textContent).toContain('four-digit year'); expect(api.createCourseOffering).not.toHaveBeenCalled();
    await type('input[name="academicYear"]', '2026'); api.createCourseOffering.mockRejectedValueOnce(new Error('An offering with this code already exists in the organization.'));
    await act(async () => { (container.ownerDocument.querySelector('#course-offering-form') as HTMLFormElement).requestSubmit(); }); await flush();
    expect(container.ownerDocument.body.textContent).toContain('already exists in the organization');
  });
  it('does not allow creating from a draft course and says why', async () => {
    await mount({ status: 'draft' });
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('New offering')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain('Only a published course can be offered');
  });
  it('explains a failed load with a retry instead of an empty list', async () => {
    api.offerings.mockRejectedValue(new Error('x'));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    expect(container.textContent).not.toContain('No offerings of this course yet');
  });
  it('shows an explicit empty state when the school has none yet', async () => {
    api.offerings.mockResolvedValue([rows[2]]);
    await mount();
    expect(container.textContent).toContain('No offerings of this course yet in this school.');
  });
  it('does not offer another school\'s course, and never queries offerings for it', async () => {
    await mount({ organizationId: 's2' });
    expect(container.textContent).toContain('belongs to another school');
    expect(api.offerings).not.toHaveBeenCalled();
  });
  it('shows nothing to an instructor', async () => {
    role.value = { role: 'teacher', memberships: [{ organizationId: 's1', roleCode: 'teacher', status: 'active' }] };
    await mount();
    expect(container.querySelector('section')).toBeNull();
    expect(api.offerings).not.toHaveBeenCalled();
  });
  it('lets a system administrator choose an active school for a global course, then loads that school\'s offerings', async () => {
    role.value = { role: 'admin', memberships: [] };
    await mount();
    expect(container.textContent).toContain('Choose a school to see and create');
    const options = [...container.querySelectorAll('select[aria-label="School"] option')].map((option) => option.textContent);
    expect(options).toEqual(['Choose a school', 'North School']);                                  // closed schools are not offered
    const select = container.querySelector('select[aria-label="School"]') as HTMLSelectElement;
    await act(async () => { select.value = 's1'; select.dispatchEvent(new Event('change', { bubbles: true })); }); await flush();
    expect(api.offerings).toHaveBeenCalledWith('s1', 't');
  });
  it('uses the owning school for a system administrator on a school-owned course (no chooser)', async () => {
    role.value = { role: 'admin', memberships: [] };
    await mount({ organizationId: 's7' });
    expect(container.querySelector('select[aria-label="School"]')).toBeNull();
    expect(api.offerings).toHaveBeenCalledWith('s7', 't');
  });
});
