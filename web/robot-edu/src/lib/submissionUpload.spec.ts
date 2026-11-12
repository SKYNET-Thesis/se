import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_SUBMISSION_FILE_BYTES, MAX_SUBMISSION_FILES, precheckSubmissionFile, uploadToPresignedPost } from './submissionUpload';

describe('precheckSubmissionFile', () => {
  it.each([['a.pdf', 'application/pdf'], ['p.PNG', 'image/png'], ['p.jpg', 'image/jpeg'], ['p.jpeg', 'image/jpeg'], ['p.webp', 'image/webp'],
    ['d.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']])('accepts %s', (name, contentType) => {
    expect(precheckSubmissionFile({ name, size: 1000 }, 0)).toEqual({ ok: true, contentType });
  });
  it.each(['run.exe', 'notes.txt', 'all.zip', 'macro.docm', 'x.svg', 'noextension', 'a.pdf.exe'])('rejects %s', (name) => {
    expect(precheckSubmissionFile({ name, size: 1000 }, 0).ok).toBe(false);
  });
  it('enforces size and count limits', () => {
    expect(precheckSubmissionFile({ name: 'a.pdf', size: MAX_SUBMISSION_FILE_BYTES }, 0).ok).toBe(true);
    expect(precheckSubmissionFile({ name: 'a.pdf', size: MAX_SUBMISSION_FILE_BYTES + 1 }, 0).ok).toBe(false);
    expect(precheckSubmissionFile({ name: 'a.pdf', size: 0 }, 0).ok).toBe(false);
    expect(precheckSubmissionFile({ name: 'a.pdf', size: 10 }, MAX_SUBMISSION_FILES).ok).toBe(false);
  });
});

describe('uploadToPresignedPost', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('posts every signed field first and the file last, and surfaces a failed upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await uploadToPresignedPost({ url: 'https://bucket.invalid', fields: { key: 'k', 'Content-Type': 'application/pdf' } }, new Blob(['x']));
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect([...body.keys()]).toEqual(['key', 'Content-Type', 'file']);
    fetchMock.mockResolvedValue({ ok: false });
    await expect(uploadToPresignedPost({ url: 'https://bucket.invalid', fields: {} }, new Blob(['x']))).rejects.toThrow(/could not be uploaded/);
  });
});
