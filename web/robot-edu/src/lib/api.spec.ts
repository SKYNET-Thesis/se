import { afterEach, describe, expect, it, vi } from 'vitest';
import { progressionApi } from './api';

describe('progressionApi.coursePaths', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves current course paths from active enrollments instead of legacy catalog membership', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 'enrollment-1', course_id: 'course-1', classroom_id: 'class-1', status: 'active' },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        course: { id: 'course-1', title: 'Robotics Fundamentals', status: 'published' },
        progressPercent: 0,
        currentLessonId: 'lesson-1',
        lessons: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await progressionApi.coursePaths('token');

    expect(result).toHaveLength(1);
    expect(result[0].course.id).toBe('course-1');
    expect(fetchMock.mock.calls[0][0]).toContain('/me/enrollments');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/courses?page='))).toBe(false);
  });
});
