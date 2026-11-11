import { ServiceUnavailableException } from '@nestjs/common';
import { LearningMediaStorage } from './learning-media.storage';
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  HeadObjectCommand: jest.fn((input) => ({ input })),
  GetObjectCommand: jest.fn((input) => ({ input })),
}));
jest.mock('@aws-sdk/s3-presigned-post', () => ({ createPresignedPost: jest.fn() }));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));

const mockAws = {
  createPresignedPost: jest.mocked(createPresignedPost),
  getSignedUrl: jest.mocked(getSignedUrl),
  S3Client: jest.mocked(S3Client),
  HeadObjectCommand: jest.mocked(HeadObjectCommand),
  GetObjectCommand: jest.mocked(GetObjectCommand),
};

describe('LearningMediaStorage', () => {
  const config = { get: jest.fn((key: string) => ({ LEARNING_MEDIA_BUCKET: 'vista-test-private', AWS_REGION: 'ap-southeast-1' }[key])) };
  let storage: LearningMediaStorage;
  let send: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    send = jest.fn();
    mockAws.S3Client.mockImplementation(() => ({ send }) as never);
    storage = new LearningMediaStorage(config as never);
  });

  it('creates a course-scoped, exact-size presigned POST that binds media identity and MIME type', async () => {
    mockAws.createPresignedPost.mockResolvedValue({ url: 'https://private.example', fields: {} });
    await storage.createUpload('courses/course-1/media/media-1/file.pdf', 'media-1', 'application/pdf', 128);
    expect(mockAws.S3Client).toHaveBeenCalledWith({ region: 'ap-southeast-1' });
    expect(mockAws.createPresignedPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      Bucket: 'vista-test-private',
      Key: 'courses/course-1/media/media-1/file.pdf',
      Expires: 300,
      Fields: { 'Content-Type': 'application/pdf', 'x-amz-meta-vista-media-id': 'media-1' },
      Conditions: expect.arrayContaining([
        ['eq', '$key', 'courses/course-1/media/media-1/file.pdf'],
        ['eq', '$Content-Type', 'application/pdf'],
        ['eq', '$x-amz-meta-vista-media-id', 'media-1'],
        ['content-length-range', 128, 128],
      ]),
    }));
  });

  it('connects to an explicit loopback S3-compatible endpoint using path-style addressing', async () => {
    config.get.mockImplementation((key: string) => ({ LEARNING_MEDIA_BUCKET: 'vista-test-private', AWS_REGION: 'us-east-1', LEARNING_MEDIA_S3_ENDPOINT: 'http://127.0.0.1:59000' }[key]));
    mockAws.createPresignedPost.mockResolvedValue({ url: 'http://127.0.0.1:59000/vista-test-private', fields: {} });
    const localStorage = new LearningMediaStorage(config as never);
    await localStorage.createUpload('learning-media/courses/course-1/documents/a.pdf', 'media-1', 'application/pdf', 12);
    expect(mockAws.S3Client).toHaveBeenCalledWith({ region: 'us-east-1', endpoint: 'http://127.0.0.1:59000', forcePathStyle: true });
  });

  it('verifies object size, content type, and media identity, and treats only 404 as absent', async () => {
    send.mockResolvedValueOnce({ ContentLength: 128, ContentType: 'application/pdf', Metadata: { 'vista-media-id': 'media-1' } });
    await expect(storage.head('courses/course-1/media/media-1/file.pdf')).resolves.toEqual({ contentLength: 128, contentType: 'application/pdf', mediaId: 'media-1' });
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    await expect(storage.head('missing')).resolves.toBeNull();
    send.mockRejectedValueOnce(new Error('access denied'));
    await expect(storage.head('private')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('signs short-lived private downloads with safe inline or attachment disposition', async () => {
    mockAws.getSignedUrl.mockResolvedValue('https://private.example/signed');
    await expect(storage.createDownload('courses/course-1/media/media-1/file.pdf', 'guide".pdf', 'application/pdf')).resolves.toBe('https://private.example/signed');
    expect(mockAws.getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ input: expect.objectContaining({
      Bucket: 'vista-test-private', Key: 'courses/course-1/media/media-1/file.pdf',
      ResponseContentType: 'application/pdf', ResponseContentDisposition: 'inline; filename="guide_.pdf"',
    }) }), { expiresIn: 900 });
  });
});
