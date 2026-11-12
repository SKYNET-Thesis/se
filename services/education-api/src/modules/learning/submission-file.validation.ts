import { BadRequestException } from '@nestjs/common';
import { matchesDeclaredFormat, SIGNATURE_BYTES } from './learning-media.signature';
import { validateDocxPackage, type RangeReader } from './ooxml-package';

/**
 * Student attachment policy (D03). Approved: PDF, DOCX, PNG, JPEG, WEBP. Deferred on purpose:
 *  - TXT: has no signature and a bounded scan is not a trustworthy type proof;
 *  - ZIP: cannot be told apart from DOCX/PPTX by header and has no safe validation here;
 *  - executables/scripts/archives/Office macro formats: never accepted.
 * Validation (declared type, size, signature, OOXML structure) is NOT malware scanning.
 */
export const MAX_SUBMISSION_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SUBMISSION_FILES_PER_ATTEMPT = 5;
export const SUBMISSION_UPLOAD_GRACE_MS = 10 * 60 * 1000;

export const SUBMISSION_FILE_TYPES = new Map<string, string>([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type SubmissionFileRequest = { filename: string; contentType: string; sizeBytes: number };

/** Validates a client request and returns the server-decided extension and MIME type. */
export function describeSubmissionFile(input: SubmissionFileRequest): { filename: string; extension: string; mime: string } {
  const filename = typeof input.filename === 'string' ? input.filename.trim() : '';
  if (!filename || filename.length > 240 || filename.includes('/') || filename.includes('\\') || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw new BadRequestException('Filename is invalid.');
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_SUBMISSION_FILE_BYTES) {
    throw new BadRequestException(`File size must be between 1 byte and ${MAX_SUBMISSION_FILE_BYTES} bytes.`);
  }
  const dot = filename.lastIndexOf('.');
  const extension = dot < 0 ? '' : filename.slice(dot).toLowerCase();
  const mime = SUBMISSION_FILE_TYPES.get(extension);
  if (!mime || String(input.contentType).toLowerCase() !== mime) {
    throw new BadRequestException('This file type is not accepted. Allowed: PDF, DOCX, PNG, JPEG, WEBP.');
  }
  return { filename, extension, mime };
}

export type ContentVerdict = { ok: true } | { ok: false; reason: string };

/** Verifies the stored object: leading signature for every type, and the OOXML package structure for DOCX. */
export async function verifySubmissionContent(
  mime: string, size: number, readRange: RangeReader,
): Promise<ContentVerdict> {
  const prefix = await readRange(0, Math.min(size, SIGNATURE_BYTES) - 1);
  if (!prefix || !matchesDeclaredFormat(mime, prefix)) return { ok: false, reason: 'The uploaded file content does not match its declared type.' };
  if (mime === DOCX_MIME) {
    const verdict = await validateDocxPackage(size, readRange);
    if (!verdict.ok) return { ok: false, reason: `The uploaded DOCX is not a valid Word package: ${verdict.reason}` };
  }
  return { ok: true };
}
