import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { LearningMediaStorage } from './learning-media.storage';
import { ExperimentEvidenceStorage } from './experiment-evidence.storage';

const enabled = process.env.RUN_LOCAL_S3_INTEGRATION === '1';
const endpoint = process.env.LEARNING_MEDIA_S3_ENDPOINT ?? '';
const bucket = `vista-evidence-test-${randomUUID().replace(/-/g, '').slice(0, 18)}`;
let parsed: URL | undefined;
try { parsed = endpoint ? new URL(endpoint) : undefined; } catch { /* checked below */ }
const loopback = Boolean(parsed && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname) && parsed.port);
if (enabled && !loopback) throw new Error('Experiment evidence S3 test requires a loopback endpoint.');
const suite = enabled && loopback ? describe : describe.skip;

suite('Experiment evidence storage against disposable loopback S3', () => {
  const credentials = { accessKeyId: process.env.LEARNING_MEDIA_S3_ACCESS_KEY ?? '', secretAccessKey: process.env.LEARNING_MEDIA_S3_SECRET_KEY ?? '' };
  const client = new S3Client({ region: 'us-east-1', endpoint, forcePathStyle: true, credentials });
  const media = new LearningMediaStorage({ get: (key: string) => ({ LEARNING_MEDIA_BUCKET: bucket, AWS_REGION: 'us-east-1', LEARNING_MEDIA_S3_ENDPOINT: endpoint }[key]) } as never);
  const storage = new ExperimentEvidenceStorage(media);
  const scope = { organizationId: randomUUID(), classroomId: randomUUID(), experimentId: randomUUID(), studentId: randomUUID() };

  beforeAll(async () => {
    const health = await fetch(new URL(process.env.LEARNING_MEDIA_S3_HEALTH_PATH ?? '/minio/health/ready', endpoint));
    if (!health.ok) throw new Error('Local S3-compatible service is not ready.');
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  });
  afterAll(async () => {
    const objects = await client.send(new ListObjectsV2Command({ Bucket: bucket })).catch(() => null);
    if (objects?.Contents?.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects.Contents.flatMap((item) => item.Key ? [{ Key: item.Key }] : []), Quiet: true } }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    client.destroy();
  });

  it('stores scoped bytes, verifies the real object and tenant metadata, and returns a private download', async () => {
    const key = storage.newKey(scope);
    const body = new TextEncoder().encode(JSON.stringify({ schema: 'vista.experiment.telemetry.v1', experimentId: scope.experimentId, sourceMode: 'SIMULATION' }));
    const digest = await storage.put(key, body, scope);
    await expect(storage.verify(key, { ...scope, ...digest })).resolves.toBe(true);
    await expect(storage.verify(key, { ...scope, organizationId: randomUUID(), ...digest })).resolves.toBe(false);
    const url = await storage.download(key);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
  });
});
