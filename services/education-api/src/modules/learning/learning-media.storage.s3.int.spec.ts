import {
  CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command,
  PutBucketCorsCommand, S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { LearningMediaStorage } from './learning-media.storage';

const enabled = process.env.RUN_LOCAL_S3_INTEGRATION === '1';
const endpoint = process.env.LEARNING_MEDIA_S3_ENDPOINT ?? '';
const bucket = `vista-media-test-${randomUUID().replace(/-/g, '').slice(0, 20)}`;
const credentials = {
  accessKeyId: process.env.LEARNING_MEDIA_S3_ACCESS_KEY ?? 'vista_media_test',
  secretAccessKey: process.env.LEARNING_MEDIA_S3_SECRET_KEY ?? 'vista_media_test_only_password',
};
let parsedEndpoint: URL | undefined;
try { parsedEndpoint = endpoint ? new URL(endpoint) : undefined; } catch { /* guarded below */ }
const localEndpoint = Boolean(parsedEndpoint && parsedEndpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsedEndpoint.hostname) && parsedEndpoint.port);
if (enabled && !localEndpoint) throw new Error('S3 integration requires an explicit HTTP loopback endpoint; remote and AWS endpoints are not allowed.');

const describeLocalS3 = enabled && localEndpoint ? describe : describe.skip;

describeLocalS3('Learning Media integration against a loopback S3-compatible service', () => {
  const client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1', endpoint, forcePathStyle: true, credentials });
  const storage = new LearningMediaStorage({ get: (key: string) => ({
    LEARNING_MEDIA_BUCKET: bucket,
    AWS_REGION: process.env.AWS_REGION ?? 'us-east-1',
    LEARNING_MEDIA_S3_ENDPOINT: endpoint,
  }[key]) } as never);

  beforeAll(async () => {
    const healthPath = process.env.LEARNING_MEDIA_S3_HEALTH_PATH ?? '/minio/health/ready';
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(new URL(healthPath, endpoint));
        if (response.ok) { ready = true; break; }
      } catch { /* MinIO is still starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error(`S3-compatible service did not become ready at the configured loopback health endpoint: ${healthPath}`);
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [{
      AllowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      AllowedMethods: ['POST', 'GET', 'HEAD'],
      AllowedHeaders: ['content-type', 'x-amz-*', 'content-md5'],
      ExposeHeaders: ['etag', 'content-length'],
      MaxAgeSeconds: 300,
    }] } }));
  });

  afterAll(async () => {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket })).catch(() => null);
    if (listed?.Contents?.length) await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: listed.Contents.flatMap((item) => item.Key ? [{ Key: item.Key }] : []), Quiet: true },
    }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    client.destroy();
  });

  it('uploads with an exact presigned POST, verifies identity and missing-object handling, downloads privately, and rejects unsigned or cross-key access', async () => {
    const courseId = randomUUID();
    const mediaId = randomUUID();
    const objectKey = `learning-media/courses/${courseId}/documents/${mediaId}.pdf`;
    const bytes = new TextEncoder().encode('synthetic private learning media');
    const signed = await storage.createUpload(objectKey, mediaId, 'application/pdf', bytes.byteLength);
    const form = new FormData();
    Object.entries(signed.fields).forEach(([key, value]) => form.append(key, value));
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'guide.pdf');
    const uploadResponse = await fetch(signed.url, { method: 'POST', body: form });
    expect([200, 201, 204]).toContain(uploadResponse.status);

    await expect(storage.head(objectKey)).resolves.toEqual({ contentLength: bytes.byteLength, contentType: 'application/pdf', mediaId });
    await expect(storage.head(`learning-media/courses/${courseId}/documents/${randomUUID()}.pdf`)).resolves.toBeNull();
    const downloadUrl = await storage.createDownload(objectKey, 'guide.pdf', 'application/pdf');
    const parsedDownload = new URL(downloadUrl);
    expect(parsedDownload.searchParams.get('X-Amz-Expires')).toBe('900');
    const download = await fetch(downloadUrl);
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);

    const unsigned = await fetch(`${endpoint}/${bucket}/${objectKey}`);
    expect(unsigned.status).toBe(403);

    const otherCourseKey = `learning-media/courses/${randomUUID()}/documents/${randomUUID()}.pdf`;
    const tamperedForm = new FormData();
    Object.entries(signed.fields).forEach(([key, value]) => tamperedForm.append(key, key === 'key' ? otherCourseKey : value));
    tamperedForm.append('file', new Blob([bytes], { type: 'application/pdf' }), 'guide.pdf');
    expect([400, 403]).toContain((await fetch(signed.url, { method: 'POST', body: tamperedForm })).status);

    const tamperedDownload = downloadUrl.replace(objectKey, otherCourseKey);
    expect((await fetch(tamperedDownload)).status).toBe(403);
  });
});
