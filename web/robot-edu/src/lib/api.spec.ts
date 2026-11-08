import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogApi, educationAdminApi, progressionApi, studentAuthApi } from './api';

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

  it('does not fall back to the global catalog when the learner has no active enrollment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(progressionApi.coursePaths('token')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

describe('educationAdminApi classroom administration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a scoped PATCH request for safe classroom metadata updates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'class-1', name: 'Updated classroom' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await educationAdminApi.updateClassroom('school-1', 'class-1', 'token', { name: 'Updated classroom', capacity: 30 });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/education-admin/organizations/school-1/classrooms/class-1');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ name: 'Updated classroom', capacity: 30 }) });
  });
});

describe('catalog lesson authoring contract', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('creates a lesson through the system-admin course endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'lesson-1' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await catalogApi.createLesson('course-1', 'token', { title: 'Introduction', content: { summary: 'Start here' } });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/courses/course-1/lessons');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('posts lesson ordering with a valid courseId and guards against missing courseId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ courseId: 'course-1', orderedIds: ['l-1', 'l-2'] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await catalogApi.reorderLessons('course-1', 'token', ['l-1', 'l-2']);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/courses/course-1/lessons/order');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ orderedIds: ['l-1', 'l-2'] }),
    });

    await expect(catalogApi.reorderLessons('', 'token', ['l-1'])).rejects.toThrow('Course ID is required to reorder lessons');
  });
});

describe('curriculum authoring status contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('updates section status via POST /author/sections/:sectionId/status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'sec-1', status: 'published' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { curriculumApi } = await import('./api');
    await curriculumApi.setSectionStatus('sec-1', 'token', 'published');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/author/sections/sec-1/status');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ status: 'published' }),
    });
  });

  it('updates activity status via POST /author/activities/:activityId/status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'act-1', status: 'published' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const { curriculumApi } = await import('./api');
    await curriculumApi.setActivityStatus('act-1', 'token', 'published');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/author/activities/act-1/status');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ status: 'published' }),
    });
  });
});
