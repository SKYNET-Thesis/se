// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiSchoolClassroom } from '../../lib/api';
import { ClassroomDirectory } from './ClassroomDirectory';

const classrooms: ApiSchoolClassroom[] = [
  { id: 'room-1', organization_id: 'school-1', offering_id: 'offering-1', name: 'Alpha Lab', code: 'ALPHA', status: 'active', offering_title: 'Robotics 1', student_count: 3, teaching_staff_count: 1 },
];

describe('ClassroomDirectory', () => {
  let root: Root | undefined;
  afterEach(() => { act(() => root?.unmount()); root = undefined; });

  it('renders accessible search/filter controls and a deep link for the filtered page', async () => {
    const onSearch = vi.fn(); const onStatus = vi.fn(); const onPage = vi.fn();
    const container = document.createElement('div'); root = createRoot(container);
    act(() => root?.render(<MemoryRouter><ClassroomDirectory classrooms={classrooms} search="Alpha" status="active" page={1} pageCount={1} total={1} onSearch={onSearch} onStatus={onStatus} onPage={onPage} /></MemoryRouter>));
    expect(container.textContent).toContain('Alpha Lab');
    expect(container.querySelector('a[href="/school/classrooms/room-1"]')?.textContent).toBe('Open classroom');
    const status = container.querySelector('select[aria-label="Classroom status"]') as HTMLSelectElement;
    expect(status.value).toBe('active');
    expect(container.querySelector('input[aria-label="Search classrooms"]')).not.toBeNull();
    expect(container.querySelector('button[disabled]')?.textContent).toBe('Previous');
    expect(onSearch).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
    expect(onPage).not.toHaveBeenCalled();
  });
});
