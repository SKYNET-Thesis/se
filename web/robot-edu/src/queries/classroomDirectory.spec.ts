import { describe, expect, it } from 'vitest';
import { filterClassrooms, paginateClassrooms, type ClassroomDirectoryFilters } from './classroomDirectory';
import type { ApiSchoolClassroom } from '../lib/api';

const classrooms: ApiSchoolClassroom[] = [
  { id: 'c1', organization_id: 'school-1', offering_id: 'o1', name: 'Alpha Lab', code: 'ALPHA', status: 'active', offering_title: 'Robotics 1', student_count: 12, teaching_staff_count: 1 },
  { id: 'c2', organization_id: 'school-1', offering_id: 'o2', name: 'Beta Room', code: 'BETA', status: 'archived', offering_title: 'Robotics 2', student_count: 4, teaching_staff_count: 2 },
  { id: 'c3', organization_id: 'school-1', offering_id: 'o1', name: 'Gamma Lab', code: 'GAMMA', status: 'active', offering_title: 'Robotics 1', student_count: 0, teaching_staff_count: 0 },
];

describe('classroom directory model', () => {
  it('searches classroom name, code and offering without crossing status filters', () => {
    const filters: ClassroomDirectoryFilters = { search: 'ROBOTICS 1', status: 'active' };
    expect(filterClassrooms(classrooms, filters).map((item) => item.id)).toEqual(['c1', 'c3']);
    expect(filterClassrooms(classrooms, { search: 'beta', status: 'active' })).toEqual([]);
  });

  it('paginates safely and clamps a page after the result count changes', () => {
    const page = paginateClassrooms(classrooms, 2, 2);
    expect(page.items.map((item) => item.id)).toEqual(['c3']);
    expect(page.page).toBe(2);
    expect(paginateClassrooms(classrooms, 99, 2)).toMatchObject({ page: 2, pageCount: 2 });
    expect(paginateClassrooms([], 99, 2)).toMatchObject({ items: [], page: 1, pageCount: 1 });
  });
});
