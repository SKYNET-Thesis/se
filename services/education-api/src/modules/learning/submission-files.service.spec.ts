import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SubmissionFilesService } from './submission-files.service';

const ATTEMPT = '00000000-0000-4000-8000-0000000000c3';
const ASSIGNMENT = '00000000-0000-4000-8000-0000000000a1';
const USER = '00000000-0000-4000-8000-0000000000b2';
const user = { vistaUserId: USER, status: 'active', memberships: [], systemPermissions: [] } as never;
const open = (over: Record<string, unknown> = {}) => ({ attempt_id: ATTEMPT, learner_user_id: USER, attempt_status: 'in_progress', program_id: 'p', classroom_assignment_id: 'ca', classroom_id: 'class-1', assignment_id: ASSIGNMENT, assignment_constraints: { kind: 'symbolic_program', attachments: { enabled: true } }, delivery_status: 'published', available_from: null, close_at: null, ...over });
const pdfBytes = new Uint8Array([...Buffer.from('%PDF-1.7 content')]);

function build(opts: { attempt?: Record<string, unknown>; count?: number; fileRow?: Record<string, unknown> | null; head?: unknown; bytes?: Uint8Array | null; denyEnrollment?: boolean } = {}) {
  const tx = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
  tx.$queryRaw
    .mockResolvedValueOnce([open(opts.attempt)])
    .mockResolvedValueOnce([{ n: opts.count ?? 0 }])
    .mockResolvedValueOnce([{ id: 'file-1', status: 'pending' }]);
  const prisma = { $transaction: jest.fn(async (work: (t: typeof tx) => unknown) => work(tx)), $queryRaw: jest.fn(), $executeRaw: jest.fn().mockResolvedValue(1) };
  const assertStudentClassroomAccess = jest.fn(async (_u: unknown, _c: unknown, o?: { requireActiveEnrollment?: boolean }) => { if (opts.denyEnrollment && o?.requireActiveEnrollment) throw new NotFoundException('Assignment was not found.'); });
  const storage = {
    createUpload: jest.fn().mockResolvedValue({ url: 'https://s3.test', fields: {} }),
    head: jest.fn().mockResolvedValue(opts.head === undefined ? { contentLength: 16, contentType: 'application/pdf', fileId: 'file-1' } : opts.head),
    readRange: jest.fn(async (_k: string, s: number, e: number) => (opts.bytes === null ? null : (opts.bytes ?? pdfBytes).slice(s, e + 1))),
    createDownload: jest.fn().mockResolvedValue('https://signed.test/x'),
  };
  const fileRow = opts.fileRow === undefined ? { id: 'file-1', attempt_id: ATTEMPT, assignment_id: ASSIGNMENT, learner_user_id: USER, object_key: `learning-media/submissions/${ASSIGNMENT}/${USER}/${ATTEMPT}/file-1.pdf`, original_filename: 'a.pdf', mime_type: 'application/pdf', size_bytes: 16, status: 'pending', created_at: new Date() } : opts.fileRow;
  // writes after the transaction (complete/remove/list) use prisma.$queryRaw: attempt, then file row, then update row
  prisma.$queryRaw.mockResolvedValueOnce([open(opts.attempt)]).mockResolvedValueOnce(fileRow ? [fileRow] : []).mockResolvedValue([{ id: 'file-1', status: 'ready' }]);
  const service = new SubmissionFilesService(prisma as never, { assertStudentClassroomAccess, assertTeacherClassroomPermission: jest.fn() } as never, storage as never);
  return { service, tx, prisma, storage, assertStudentClassroomAccess };
}
const request = { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 16 };

describe('SubmissionFilesService.createUpload', () => {
  it('signs a server-built attempt key and records a pending file, with active enrollment enforced', async () => {
    const t = build();
    const result = await t.service.createUpload(user, ATTEMPT, request);
    expect(t.assertStudentClassroomAccess).toHaveBeenCalledWith(user, 'class-1', { requireActiveEnrollment: true });
    const key = t.storage.createUpload.mock.calls[0][0] as string;
    expect(key).toMatch(new RegExp(`^learning-media/submissions/${ASSIGNMENT}/${USER}/${ATTEMPT}/[0-9a-f-]{36}\\.pdf$`));
    expect(t.storage.createUpload.mock.calls[0].slice(2)).toEqual(['application/pdf', 16]);
    expect(result.upload).toEqual({ url: 'https://s3.test', fields: {} });
  });
  it('rejects a revoked enrollment before signing anything', async () => {
    const t = build({ denyEnrollment: true });
    await expect(t.service.createUpload(user, ATTEMPT, request)).rejects.toBeInstanceOf(NotFoundException);
    expect(t.storage.createUpload).not.toHaveBeenCalled();
  });
  it.each([['submitted'], ['evaluated']])('rejects a %s attempt', async (attempt_status) => {
    const t = build({ attempt: { attempt_status } });
    await expect(t.service.createUpload(user, ATTEMPT, request)).rejects.toMatchObject({ response: { code: 'ATTEMPT_NOT_IN_PROGRESS' } });
    expect(t.storage.createUpload).not.toHaveBeenCalled();
  });
  it('rejects a closed delivery', async () => {
    const t = build({ attempt: { close_at: new Date(Date.now() - 1000) } });
    await expect(t.service.createUpload(user, ATTEMPT, request)).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_CLOSED' } });
  });
  it('rejects quizzes, physical labs and assignments that did not enable attachments', async () => {
    for (const constraints of [{ kind: 'knowledge_check', attachments: { enabled: true } }, { kind: 'physical_lab', attachments: { enabled: true } }, { kind: 'symbolic_program' }]) {
      const t = build({ attempt: { assignment_constraints: constraints } });
      await expect(t.service.createUpload(user, ATTEMPT, request)).rejects.toMatchObject({ response: { code: 'ATTACHMENTS_NOT_ENABLED' } });
    }
  });
  it('enforces at most 5 files per attempt', async () => {
    const t = build({ count: 5 });
    await expect(t.service.createUpload(user, ATTEMPT, request)).rejects.toMatchObject({ response: { code: 'ATTACHMENT_LIMIT' } });
    expect(t.storage.createUpload).not.toHaveBeenCalled();
  });
  it.each([
    { filename: 'run.exe', contentType: 'application/x-msdownload', sizeBytes: 5 }, { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 26 * 1024 * 1024 },
    { filename: 'a.zip', contentType: 'application/zip', sizeBytes: 5 }, { filename: '../a.pdf', contentType: 'application/pdf', sizeBytes: 5 },
  ])('rejects the unapproved request %j before touching the database', async (input) => {
    const t = build();
    await expect(t.service.createUpload(user, ATTEMPT, input)).rejects.toBeInstanceOf(BadRequestException);
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('SubmissionFilesService.completeUpload', () => {
  it('marks a verified upload ready', async () => {
    const t = build();
    await expect(t.service.completeUpload(user, ATTEMPT, 'file-1')).resolves.toMatchObject({ status: 'ready' });
    expect(t.assertStudentClassroomAccess).toHaveBeenCalledWith(user, 'class-1', { requireActiveEnrollment: true });
  });
  it.each([
    ['a size mismatch', { head: { contentLength: 99, contentType: 'application/pdf', fileId: 'file-1' } }],
    ['a content-type mismatch', { head: { contentLength: 16, contentType: 'text/html', fileId: 'file-1' } }],
    ['a foreign object (file id metadata mismatch)', { head: { contentLength: 16, contentType: 'application/pdf', fileId: 'other' } }],
    ['content that does not match the declared type', { bytes: new Uint8Array([...Buffer.from('MZ\u0090\u0000 not a pdf at all')]) }],
  ])('fails %s and never marks it ready', async (_name, opts) => {
    const t = build(opts as never);
    await expect(t.service.completeUpload(user, ATTEMPT, 'file-1')).rejects.toBeInstanceOf(BadRequestException);
    const updates = t.prisma.$executeRaw.mock.calls.map((c) => String((c[0] as string[]).join('?')));
    expect(updates.some((sql) => sql.includes("status='failed'"))).toBe(true);
    expect(t.prisma.$queryRaw.mock.calls.every((c) => !String((c[0] as string[]).join('?')).includes("status='ready'"))).toBe(true);
  });
  it('does not let one learner complete another learner\'s file', async () => {
    const t = build({ fileRow: null });
    await expect(t.service.completeUpload(user, ATTEMPT, 'file-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(t.storage.head).not.toHaveBeenCalled();
  });
  it('rejects completion after the attempt was submitted (attachment set is frozen)', async () => {
    const t = build({ attempt: { attempt_status: 'submitted' } });
    await expect(t.service.completeUpload(user, ATTEMPT, 'file-1')).rejects.toMatchObject({ response: { code: 'ATTEMPT_NOT_IN_PROGRESS' } });
  });
});

describe('SubmissionFilesService.remove / downloads', () => {
  it('removes a file only while the attempt is open', async () => {
    const t = build();
    await expect(t.service.remove(user, ATTEMPT, 'file-1')).resolves.toEqual({ id: 'file-1', status: 'removed' });
    const frozen = build({ attempt: { attempt_status: 'submitted' } });
    await expect(frozen.service.remove(user, ATTEMPT, 'file-1')).rejects.toMatchObject({ response: { code: 'ATTEMPT_NOT_IN_PROGRESS' } });
  });
  it('signs a download only for the owner\'s ready file, and works without an active enrollment (history stays readable)', async () => {
    const t = build({ fileRow: { id: 'file-1', attempt_id: ATTEMPT, assignment_id: ASSIGNMENT, learner_user_id: USER, object_key: `learning-media/submissions/${ASSIGNMENT}/${USER}/${ATTEMPT}/file-1.pdf`, original_filename: 'a.pdf', mime_type: 'application/pdf', size_bytes: 16, status: 'ready', created_at: new Date() }, denyEnrollment: true });
    await expect(t.service.downloadUrl(user, ATTEMPT, 'file-1')).resolves.toMatchObject({ url: 'https://signed.test/x', filename: 'a.pdf' });
    for (const call of t.assertStudentClassroomAccess.mock.calls) expect((call[2] as { requireActiveEnrollment?: boolean } | undefined)?.requireActiveEnrollment).toBeFalsy();
  });
  it('hides another learner\'s attempt as not found', async () => {
    const t = build();
    t.prisma.$queryRaw.mockReset().mockResolvedValueOnce([]);
    await expect(t.service.downloadUrl(user, ATTEMPT, 'file-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(t.storage.createDownload).not.toHaveBeenCalled();
  });
});
