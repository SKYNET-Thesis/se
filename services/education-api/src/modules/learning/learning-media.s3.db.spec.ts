import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { createDb, createStudent, createSystemAdmin, createWorld, describeDb, joinClassroom, schoolAdminUser, type Db } from './db-test-support';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningMediaService } from './learning-media.service';
import { LearningMediaStorage } from './learning-media.storage';
import { LearningScopeService } from './learning-scope.service';
import { ProgressionService } from './progression.service';

/**
 * Learning Media end to end: real PostgreSQL + a loopback S3-compatible service (never AWS). Proves the authoring upload →
 * verify → attach → learner delivery chain, validation, authorization and school isolation against actual stored objects.
 */
const s3Enabled = process.env.RUN_LOCAL_S3_INTEGRATION === '1' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.LEARNING_MEDIA_S3_ENDPOINT ?? '');
const describeBoth = s3Enabled ? describeDb : describe.skip;
const endpoint = process.env.LEARNING_MEDIA_S3_ENDPOINT ?? '';
const bucket = `vista-media-it-${randomUUID().replace(/-/g, '').slice(0, 16)}`;
const credentials = { accessKeyId: process.env.LEARNING_MEDIA_S3_ACCESS_KEY ?? 'vista_media_test', secretAccessKey: process.env.LEARNING_MEDIA_S3_SECRET_KEY ?? 'vista_media_test_only_password' };

const bytesFor: Record<string, Uint8Array> = {
  'application/pdf': new TextEncoder().encode('%PDF-1.4 synthetic'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': Uint8Array.from([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6]),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': Uint8Array.from([0x50, 0x4b, 3, 4, 9, 8, 7, 6, 5, 4]),
  'image/png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
  'video/mp4': Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4]),
};
const cases = [['guide.pdf', 'application/pdf', 'inline'], ['notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'attachment'],
  ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'attachment'], ['diagram.png', 'image/png', 'inline'], ['intro.mp4', 'video/mp4', 'inline']] as const;

describeBoth('Learning Media against real PostgreSQL and a loopback S3-compatible service', () => {
  jest.setTimeout(90_000);
  const db: Db = createDb();
  const client = new S3Client({ region: 'us-east-1', endpoint, forcePathStyle: true, credentials });
  let media: LearningMediaService; let storage: LearningMediaStorage; let enrollments: EnrollmentDeliveryService; let progression: ProgressionService;
  beforeAll(async () => {
    await db.$connect();
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [{ AllowedMethods: ['GET', 'POST', 'PUT', 'HEAD'], AllowedOrigins: ['*'], AllowedHeaders: ['*'] }] } })).catch(() => undefined);
    storage = new LearningMediaStorage({ get: (key: string) => ({ LEARNING_MEDIA_BUCKET: bucket, AWS_REGION: 'us-east-1', LEARNING_MEDIA_S3_ENDPOINT: endpoint }[key]) } as never);
    const scope = new LearningScopeService(db as never);
    enrollments = new EnrollmentDeliveryService(db as never);
    progression = new ProgressionService(db as never, scope);
    media = new LearningMediaService(db as never, scope, storage, progression);
  });
  afterAll(async () => {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket })).catch(() => undefined);
    if (listed?.Contents?.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key! })) } }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    client.destroy(); await db.$disconnect();
  });

  async function upload(admin: never, courseId: string, filename: string, contentType: string, bytes: Uint8Array) {
    const created = await media.createUpload(admin, courseId, { filename, contentType, sizeBytes: bytes.byteLength });
    const form = new FormData();
    Object.entries(created.upload.fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), filename);
    expect([200, 201, 204]).toContain((await fetch(created.upload.url, { method: 'POST', body: form })).status);
    return created.media as { id: string };
  }

  async function fixture() {
    const admin = await createSystemAdmin(db) as never;
    const x = await createWorld(db);
    const section = await db.learning_sections.findFirstOrThrow({ where: { lesson_id: x.lesson.id } });
    const s = await createStudent(db, x); await joinClassroom(db, s, x.room.id); await enrollments.synchronizeClassroom(x.room.id);
    const user = { authUserId: 'a', vistaUserId: s.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [{ id: s.membership.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    return { admin, x, section, user };
  }

  it('uploads, verifies and lists PDF, DOCX, PPTX, PNG and MP4 in the single private bucket; learners get authorized, correctly disposed URLs that serve the exact bytes', async () => {
    const f = await fixture();
    const ids: Record<string, string> = {};
    for (const [filename, mime] of cases) {
      const created = await upload(f.admin, f.x.course.id, filename, mime, bytesFor[mime]);
      const ready = await media.completeUpload(f.admin, created.id) as { status: string; mime_type: string; size_bytes: number };
      expect(ready).toMatchObject({ status: 'ready', mime_type: mime, size_bytes: bytesFor[mime].byteLength });
      ids[filename] = created.id;
    }
    const listed = await media.list(f.admin, f.x.course.id) as Array<{ original_filename: string }>;
    expect(listed.map((m) => m.original_filename).sort()).toEqual(cases.map((c) => c[0]).sort());
    expect((await media.list(f.admin, f.x.course.id, '', 'image')).length).toBe(1);
    // every object lives under the one bucket and the course prefix, split only by category folder
    const keys = ((await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `learning-media/courses/${f.x.course.id}/` }))).Contents ?? []).map((o) => o.Key!);
    expect(keys).toHaveLength(5);
    expect(keys.some((k) => k.includes('/documents/')) && keys.some((k) => k.includes('/images/')) && keys.some((k) => k.includes('/videos/'))).toBe(true);

    const reading = await db.learning_activities.create({ data: { section_id: f.section.id, title: 'Materials', type: 'reading', ordinal: 5, status: 'published', content_ref: { kind: 'lesson_content', key: 'summary' },
      content: { version: 1, blocks: [{ type: 'paragraph', text: 'x' }, { type: 'image', mediaId: ids['diagram.png'], alt: 'd' }], mediaIds: [ids['guide.pdf'], ids['notes.docx'], ids['slides.pptx']] } } });
    const video = await db.learning_activities.create({ data: { section_id: f.section.id, title: 'Video', type: 'video', ordinal: 6, status: 'published', content_ref: { kind: 'lesson_content', key: 'summary' }, content: { version: 1, videoMediaId: ids['intro.mp4'], mediaIds: [] } } });
    for (const [filename, mime, disposition] of cases) {
      const activity = filename.endsWith('.mp4') ? video : reading;
      const url = await media.activityUrl(f.user, activity.id, ids[filename]);
      expect(url).toMatchObject({ filename, mimeType: mime, expiresIn: 900 });
      expect(decodeURIComponent(new URL(url.url).searchParams.get('response-content-disposition') ?? '')).toMatch(new RegExp(`^${disposition}`));
      const response = await fetch(url.url);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytesFor[mime]);
    }
    // a media file that this activity does not reference is not deliverable through it
    await expect(media.activityUrl(f.user, video.id, ids['guide.pdf'])).rejects.toThrow();
  });

  it('refuses invalid uploads before signing and rejects spoofed content, mismatched metadata and absent objects', async () => {
    const f = await fixture();
    const base = { contentType: 'application/pdf', sizeBytes: 10 };
    await expect(media.createUpload(f.admin, f.x.course.id, { ...base, filename: 'run.exe' })).rejects.toThrow(/not supported/);
    await expect(media.createUpload(f.admin, f.x.course.id, { ...base, filename: 'a.pdf', contentType: 'image/png' })).rejects.toThrow(/not supported/);
    await expect(media.createUpload(f.admin, f.x.course.id, { ...base, filename: 'a/b.pdf' })).rejects.toThrow(/Filename/);
    await expect(media.createUpload(f.admin, f.x.course.id, { ...base, filename: 'a.pdf', sizeBytes: 251 * 1024 * 1024 })).rejects.toThrow(/File size/);
    await expect(media.createUpload(f.admin, f.x.course.id, { ...base, filename: 'a.pdf', sizeBytes: 0 })).rejects.toThrow(/File size/);
    // an executable renamed .pdf passes the declaration but fails the content check and is marked failed
    const spoof = await upload(f.admin, f.x.course.id, 'fake.pdf', 'application/pdf', Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]));
    await expect(media.completeUpload(f.admin, spoof.id)).rejects.toThrow(/does not match/);
    expect((await db.learning_media_assets.findUniqueOrThrow({ where: { id: spoof.id } })).status).toBe('failed');
    // declared size differs from the stored object
    const created = await media.createUpload(f.admin, f.x.course.id, { filename: 'late.pdf', contentType: 'application/pdf', sizeBytes: 500 });
    await expect(media.completeUpload(f.admin, created.media.id as string)).rejects.toThrow(/not present/); // nothing uploaded yet → stays pending, retryable
    expect((await db.learning_media_assets.findUniqueOrThrow({ where: { id: created.media.id as string } })).status).toBe('pending');
    // abandoning an upload marks it failed and it never shows up as usable media
    await media.failUpload(f.admin, created.media.id as string);
    expect((await media.list(f.admin, f.x.course.id) as unknown[]).length).toBe(0);
    // a ready asset that is not a ready, same-course file cannot be attached to an activity
    await expect(media.assertActivityMediaReady(f.x.course.id, 'reading', { mediaIds: [created.media.id] })).rejects.toThrow(/ready/);
  });

  it('keeps media private across schools and from unenrolled, locked or unpublished delivery', async () => {
    const f = await fixture();
    const pdf = await upload(f.admin, f.x.course.id, 'guide.pdf', 'application/pdf', bytesFor['application/pdf']);
    await media.completeUpload(f.admin, pdf.id);
    const reading = await db.learning_activities.create({ data: { section_id: f.section.id, title: 'M', type: 'reading', ordinal: 5, status: 'published', content_ref: { kind: 'lesson_content', key: 'summary' }, content: { version: 1, blocks: [], mediaIds: [pdf.id] } } });
    await expect(media.activityUrl(f.user, reading.id, pdf.id)).resolves.toBeDefined();

    // authors of another school (or users without authoring rights) cannot upload to, list, or sign media of this course
    const outsiderAuthor = { ...schoolAdminUser((await createWorld(db)).org.id), memberships: [{ id: 'm', organizationId: (await createWorld(db)).org.id, roleCode: 'school_admin', status: 'active', permissions: ['learning.course.author'] }] } as never;
    await expect(media.createUpload(outsiderAuthor, f.x.course.id, { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 5 })).rejects.toThrow();
    await expect(media.list(outsiderAuthor, f.x.course.id)).rejects.toThrow();
    await expect(media.authorUrl(outsiderAuthor, pdf.id)).rejects.toThrow();
    await expect(media.createUpload(f.user, f.x.course.id, { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 5 })).rejects.toThrow();

    // a learner of another school gets nothing
    const other = await createWorld(db); const os = await createStudent(db, other); await joinClassroom(db, os, other.room.id); await enrollments.synchronizeClassroom(other.room.id);
    const stranger = { authUserId: 'b', vistaUserId: os.user.id, email: 'o@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [{ id: os.membership.id, organizationId: other.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    await expect(media.activityUrl(stranger, reading.id, pdf.id)).rejects.toThrow();

    // unpublished content is not delivered to learners
    await db.learning_activities.update({ where: { id: reading.id }, data: { status: 'draft' } });
    await expect(media.activityUrl(f.user, reading.id, pdf.id)).rejects.toThrow();
    await db.learning_activities.update({ where: { id: reading.id }, data: { status: 'published' } });

    // content of a lesson whose prerequisite is not complete stays locked
    const lesson2 = await db.learning_lessons.create({ data: { course_id: f.x.course.id, title: 'L2', ordinal: 2 } });
    const section2 = await db.learning_sections.create({ data: { lesson_id: lesson2.id, title: 'S2', ordinal: 1, status: 'published' } });
    const locked = await db.learning_activities.create({ data: { section_id: section2.id, title: 'M2', type: 'reading', ordinal: 1, status: 'published', content_ref: { kind: 'lesson_content', key: 'summary' }, content: { version: 1, blocks: [], mediaIds: [pdf.id] } } });
    await db.learning_lesson_prerequisites.create({ data: { lesson_id: lesson2.id, prerequisite_lesson_id: f.x.lesson.id, required: true } });
    await expect(media.activityUrl(f.user, locked.id, pdf.id)).rejects.toThrow();
  });

  it('a stored object that disappears after upload yields a URL that fails with 404 rather than other data', async () => {
    const f = await fixture();
    const pdf = await upload(f.admin, f.x.course.id, 'gone.pdf', 'application/pdf', bytesFor['application/pdf']);
    await media.completeUpload(f.admin, pdf.id);
    const reading = await db.learning_activities.create({ data: { section_id: f.section.id, title: 'M', type: 'reading', ordinal: 5, status: 'published', content_ref: { kind: 'lesson_content', key: 'summary' }, content: { version: 1, blocks: [], mediaIds: [pdf.id] } } });
    const row = await db.learning_media_assets.findUniqueOrThrow({ where: { id: pdf.id } });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: row.object_key }));
    const url = await media.activityUrl(f.user, reading.id, pdf.id);
    expect((await fetch(url.url)).status).toBe(404);
  });
});
