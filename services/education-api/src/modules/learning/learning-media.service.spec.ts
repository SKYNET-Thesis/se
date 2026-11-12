import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { LearningMediaService } from './learning-media.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';

const userId = '00000000-0000-4000-8000-000000000001';
const user = { vistaUserId: userId, status: 'active', systemPermissions: ['org.manage'], memberships: [] } as unknown as AuthenticatedUser;
const db = { $queryRaw: jest.fn(), $executeRaw: jest.fn(), $transaction: jest.fn() };
const scope = { isSystemAdministrator: jest.fn(() => true), assertStudentClassroomAccess: jest.fn() };
const storage = { createUpload: jest.fn(), head: jest.fn(), readPrefix: jest.fn(), createDownload: jest.fn() };
const MP4_HEAD = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

describe('LearningMediaService', () => {
  let service: LearningMediaService;
  beforeEach(() => {
    jest.clearAllMocks();
    scope.isSystemAdministrator.mockReturnValue(true);
    service = new LearningMediaService(db as never, scope as never, storage as never);
  });

  it('rejects an upload when user cannot author the course', async () => {
    scope.isSystemAdministrator.mockReturnValue(false);
    await expect(service.createUpload(user, '00000000-0000-4000-8000-000000000002', { filename: 'lesson.mp4', contentType: 'video/mp4', sizeBytes: 1024 }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(storage.createUpload).not.toHaveBeenCalled();
  });

  it('rejects unsupported extensions and oversized content before signing', async () => {
    db.$queryRaw.mockResolvedValue([{ id: 'course-1' }]);
    await expect(service.createUpload(user, '00000000-0000-4000-8000-000000000002', { filename: '../payload.exe', contentType: 'application/octet-stream', sizeBytes: 1024 }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createUpload(user, '00000000-0000-4000-8000-000000000002', { filename: 'large.mp4', contentType: 'video/mp4', sizeBytes: 250 * 1024 * 1024 + 1 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(storage.createUpload).not.toHaveBeenCalled();
  });

  it('creates a pending media record with a collision resistant course key', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: 'course-1' }]).mockResolvedValueOnce([{ id: 'media-1', course_id: 'course-1', status: 'pending' }]);
    storage.createUpload.mockResolvedValueOnce({ url: 'https://s3.example/post', fields: { key: 'signed' } });
    const result = await service.createUpload(user, '00000000-0000-4000-8000-000000000002', { filename: 'intro.mp4', contentType: 'video/mp4', sizeBytes: 1024 });
    expect(storage.createUpload).toHaveBeenCalledWith(expect.stringMatching(/^learning-media\/courses\/00000000-0000-4000-8000-000000000002\/videos\/[0-9a-f-]+\.mp4$/), expect.any(String), 'video/mp4', 1024);
    expect(storage.createUpload.mock.calls[0][0]).not.toContain('intro.mp4');
    expect(result.media).toMatchObject({ id: 'media-1', status: 'pending' });
  });

  it('does not mark a forged or incomplete S3 upload ready', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: 'media-1', course_id: 'course-1', object_key: 'learning-media/courses/course-1/videos/media-1.mp4', mime_type: 'video/mp4', size_bytes: 123, status: 'pending' }]);
    db.$queryRaw.mockResolvedValueOnce([{ created_by: userId }]);
    storage.head.mockResolvedValueOnce(null);
    await expect(service.completeUpload(user, 'media-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('marks an upload ready only after size, MIME type, and media identity match S3 metadata', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ id: 'media-1', course_id: 'course-1', object_key: 'learning-media/courses/course-1/videos/media-1.mp4', original_filename: 'clip.mp4', mime_type: 'video/mp4', size_bytes: 123, status: 'pending' }]);
    db.$queryRaw.mockResolvedValueOnce([{ created_by: userId }]);
    db.$queryRaw.mockResolvedValueOnce([{ id: 'media-1', status: 'ready' }]);
    storage.head.mockResolvedValueOnce({ contentLength: 123, contentType: 'video/mp4', mediaId: 'media-1' });
    storage.readPrefix.mockResolvedValueOnce(MP4_HEAD);
    await expect(service.completeUpload(user, 'media-1')).resolves.toMatchObject({ id: 'media-1', status: 'ready' });
  });

  it('requires the requested asset to be referenced by published enrolled content before signing student delivery', async () => {
    scope.isSystemAdministrator.mockReturnValue(false);
    db.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.activityUrl(user, 'activity-1', 'media-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.createDownload).not.toHaveBeenCalled();
  });

  it('does not sign a valid media key when the learner fails classroom scope authorization', async () => {
    scope.isSystemAdministrator.mockReturnValue(false);
    db.$queryRaw.mockResolvedValueOnce([{ id: 'activity-1', type: 'video', course_id: 'course-1', lesson_id: 'lesson-1', classroom_id: 'class-other', media_id: 'media-1', object_key: 'learning-media/courses/course-1/videos/media-1.mp4', original_filename: 'clip.mp4', mime_type: 'video/mp4' }]);
    scope.assertStudentClassroomAccess.mockRejectedValueOnce(new NotFoundException());
    await expect(service.activityUrl(user, 'activity-1', 'media-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.createDownload).not.toHaveBeenCalled();
  });

  it('signs student playback only after finding the media reference in authorized published content', async () => {
    scope.isSystemAdministrator.mockReturnValue(false);
    db.$queryRaw.mockResolvedValueOnce([{ id: 'activity-1', type: 'video', course_id: 'course-1', lesson_id: 'lesson-1', classroom_id: 'class-1', media_id: 'media-1', object_key: 'learning-media/courses/course-1/videos/media-1.mp4', original_filename: 'clip.mp4', mime_type: 'video/mp4' }]);
    storage.createDownload.mockResolvedValueOnce('https://s3.example/signed');
    await expect(service.activityUrl(user, 'activity-1', 'media-1')).resolves.toMatchObject({ url: 'https://s3.example/signed', filename: 'clip.mp4', expiresIn: 900 });
    expect(scope.assertStudentClassroomAccess).toHaveBeenCalledWith(user, 'class-1');
    expect(storage.createDownload).toHaveBeenCalledWith(expect.stringContaining('learning-media/courses/'), 'clip.mp4', 'video/mp4', 'inline');
  });

  it('blocks publishing when an attached asset is not ready in the same course', async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.assertActivityMediaReady('course-1', 'reading', { version: 1, mediaIds: ['11111111-1111-4111-8111-111111111111'], blocks: [] }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  const COURSE = '00000000-0000-4000-8000-000000000002';
  const pendingRow = (over: Record<string, unknown> = {}) => ({ id: 'media-1', course_id: COURSE, object_key: `learning-media/courses/${COURSE}/videos/00000000-0000-4000-8000-0000000000aa.mp4`, original_filename: 'clip.mp4', mime_type: 'video/mp4', size_bytes: 123, status: 'pending', created_at: new Date(), ...over });

  describe('formats and keys', () => {
    it.each([
      ['guide.pdf', 'application/pdf', 'documents'], ['notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'documents'],
      ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'documents'], ['photo.png', 'image/png', 'images'], ['photo.webp', 'image/webp', 'images'],
      ['photo.JPG', 'image/jpeg', 'images'], ['photo.jpeg', 'image/jpeg', 'images'], ['clip.mp4', 'video/mp4', 'videos'], ['clip.webm', 'video/webm', 'videos'],
      ['clip.mov', 'video/quicktime', 'videos'], ['lecture.mp3', 'audio/mpeg', 'audio'],
    ])('accepts %s as %s in the %s prefix', async (filename, contentType, category) => {
      db.$queryRaw.mockReset(); storage.createUpload.mockReset();
      db.$queryRaw.mockResolvedValueOnce([{ id: COURSE }]);
      storage.createUpload.mockResolvedValueOnce({ url: 'https://s3.example/post', fields: {} });
      db.$queryRaw.mockResolvedValueOnce([{ id: 'x', status: 'pending' }]);
      await service.createUpload(user, COURSE, { filename, contentType, sizeBytes: 1024 });
      const key = storage.createUpload.mock.calls[0][0] as string;
      expect(key).toMatch(new RegExp(`^learning-media/courses/${COURSE}/${category}/[0-9a-f-]{36}\\.[a-z0-9]+$`));
      expect(storage.createUpload.mock.calls[0][2]).toBe(contentType);
      expect(key).not.toContain(filename.split('.')[0]);
    });
    it.each([
      ['song.mp3', 'video/mp4'], ['song.mp3', 'audio/wav'], ['song.wav', 'audio/wav'], ['song.ogg', 'audio/ogg'], ['tool.exe', 'application/x-msdownload'], ['page.html', 'text/html'],
      ['vector.svg', 'image/svg+xml'], ['archive.zip', 'application/zip'], ['script.js', 'text/javascript'], ['song.mp3.exe', 'audio/mpeg'], ['noextension', 'audio/mpeg'],
    ])('rejects %s declared as %s before any signing', async (filename, contentType) => {
      storage.createUpload.mockReset(); db.$queryRaw.mockReset(); db.$queryRaw.mockResolvedValueOnce([{ id: COURSE }]);
      await expect(service.createUpload(user, COURSE, { filename, contentType, sizeBytes: 1024 })).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.createUpload).not.toHaveBeenCalled();
    });
    it('rejects path-like and control-character filenames', async () => {
      for (const filename of ['../a.mp3', 'a/b.mp3', 'a\\b.mp3', 'a\u0000.mp3']) {
        db.$queryRaw.mockReset(); db.$queryRaw.mockResolvedValueOnce([{ id: COURSE }]);
        await expect(service.createUpload(user, COURSE, { filename, contentType: 'audio/mpeg', sizeBytes: 10 })).rejects.toBeInstanceOf(BadRequestException);
      }
    });
    it('reports a clear 503 (not a 500) when the database does not list the MIME type yet', async () => {
      db.$queryRaw.mockReset(); storage.createUpload.mockReset();
      db.$queryRaw.mockResolvedValueOnce([{ id: COURSE }]).mockRejectedValueOnce({ code: 'P2010', meta: { code: '23514', message: 'violates check constraint "learning_media_assets_mime_type"' } });
      storage.createUpload.mockResolvedValueOnce({ url: 'https://s3.example/post', fields: {} });
      await expect(service.createUpload(user, COURSE, { filename: 'a.mp3', contentType: 'audio/mpeg', sizeBytes: 10 })).rejects.toBeInstanceOf(ServiceUnavailableException);
      db.$queryRaw.mockResolvedValueOnce([{ id: COURSE }]).mockRejectedValueOnce(new Error('connection lost'));
      storage.createUpload.mockResolvedValueOnce({ url: 'https://s3.example/post', fields: {} });
      await expect(service.createUpload(user, COURSE, { filename: 'a.mp3', contentType: 'audio/mpeg', sizeBytes: 10 })).rejects.toThrow('connection lost');
    });
    it('lists audio separately from documents', async () => {
      db.$queryRaw.mockReset(); db.$queryRaw.mockResolvedValueOnce([{ id: COURSE }]).mockResolvedValueOnce([]);
      await service.list(user, COURSE, '', 'audio');
      await expect(service.list(user, COURSE, '', 'podcast')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('completion content verification', () => {
    const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
    beforeEach(() => { db.$queryRaw.mockReset(); db.$executeRaw.mockReset(); storage.head.mockReset(); storage.readPrefix.mockReset(); });
    it('accepts an MP3 whose bytes start like MP3', async () => {
      const key = `learning-media/courses/${COURSE}/audio/00000000-0000-4000-8000-0000000000bb.mp3`;
      db.$queryRaw.mockResolvedValueOnce([pendingRow({ object_key: key, mime_type: 'audio/mpeg', original_filename: 'a.mp3' })]).mockResolvedValueOnce([{ created_by: userId }]).mockResolvedValueOnce([{ id: 'media-1', status: 'ready' }]);
      storage.head.mockResolvedValueOnce({ contentLength: 123, contentType: 'audio/mpeg', mediaId: 'media-1' }); storage.readPrefix.mockResolvedValueOnce(MP3);
      await expect(service.completeUpload(user, 'media-1')).resolves.toMatchObject({ status: 'ready' });
      expect(storage.readPrefix).toHaveBeenCalledWith(key, 16);
    });
    it('fails an upload whose content does not match the declared type (executable renamed to .mp3)', async () => {
      db.$queryRaw.mockResolvedValueOnce([pendingRow({ mime_type: 'audio/mpeg' })]).mockResolvedValueOnce([{ created_by: userId }]);
      storage.head.mockResolvedValueOnce({ contentLength: 123, contentType: 'audio/mpeg', mediaId: 'media-1' }); storage.readPrefix.mockResolvedValueOnce(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]));
      await expect(service.completeUpload(user, 'media-1')).rejects.toThrow('does not match its declared type');
      expect(db.$executeRaw).toHaveBeenCalledTimes(1); // marked failed, never ready
    });
    it('marks a pending upload failed once its signed window has long expired without an object', async () => {
      db.$queryRaw.mockResolvedValueOnce([pendingRow({ created_at: new Date(Date.now() - 11 * 60 * 1000) })]).mockResolvedValueOnce([{ created_by: userId }]);
      storage.head.mockResolvedValueOnce(null);
      await expect(service.completeUpload(user, 'media-1')).rejects.toThrow('upload window expired');
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    });
    it('keeps a recent pending upload retryable when the object has not arrived yet', async () => {
      db.$queryRaw.mockResolvedValueOnce([pendingRow()]).mockResolvedValueOnce([{ created_by: userId }]);
      storage.head.mockResolvedValueOnce(null);
      await expect(service.completeUpload(user, 'media-1')).rejects.toThrow('not present');
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });
    it('only the uploader may complete or fail an upload', async () => {
      db.$queryRaw.mockResolvedValueOnce([pendingRow()]).mockResolvedValueOnce([{ created_by: '00000000-0000-4000-8000-0000000000ff' }]);
      await expect(service.completeUpload(user, 'media-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.head).not.toHaveBeenCalled();
    });
  });

  it('serves audio inline to an authorized learner', async () => {
    db.$queryRaw.mockReset(); scope.isSystemAdministrator.mockReturnValue(false);
    db.$queryRaw.mockResolvedValueOnce([{ id: 'activity-1', type: 'reading', course_id: COURSE, lesson_id: 'lesson-1', classroom_id: 'class-1', media_id: 'media-1', object_key: `learning-media/courses/${COURSE}/audio/00000000-0000-4000-8000-0000000000bb.mp3`, original_filename: 'a.mp3', mime_type: 'audio/mpeg' }]);
    storage.createDownload.mockResolvedValueOnce('https://s3.example/signed');
    await service.activityUrl(user, 'activity-1', 'media-1');
    expect(storage.createDownload).toHaveBeenLastCalledWith(expect.any(String), 'a.mp3', 'audio/mpeg', 'inline');
  });
});
