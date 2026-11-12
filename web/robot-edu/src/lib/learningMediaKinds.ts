/** Learning Media formats the Course Builder accepts (mirrors the API allowlist). */
export const LEARNING_MEDIA_ACCEPT = [
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png', 'image/jpeg', 'image/webp',
  'audio/mpeg',
  '.mp4', '.webm', '.mov', '.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.webp', '.mp3',
].join(',');
export const LEARNING_MEDIA_FORMATS_LABEL = 'MP4, WebM, MOV, PDF, DOCX, PPTX, PNG, JPG, WebP, MP3';

export type LearningMediaKind = 'video' | 'document' | 'image' | 'audio';

/** Audio is recognised by MIME type when known, otherwise by the file name (activity content only stores ids). */
export function isAudioMedia(filename: string, mimeType?: string): boolean {
  return mimeType ? mimeType.toLowerCase().startsWith('audio/') : /\.mp3$/i.test(filename);
}

export function kindOfMime(mime: string): LearningMediaKind {
  const value = mime.toLowerCase();
  return value.startsWith('video/') ? 'video' : value.startsWith('image/') ? 'image' : value.startsWith('audio/') ? 'audio' : 'document';
}
