import { courseIdOfKey, courseMediaKey, isCourseMediaKey, MEDIA_CATEGORIES, SUBMISSIONS_PREFIX } from './learning-media.keys';

const COURSE = '00000000-0000-4000-8000-000000000001';
const MEDIA = '00000000-0000-4000-8000-000000000002';

describe('Learning Media object keys', () => {
  it.each(MEDIA_CATEGORIES)('builds a course-scoped key for the %s prefix', (category) => {
    const key = courseMediaKey(COURSE, category, MEDIA, '.mp3');
    expect(key).toBe(`learning-media/courses/${COURSE}/${category}/${MEDIA}.mp3`);
    expect(isCourseMediaKey(key)).toBe(true);
    expect(courseIdOfKey(key)).toBe(COURSE);
  });
  it('keeps the existing layout valid (existing objects and DB references are not renamed)', () => {
    for (const [category, ext] of [['documents', '.pdf'], ['documents', '.docx'], ['images', '.jpeg'], ['videos', '.webm']] as const) {
      expect(isCourseMediaKey(`learning-media/courses/${COURSE}/${category}/${MEDIA}${ext}`)).toBe(true);
    }
  });
  it('refuses to build a key from client-controlled or malformed parts', () => {
    expect(() => courseMediaKey('../x', 'audio', MEDIA, '.mp3')).toThrow();
    expect(() => courseMediaKey(COURSE, 'audio', 'a/b', '.mp3')).toThrow();
    expect(() => courseMediaKey(COURSE, 'audio', MEDIA, '/../../x')).toThrow();
    expect(() => courseMediaKey(COURSE, 'uploads' as never, MEDIA, '.mp3')).toThrow();
  });
  it.each([
    ['traversal', `learning-media/courses/${COURSE}/../other/${MEDIA}.pdf`], ['another prefix', `uploads/${MEDIA}.pdf`], ['website assets', 'index.html'],
    ['AI models', 'models/m.bin'], ['robot recordings', `recordings/${MEDIA}.mp4`], ['no extension', `learning-media/courses/${COURSE}/audio/${MEDIA}`],
    ['nested', `learning-media/courses/${COURSE}/audio/x/${MEDIA}.mp3`], ['uppercase category', `learning-media/courses/${COURSE}/AUDIO/${MEDIA}.mp3`],
    ['non-uuid course', `learning-media/courses/abc/audio/${MEDIA}.mp3`], ['empty', ''],
  ])('rejects %s', (_name, key) => { expect(isCourseMediaKey(key)).toBe(false); expect(courseIdOfKey(key)).toBeNull(); });
  it('reserves the student-submission prefix: it is never a valid course-media key', () => {
    expect(SUBMISSIONS_PREFIX).toBe('learning-media/submissions/');
    expect(isCourseMediaKey(`${SUBMISSIONS_PREFIX}${MEDIA}/${COURSE}/${MEDIA}/answer.pdf`)).toBe(false);
    expect(isCourseMediaKey(`${SUBMISSIONS_PREFIX}${MEDIA}/${COURSE}/${MEDIA}/${MEDIA}.png`)).toBe(false);
  });
});
