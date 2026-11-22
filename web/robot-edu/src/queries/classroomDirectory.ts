import type { ApiSchoolClassroom } from '../lib/api';

export type ClassroomDirectoryFilters = { search: string; status: 'all' | 'active' | 'archived' };

export function filterClassrooms(classrooms: ApiSchoolClassroom[], filters: ClassroomDirectoryFilters) {
  const term = filters.search.trim().toLocaleLowerCase();
  return classrooms.filter((classroom) => {
    if (filters.status !== 'all' && classroom.status !== filters.status) return false;
    if (!term) return true;
    return [classroom.name, classroom.code, classroom.offering_title ?? '']
      .some((value) => value.toLocaleLowerCase().includes(term));
  });
}

export function paginateClassrooms<T>(items: T[], requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageCount, total: items.length };
}
