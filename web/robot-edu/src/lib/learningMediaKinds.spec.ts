import { describe, expect, it } from 'vitest';
import { isAudioMedia, kindOfMime, LEARNING_MEDIA_ACCEPT } from './learningMediaKinds';

describe('learning media kinds', () => {
  it('classifies every supported MIME type into exactly one library kind', () => {
    expect(kindOfMime('application/pdf')).toBe('document');
    expect(kindOfMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
    expect(kindOfMime('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('document');
    expect(kindOfMime('image/png')).toBe('image');
    expect(kindOfMime('image/jpeg')).toBe('image');
    for (const mime of ['video/mp4', 'video/webm', 'video/quicktime']) expect(kindOfMime(mime)).toBe('video');
    expect(kindOfMime('audio/mpeg')).toBe('audio');
  });
  it('recognises audio by MIME type, or by file name when only the name is known', () => {
    expect(isAudioMedia('lecture.mp3')).toBe(true);
    expect(isAudioMedia('LECTURE.MP3')).toBe(true);
    expect(isAudioMedia('lecture.mp3.pdf')).toBe(false);
    expect(isAudioMedia('x', 'audio/mpeg')).toBe(true);
    expect(isAudioMedia('x.mp3', 'application/pdf')).toBe(false);
    expect(isAudioMedia('clip.mp4')).toBe(false);
  });
  it('offers exactly the formats the API accepts (no executables, no SVG)', () => {
    const accept = LEARNING_MEDIA_ACCEPT.split(',');
    for (const value of ['.mp3', 'audio/mpeg', '.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov']) expect(accept).toContain(value);
    for (const value of ['.exe', '.svg', 'image/svg+xml', 'text/html', '*/*']) expect(accept).not.toContain(value);
  });
});
