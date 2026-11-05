import { afterEach, describe, expect, it, vi } from 'vitest';
import { progressionApi, studentAuthApi } from './api';

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

describe('progressionApi activity progress contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads course progress and sends a bodyless completion request', async () => {
    const list = { courseId: 'course-1', activities: [{ activityId: 'lesson-1-reading-1', status: 'not_started', completedAt: null }] };
    const completed = { activityId: 'lesson-1-reading-1', status: 'completed', completedAt: '2026-11-03T10:00:00Z' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(list), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completed), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await progressionApi.activityProgress('course-1', 'token')).toEqual(list);
    expect(await progressionApi.completeActivity('lesson-1-reading-1', 'token')).toEqual(completed);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/me/courses/course-1/activity-progress');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: undefined });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/me/activities/lesson-1-reading-1/complete');
  });
});

describe('studentAuthApi', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends code-based credentials to the public API without an auth bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await studentAuthApi.login({ schoolCode: 'VST-SCHOOL', studentCode: 'S-1', password: 'student-password' });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/students/login');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    expect(fetchMock.mock.calls[0][1].body).toContain('"schoolCode":"VST-SCHOOL"');
  });
});
