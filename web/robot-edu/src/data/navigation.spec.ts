import { describe, expect, it } from 'vitest';
import { navigationByRole } from './navigation';

describe('role-based course navigation', () => {
  it('routes System Admin to the administrative course catalogue', () => {
    const item = navigationByRole.admin.flatMap(section => section.items).find(entry => entry.label === 'Course catalogue');
    expect(item?.to).toBe('/admin/courses');
  });

  it('keeps the student catalogue on the learning route', () => {
    const item = navigationByRole.student.flatMap(section => section.items).find(entry => entry.label === 'Courses');
    expect(item?.to).toBe('/courses');
  });

  it('gives teachers separate Assignment and Quiz entries', () => {
    const items = navigationByRole.teacher.flatMap(section => section.items);
    expect(items.find(entry => entry.label === 'Assignments')?.to).toBe('/teacher/assignments');
    expect(items.find(entry => entry.label === 'Quizzes')?.to).toBe('/teacher/quizzes');
  });
});
