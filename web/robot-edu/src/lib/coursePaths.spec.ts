import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, progressionApi } from './api';

/** progressionApi.coursePaths with a stubbed network: a failure is an error, an empty list means "no courses". */
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const path = (id: string) => ({ course: { id, title: id }, lessons: [], progressPercent: 0, currentLessonId: null });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });
const route = (enrollments: () => Promise<Response>, courses: Record<string, () => Promise<Response>> = {}) =>
  fetchMock.mockImplementation((url: string) => {
    const text = String(url);
    if (text.includes('/me/enrollments')) return enrollments();
    const match = /\/me\/courses\/([^/]+)\/path/.exec(text);
    return match && courses[match[1]] ? courses[match[1]]() : json(404, { message: 'Course was not found.' });
  });

describe('progressionApi.coursePaths', () => {
  it('rejects instead of returning an empty list when the enrolments request fails (network, session, server)', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(progressionApi.coursePaths('t')).rejects.toBeInstanceOf(TypeError);
    route(() => json(401, { message: 'Unauthorized' }));
    await expect(progressionApi.coursePaths('t')).rejects.toMatchObject({ status: 401 });
    route(() => json(500, { message: 'boom' }));
    await expect(progressionApi.coursePaths('t')).rejects.toMatchObject({ status: 500 });
  });
  it('returns [] only for a genuinely empty enrolment list', async () => {
    route(() => json(200, []));
    await expect(progressionApi.coursePaths('t')).resolves.toEqual([]);
    route(() => json(200, [{ course_id: 'c1', status: 'completed' }, { course_id: null, status: 'active' }]));
    await expect(progressionApi.coursePaths('t')).resolves.toEqual([]);                          // nothing active: still a real empty list
  });
  it('leaves out a course the API says is gone (404) or not accessible (403), keeps the others, and de-duplicates', async () => {
    route(() => json(200, [{ course_id: 'c1', status: 'active' }, { course_id: 'c2', status: 'active' }, { course_id: 'c3', status: 'active' }, { course_id: 'c1', status: 'active' }]),
      { c1: () => json(200, path('c1')), c2: () => json(404, { message: 'Course was not found.' }), c3: () => json(403, { message: 'no' }) });
    const result = await progressionApi.coursePaths('t');
    expect(result.map((item) => item.course.id)).toEqual(['c1']);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/me/courses/c1/path'))).toHaveLength(1);
  });
  it('surfaces a failure of one course instead of silently hiding it (server error, expired session, network)', async () => {
    const enrolled = () => json(200, [{ course_id: 'c1', status: 'active' }, { course_id: 'c2', status: 'active' }]);
    route(enrolled, { c1: () => json(200, path('c1')), c2: () => json(500, { message: 'boom' }) });
    await expect(progressionApi.coursePaths('t')).rejects.toMatchObject({ status: 500 });
    route(enrolled, { c1: () => json(200, path('c1')), c2: () => json(401, { message: 'x' }) });
    await expect(progressionApi.coursePaths('t')).rejects.toBeInstanceOf(ApiError);
    route(enrolled, { c1: () => json(200, path('c1')), c2: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(progressionApi.coursePaths('t')).rejects.toBeInstanceOf(TypeError);
  });
  it('keeps the successful journey unchanged: all accessible courses, in enrolment order', async () => {
    route(() => json(200, [{ course_id: 'b', status: 'active' }, { course_id: 'a', status: 'active' }]), { a: () => json(200, path('a')), b: () => json(200, path('b')) });
    expect((await progressionApi.coursePaths('t')).map((item) => item.course.id)).toEqual(['b', 'a']);
  });
});
