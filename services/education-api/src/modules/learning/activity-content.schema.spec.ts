import { BadRequestException } from '@nestjs/common';
import { validateActivityContent } from './activity-content.schema';

describe('validateActivityContent', () => {
  it('accepts structured reading content without permitting HTML markup', () => {
    expect(validateActivityContent('reading', {
      version: 1,
      blocks: [
        { type: 'heading', text: 'Safe robot setup' },
        { type: 'paragraph', text: 'Clear the workspace before practice.' },
        { type: 'bullet_list', items: ['Check the area', 'Use simulation first'] },
      ],
    })).toEqual({
      version: 1,
      blocks: [
        { type: 'heading', text: 'Safe robot setup' },
        { type: 'paragraph', text: 'Clear the workspace before practice.' },
        { type: 'bullet_list', items: ['Check the area', 'Use simulation first'] },
      ],
    });
  });

  it('rejects arbitrary HTML and unknown content types', () => {
    expect(() => validateActivityContent('reading', { version: 1, html: '<script>alert(1)</script>' })).toThrow(BadRequestException);
    expect(() => validateActivityContent('video', { version: 1, url: 'https://example.com' })).toThrow(BadRequestException);
  });

  it('accepts readings with attachment IDs and inline images, but keeps content declarative', () => {
    const mediaId = '11111111-1111-4111-8111-111111111111';
    expect(validateActivityContent('reading', { version: 1, blocks: [{ type: 'image', mediaId, alt: 'Robot arm' }], mediaIds: [mediaId] }))
      .toEqual({ version: 1, blocks: [{ type: 'image', mediaId, alt: 'Robot arm' }], mediaIds: [mediaId] });
    expect(() => validateActivityContent('reading', { version: 1, blocks: [], mediaIds: ['not-a-uuid'] })).toThrow(BadRequestException);
  });

  it('accepts a video only as a persisted media reference, never a client URL', () => {
    const mediaId = '11111111-1111-4111-8111-111111111111';
    expect(validateActivityContent('video', { version: 1, videoMediaId: mediaId, description: 'Safety demo' }))
      .toEqual({ version: 1, videoMediaId: mediaId, description: 'Safety demo' });
    expect(() => validateActivityContent('video', { version: 1, url: 'https://example.com/video.mp4' })).toThrow(BadRequestException);
  });

  it('accepts static robot lab instructions without executable program payloads', () => {
    expect(validateActivityContent('physical_lab', {
      version: 1,
      instructions: 'Inspect the tabletop before beginning.',
      learningOutcome: 'Identify a safe workspace.',
      estimatedMinutes: 15,
    })).toMatchObject({ instructions: 'Inspect the tabletop before beginning.', estimatedMinutes: 15 });
    expect(() => validateActivityContent('physical_lab', { version: 1, robotProgram: { steps: [] } })).toThrow(BadRequestException);
  });
});
