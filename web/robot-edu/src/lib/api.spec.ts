import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiGetOptional, catalogApi, curriculumApi, educationAdminApi, learningMediaApi, progressionApi, quizAuthoringApi, studentAuthApi } from './api';

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

describe('learningMediaApi.upload', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uploads the signed POST form with progress, then marks the stored object ready', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ media: { id: 'media-1' }, upload: { url: 'https://private.example/post', fields: { key: 'courses/course-1/media/media-1/a.pdf', policy: 'signed' } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'media-1', status: 'ready' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    class UploadRequest {
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      status = 204;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open = vi.fn();
      send = vi.fn(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        this.onload?.();
      });
    }
    vi.stubGlobal('XMLHttpRequest', UploadRequest);
    const progress = vi.fn();
    const file = new File(['pdf'], 'a.pdf', { type: 'application/pdf' });

    await expect(learningMediaApi.upload('course-1', 'token', file, progress)).resolves.toMatchObject({ status: 'ready' });

    expect(progress).toHaveBeenCalledWith(50);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/admin/media/media-1/complete');
  });

  it('marks the upload failed when signed storage upload returns an error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ media: { id: 'media-2' }, upload: { url: 'https://private.example/post', fields: {} } }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    class UploadRequest {
      upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
      status = 403;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open = vi.fn();
      send = vi.fn(() => this.onload?.());
    }
    vi.stubGlobal('XMLHttpRequest', UploadRequest);

    await expect(learningMediaApi.upload('course-1', 'token', new File(['pdf'], 'a.pdf', { type: 'application/pdf' }))).rejects.toThrow('Learning Media upload failed (403).');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/admin/media/media-2/fail');
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

describe('course enrollment synchronization contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries enrollment synchronization through the admin course endpoint and returns the summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ classrooms: 2, enrolled: 5 }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(catalogApi.syncCourseEnrollments('course-1', 'token')).resolves.toEqual({ classrooms: 2, enrolled: 5 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/admin/courses/course-1/enrollments/sync');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });
});

describe('apiGetOptional (NestJS sends an empty 200 body for a null result)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null for an empty body instead of failing to parse JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200, headers: { 'Content-Length': '0' } })));
    await expect(apiGetOptional('/x', 'token')).resolves.toBeNull();
  });

  it('parses a present body and still reports HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'a1' }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })));
    await expect(apiGetOptional('/x', 'token')).resolves.toEqual({ id: 'a1' });
    await expect(apiGetOptional('/x', 'token')).rejects.toEqual(expect.objectContaining({ status: 403, message: 'Forbidden' }));
  });

  it('is what quiz authoring uses for a lesson that has no quiz assignment yet', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(quizAuthoringApi.assignment('lesson-1', 'token')).resolves.toBeNull();
    await expect(quizAuthoringApi.preview('lesson-1', 'token')).resolves.toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/author/question-bank/quiz-authoring/lessons/lesson-1/assignment');
  });
});

describe('curriculumApi programming assignment', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads the linked assignment (null before the first save) and saves with PUT to the activity-scoped route', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'as-1', allowedBlocks: ['home'] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(curriculumApi.programmingAssignment('act-1', 'token')).resolves.toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/author\/activities\/act-1\/programming-assignment$/);
    const body = { title: 'T', instructions: 'I', allowedBlocks: ['home'] };
    await expect(curriculumApi.saveProgrammingAssignment('act-1', 'token', body)).resolves.toMatchObject({ id: 'as-1' });
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toMatch(/\/author\/activities\/act-1\/programming-assignment$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(init.headers.Authorization ?? init.headers.authorization).toBe('Bearer token');
  });
});
