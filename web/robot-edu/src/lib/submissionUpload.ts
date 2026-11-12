import type { ApiPresignedPost } from './api';

/** Mirrors the server allowlist (the server remains authoritative and re-validates the stored object). */
export const SUBMISSION_FILE_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};
export const SUBMISSION_ACCEPT = Object.keys(SUBMISSION_FILE_TYPES).join(',');
export const MAX_SUBMISSION_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SUBMISSION_FILES = 5;

export type FilePrecheck = { ok: true; contentType: string } | { ok: false; message: string };
export function precheckSubmissionFile(file: { name: string; size: number }, existingCount: number): FilePrecheck {
  if (existingCount >= MAX_SUBMISSION_FILES) return { ok: false, message: `You can attach up to ${MAX_SUBMISSION_FILES} files.` };
  const dot = file.name.lastIndexOf('.');
  const type = dot < 0 ? undefined : SUBMISSION_FILE_TYPES[file.name.slice(dot).toLowerCase()];
  if (!type) return { ok: false, message: 'This file type is not accepted. Allowed: PDF, DOCX, PNG, JPEG, WEBP.' };
  if (file.size < 1) return { ok: false, message: 'This file is empty.' };
  if (file.size > MAX_SUBMISSION_FILE_BYTES) return { ok: false, message: 'Files can be at most 25 MB.' };
  return { ok: true, contentType: type };
}

/** Browser upload straight to the private bucket with the server-signed POST policy (exact size and type are signed). */
export async function uploadToPresignedPost(upload: ApiPresignedPost, file: Blob): Promise<void> {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append('file', file); // the file field must come last
  const response = await fetch(upload.url, { method: 'POST', body: form });
  if (!response.ok) throw new Error('The file could not be uploaded. Please try again.');
}
