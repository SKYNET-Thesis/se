import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LearningMediaService } from './learning-media.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';

const userId = '00000000-0000-4000-8000-000000000001';
const user = { vistaUserId: userId, status: 'active', systemPermissions: ['org.manage'], memberships: [] } as unknown as AuthenticatedUser;
const db = { $queryRaw: jest.fn(), $executeRaw: jest.fn(), $transaction: jest.fn() };
const scope = { isSystemAdministrator: jest.fn(() => true), assertStudentClassroomAccess: jest.fn() };
const storage = { createUpload: jest.fn(), head: jest.fn(), createDownload: jest.fn() };

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
});
