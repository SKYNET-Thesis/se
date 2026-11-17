import { describe, expect, it } from 'vitest';
import { formatLabel, formatSize } from './MediaAssetLibraryModal';

describe('media library labels', () => {
  it('shows short format names instead of raw MIME strings', () => {
    expect(formatLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('DOCX');
    expect(formatLabel('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('PPTX');
    expect(formatLabel('video/mp4')).toBe('MP4');
    expect(formatLabel('application/x-unknown')).toBe('X-UNKNOWN');
  });
  it('formats small files in KB rather than 0.00 MB', () => {
    expect(formatSize(926)).toBe('926 B');
    expect(formatSize(18040)).toBe('18 KB');
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
