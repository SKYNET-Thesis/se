import { BadRequestException } from '@nestjs/common';
import { describeSubmissionFile, MAX_SUBMISSION_FILE_BYTES, verifySubmissionContent } from './submission-file.validation';

const PDF = 'application/pdf';
describe('describeSubmissionFile', () => {
  it.each([
    ['a.pdf', PDF, '.pdf'], ['A.PDF', PDF, '.pdf'], ['p.png', 'image/png', '.png'], ['p.JPG', 'image/jpeg', '.jpg'], ['p.jpeg', 'image/jpeg', '.jpeg'],
    ['p.webp', 'image/webp', '.webp'], ['d.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ])('accepts %s', (filename, contentType, extension) => {
    expect(describeSubmissionFile({ filename, contentType, sizeBytes: 1000 })).toMatchObject({ filename, extension, mime: contentType });
  });
  it.each([
    ['run.exe', 'application/x-msdownload'], ['notes.txt', 'text/plain'], ['all.zip', 'application/zip'], ['macro.docm', 'application/vnd.ms-word.document.macroEnabled.12'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], ['x.svg', 'image/svg+xml'], ['x.html', 'text/html'], ['noext', PDF],
    ['a.pdf', 'image/png'], ['a.png', PDF], ['a.pdf.exe', PDF],
  ])('rejects %s (%s)', (filename, contentType) => {
    expect(() => describeSubmissionFile({ filename, contentType, sizeBytes: 1000 })).toThrow(BadRequestException);
  });
  it.each(['a/b.pdf', 'a\\b.pdf', '..\\x.pdf', '', '   ', 'a\u0000.pdf', 'x'.repeat(241) + '.pdf'])('rejects the filename %j', (filename) => {
    expect(() => describeSubmissionFile({ filename, contentType: PDF, sizeBytes: 1000 })).toThrow(BadRequestException);
  });
  it('enforces the 25 MB limit and positive integer sizes', () => {
    expect(describeSubmissionFile({ filename: 'a.pdf', contentType: PDF, sizeBytes: MAX_SUBMISSION_FILE_BYTES }).mime).toBe(PDF);
    for (const sizeBytes of [MAX_SUBMISSION_FILE_BYTES + 1, 0, -1, 1.5, NaN]) {
      expect(() => describeSubmissionFile({ filename: 'a.pdf', contentType: PDF, sizeBytes })).toThrow(BadRequestException);
    }
  });
});

describe('verifySubmissionContent', () => {
  const bytes = (b: number[]) => async (start: number, end: number) => new Uint8Array(b.slice(start, end + 1));
  it('accepts matching signatures and rejects mismatching or unreadable objects', async () => {
    const pdf = [...Buffer.from('%PDF-1.7 ....')];
    expect(await verifySubmissionContent(PDF, pdf.length, bytes(pdf))).toEqual({ ok: true });
    expect((await verifySubmissionContent('image/png', pdf.length, bytes(pdf))).ok).toBe(false);
    expect((await verifySubmissionContent(PDF, 20, async () => null)).ok).toBe(false);
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
    expect((await verifySubmissionContent('image/jpeg', jpeg.length, bytes(jpeg))).ok).toBe(true);
  });
  it('requires a real OOXML package for DOCX, not just a ZIP signature', async () => {
    const fakeZip = [0x50, 0x4b, 0x03, 0x04, ...new Array(60).fill(1)];
    const verdict = await verifySubmissionContent('application/vnd.openxmlformats-officedocument.wordprocessingml.document', fakeZip.length, bytes(fakeZip));
    expect(verdict.ok).toBe(false);
  });
});
