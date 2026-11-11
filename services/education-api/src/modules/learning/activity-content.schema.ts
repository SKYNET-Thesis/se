import { BadRequestException } from '@nestjs/common';

export type ReadingBlock =
  | { type: 'heading' | 'paragraph'; text: string }
  | { type: 'bullet_list' | 'numbered_list'; items: string[] }
  | { type: 'link'; text: string; url: string }
  | { type: 'image'; mediaId: string; alt: string };

export type ActivityContent =
  | { version: 1; blocks: ReadingBlock[] }
  | { version: 1; videoMediaId: string; description?: string; durationSeconds?: number }
  | { version: 1; instructions: string; learningOutcome?: string; estimatedMinutes?: number };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value: unknown, label: string, max = 10000): string => {
  if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`${label} must be text with at most ${max} characters.`);
  return value;
};

export function validateActivityContent(type: string, raw: unknown): ActivityContent | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Activity content must be an object.');
  const value = raw as Record<string, unknown>;
  if (value.version !== 1) throw new BadRequestException('Activity content version is invalid.');

  if (type === 'reading') {
    if (Object.keys(value).some((key) => !['version', 'blocks', 'mediaIds'].includes(key)) || !Array.isArray(value.blocks) || value.blocks.length > 100) {
      throw new BadRequestException('Reading content must contain up to 100 structured blocks.');
    }
    if (value.mediaIds !== undefined && (!Array.isArray(value.mediaIds) || value.mediaIds.length > 50 || value.mediaIds.some((id) => typeof id !== 'string' || !uuid.test(id)) || new Set(value.mediaIds).size !== value.mediaIds.length)) {
      throw new BadRequestException('Reading attachments must be unique Learning Media IDs.');
    }
    const mediaIds = new Set((value.mediaIds ?? []) as string[]);
    const blocks = value.blocks.map((block): ReadingBlock => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) throw new BadRequestException('Reading block is invalid.');
      const item = block as Record<string, unknown>;
      if (item.type === 'heading' || item.type === 'paragraph') {
        if (Object.keys(item).some((key) => !['type', 'text'].includes(key))) throw new BadRequestException('Reading block contains unsupported fields.');
        return { type: item.type, text: text(item.text, 'Reading block', 10000) };
      }
      if (item.type === 'bullet_list' || item.type === 'numbered_list') {
        if (Object.keys(item).some((key) => !['type', 'items'].includes(key)) || !Array.isArray(item.items) || item.items.length > 100) throw new BadRequestException('Reading list is invalid.');
        return { type: item.type, items: item.items.map((entry) => text(entry, 'Reading list item', 2000)) };
      }
      if (item.type === 'link') {
        if (Object.keys(item).some((key) => !['type', 'text', 'url'].includes(key))) throw new BadRequestException('Reading link contains unsupported fields.');
        const url = text(item.url, 'Reading link URL', 2048);
        let parsed: URL;
        try { parsed = new URL(url); } catch { throw new BadRequestException('Reading links must use an absolute HTTPS URL.'); }
        if (parsed.protocol !== 'https:') throw new BadRequestException('Reading links must use HTTPS.');
        return { type: 'link', text: text(item.text, 'Reading link text', 1000), url };
      }
      if (item.type === 'image') {
        if (Object.keys(item).some((key) => !['type', 'mediaId', 'alt'].includes(key)) || typeof item.mediaId !== 'string' || !uuid.test(item.mediaId)) throw new BadRequestException('Reading image reference is invalid.');
        if (!mediaIds.has(item.mediaId)) throw new BadRequestException('Inline images must also be listed as reading attachments.');
        return { type: 'image', mediaId: item.mediaId, alt: text(item.alt, 'Image alternative text', 500) };
      }
      throw new BadRequestException('Reading block type is unsupported.');
    });
    return { version: 1, blocks, ...(value.mediaIds === undefined ? {} : { mediaIds: [...value.mediaIds] as string[] }) };
  }

  if (type === 'video') {
    if (Object.keys(value).some((key) => !['version', 'videoMediaId', 'description', 'durationSeconds'].includes(key))) throw new BadRequestException('Video content contains unsupported fields.');
    const videoMediaId = value.videoMediaId === undefined ? '' : value.videoMediaId;
    if (typeof videoMediaId !== 'string' || (videoMediaId !== '' && !uuid.test(videoMediaId))) throw new BadRequestException('Video must reference a Learning Media ID.');
    const description = value.description === undefined ? undefined : text(value.description, 'Video description', 10000);
    const durationSeconds = value.durationSeconds;
    if (durationSeconds !== undefined && (!Number.isInteger(durationSeconds) || (durationSeconds as number) < 1 || (durationSeconds as number) > 86400)) throw new BadRequestException('Video duration must be between 1 and 86400 seconds.');
    return { version: 1, videoMediaId, ...(description !== undefined ? { description } : {}), ...(durationSeconds !== undefined ? { durationSeconds: durationSeconds as number } : {}) };
  }

  if (type === 'physical_lab' || type === 'guided_practice' || type === 'simulation' || type === 'challenge' || type === 'demonstration' || type === 'result' || type === 'reflection') {
    if (Object.keys(value).some((key) => !['version', 'instructions', 'learningOutcome', 'estimatedMinutes'].includes(key))) throw new BadRequestException('Activity content contains unsupported fields.');
    const instructions = text(value.instructions, 'Activity instructions', 20000);
    const learningOutcome = value.learningOutcome === undefined ? undefined : text(value.learningOutcome, 'Learning outcome', 2000);
    const estimatedMinutes = value.estimatedMinutes;
    if (estimatedMinutes !== undefined && (!Number.isInteger(estimatedMinutes) || (estimatedMinutes as number) < 1 || (estimatedMinutes as number) > 600)) throw new BadRequestException('Estimated duration must be between 1 and 600 minutes.');
    return { version: 1, instructions, ...(learningOutcome !== undefined ? { learningOutcome } : {}), ...(estimatedMinutes !== undefined ? { estimatedMinutes: estimatedMinutes as number } : {}) };
  }

  throw new BadRequestException(`Content authoring is not available for activity type '${type}'.`);
}
