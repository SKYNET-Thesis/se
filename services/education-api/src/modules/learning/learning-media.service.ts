import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { LearningScopeService } from './learning-scope.service';
import { LearningMediaStorage } from './learning-media.storage';
import { MAX_LEARNING_MEDIA_BYTES } from './learning-media.constants';
import { ProgressionService } from './progression.service';

const accepted = new Map<string, { mime: string; category: 'videos' | 'documents' | 'images' }>([
  ['.mp4', { mime: 'video/mp4', category: 'videos' }], ['.webm', { mime: 'video/webm', category: 'videos' }], ['.mov', { mime: 'video/quicktime', category: 'videos' }],
  ['.pdf', { mime: 'application/pdf', category: 'documents' }],
  ['.docx', { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'documents' }],
  ['.pptx', { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'documents' }],
  ['.png', { mime: 'image/png', category: 'images' }], ['.jpg', { mime: 'image/jpeg', category: 'images' }], ['.jpeg', { mime: 'image/jpeg', category: 'images' }], ['.webp', { mime: 'image/webp', category: 'images' }],
]);

export type CreateLearningMediaUpload = { filename: string; contentType: string; sizeBytes: number };

@Injectable()
export class LearningMediaService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly storage: LearningMediaStorage, private readonly progression?: ProgressionService) {}

  private assertAuthor(user: AuthenticatedUser) {
    if (user.status !== 'active' || !this.scope.isSystemAdministrator(user)) throw new NotFoundException('Learning media was not found.');
  }

  private async authorAsset(user: AuthenticatedUser, mediaId: string, states: string[] = ['ready']) {
    this.assertAuthor(user);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; course_id: string; object_key: string; original_filename: string; mime_type: string; size_bytes: number; status: string; created_at: Date }>>`
      SELECT m.id,m.course_id,m.object_key,m.original_filename,m.mime_type,m.size_bytes::int AS size_bytes,m.status,m.created_at
      FROM public.learning_media_assets m JOIN public.learning_courses c ON c.id=m.course_id
      WHERE m.id=${mediaId}::uuid AND c.organization_id IS NULL AND m.status=ANY(${states}::text[])`;
    if (!rows[0]) throw new NotFoundException('Learning media was not found.');
    return rows[0];
  }

  async createUpload(user: AuthenticatedUser, courseId: string, input: CreateLearningMediaUpload) {
    this.assertAuthor(user);
    const courses = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.learning_courses WHERE id=${courseId}::uuid AND organization_id IS NULL AND status<>'archived'`;
    if (!courses[0]) throw new NotFoundException('Course was not found.');
    const filename = input.filename.trim();
    if (!filename || filename.length > 240 || filename.includes('/') || filename.includes('\\') || /[\u0000-\u001f\u007f]/.test(filename)) {
      throw new BadRequestException('Filename is invalid.');
    }
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_LEARNING_MEDIA_BYTES) {
      throw new BadRequestException(`File size must be between 1 byte and ${MAX_LEARNING_MEDIA_BYTES} bytes.`);
    }
    const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const type = accepted.get(extension);
    if (!type || input.contentType.toLowerCase() !== type.mime) throw new BadRequestException('File extension and content type are not supported.');
    const id = randomUUID();
    const objectKey = `learning-media/courses/${courseId}/${type.category}/${id}${extension}`;
    const upload = await this.storage.createUpload(objectKey, id, type.mime, input.sizeBytes);
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      INSERT INTO public.learning_media_assets(id,course_id,object_key,original_filename,mime_type,size_bytes,status,created_by)
      VALUES(${id}::uuid,${courseId}::uuid,${objectKey},${filename},${type.mime},${input.sizeBytes},'pending',${user.vistaUserId}::uuid)
      RETURNING id,course_id,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at`;
    return { media: rows[0], upload };
  }

  async completeUpload(user: AuthenticatedUser, mediaId: string) {
    const asset = await this.authorAsset(user, mediaId, ['pending']);
    const owners = await this.prisma.$queryRaw<Array<{ created_by: string }>>`
      SELECT created_by FROM public.learning_media_assets WHERE id=${mediaId}::uuid`;
    if (owners[0]?.created_by !== user.vistaUserId) throw new NotFoundException('Learning media was not found.');
    const head = await this.storage.head(asset.object_key);
    if (!head) throw new BadRequestException('The uploaded file is not present in Learning Media storage.');
    if (head.contentLength !== asset.size_bytes || head.contentType !== asset.mime_type || head.mediaId !== asset.id) {
      await this.prisma.$executeRaw`UPDATE public.learning_media_assets SET status='failed' WHERE id=${asset.id}::uuid AND status='pending'`;
      throw new BadRequestException('Uploaded object metadata does not match the authorized file.');
    }
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      UPDATE public.learning_media_assets SET status='ready' WHERE id=${asset.id}::uuid AND status='pending'
      RETURNING id,course_id,original_filename,mime_type,size_bytes,status,created_at`;
    if (!rows[0]) throw new ConflictException('Upload is no longer pending.');
    return rows[0];
  }

  async failUpload(user: AuthenticatedUser, mediaId: string) {
    const asset = await this.authorAsset(user, mediaId, ['pending']);
    const rows = await this.prisma.$queryRaw<Array<{ created_by: string }>>`SELECT created_by FROM public.learning_media_assets WHERE id=${asset.id}::uuid`;
    if (rows[0]?.created_by !== user.vistaUserId) throw new NotFoundException('Learning media was not found.');
    await this.prisma.$executeRaw`UPDATE public.learning_media_assets SET status='failed' WHERE id=${asset.id}::uuid AND status='pending'`;
    return { id: asset.id, status: 'failed' };
  }

  async list(user: AuthenticatedUser, courseId: string, search = '', kind = '') {
    this.assertAuthor(user);
    if (search.length > 120) throw new BadRequestException('Search text is too long.');
    if (kind && !['video', 'document', 'image'].includes(kind)) throw new BadRequestException('Media type filter is invalid.');
    const courses = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.learning_courses WHERE id=${courseId}::uuid AND organization_id IS NULL`;
    if (!courses[0]) throw new NotFoundException('Course was not found.');
    const mimePrefix = kind === 'video' ? 'video/%' : kind === 'image' ? 'image/%' : kind === 'document' ? '!video/%' : '';
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id,course_id,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at FROM public.learning_media_assets
      WHERE course_id=${courseId}::uuid AND status='ready'
        AND (${search}='' OR original_filename ILIKE ${`%${search}%`})
        AND (${kind}='' OR (${kind}='document' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'image/%') OR mime_type LIKE ${mimePrefix})
      ORDER BY created_at DESC LIMIT 200`;
  }

  async authorUrl(user: AuthenticatedUser, mediaId: string) {
    const asset = await this.authorAsset(user, mediaId);
    return { url: await this.storage.createDownload(asset.object_key, asset.original_filename, asset.mime_type), filename: asset.original_filename, mimeType: asset.mime_type, expiresIn: 900 };
  }

  async activityUrl(user: AuthenticatedUser, activityId: string, mediaId: string) {
    const isAdmin = this.scope.isSystemAdministrator(user);
    const activities = await this.prisma.$queryRaw<Array<{ id: string; type: string; course_id: string; lesson_id: string; classroom_id: string | null; media_id: string; object_key: string; original_filename: string; mime_type: string }>>`
      SELECT a.id,a.type,l.course_id,l.id AS lesson_id,cl.id AS classroom_id,m.id AS media_id,m.object_key,m.original_filename,m.mime_type
      FROM public.learning_activities a JOIN public.learning_sections s ON s.id=a.section_id
      JOIN public.learning_lessons l ON l.id=s.lesson_id
      JOIN public.learning_media_assets m ON m.id=${mediaId}::uuid AND m.course_id=l.course_id AND m.status='ready'
      LEFT JOIN public.learning_course_offerings o ON o.course_id=l.course_id AND o.status='active'
      LEFT JOIN public.learning_classrooms cl ON cl.offering_id=o.id AND cl.status='active'
      LEFT JOIN public.learning_enrollments e ON e.course_id=l.course_id AND e.offering_id=o.id AND e.classroom_id=cl.id
        AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id AND cm.user_id=${user.vistaUserId}::uuid
        AND cm.classroom_role='student' AND cm.status='active'
      LEFT JOIN public.memberships membership ON membership.id=cm.membership_id AND membership.organization_id=cl.organization_id AND membership.status='active'
      WHERE a.id=${activityId}::uuid
        AND ((a.type='video' AND m.mime_type LIKE 'video/%' AND a.content->>'videoMediaId'=m.id::text)
          OR (a.type='reading' AND m.mime_type NOT LIKE 'video/%' AND (COALESCE(a.content->'mediaIds','[]'::jsonb) ? m.id::text
            OR (jsonb_typeof(a.content->'blocks')='array' AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.content->'blocks') block WHERE block->>'mediaId'=m.id::text)))))
        AND (${isAdmin} OR (a.status='published' AND s.status='published' AND EXISTS(
          SELECT 1 FROM public.learning_courses c WHERE c.id=l.course_id AND c.status='published'
        ) AND e.id IS NOT NULL AND cm.id IS NOT NULL AND membership.id IS NOT NULL))
      LIMIT 1`;
    const activity = activities[0];
    if (!activity) throw new NotFoundException('Learning media was not found.');
    if (!isAdmin && activity.classroom_id) {
      await this.scope.assertStudentClassroomAccess(user, activity.classroom_id);
      await this.progression?.assertPrerequisites(this.prisma, user.vistaUserId, activity.lesson_id);
    }
    const disposition = activity.mime_type === 'application/pdf' || activity.mime_type.startsWith('image/') || activity.mime_type.startsWith('video/') ? 'inline' : 'attachment';
    return { url: await this.storage.createDownload(activity.object_key, activity.original_filename, activity.mime_type, disposition), filename: activity.original_filename, mimeType: activity.mime_type, expiresIn: 900 };
  }

  async assertActivityMediaReady(courseId: string, type: string, content: unknown) {
    const value = content && typeof content === 'object' && !Array.isArray(content) ? content as Record<string, unknown> : {};
    const ids = new Set<string>();
    const videoMediaId = type === 'video' && typeof value.videoMediaId === 'string' ? value.videoMediaId : '';
    if (videoMediaId) ids.add(videoMediaId);
    if (Array.isArray(value.mediaIds)) value.mediaIds.forEach((id) => { if (typeof id === 'string') ids.add(id); });
    if (Array.isArray(value.blocks)) value.blocks.forEach((block) => { if (block && typeof block === 'object' && typeof (block as Record<string, unknown>).mediaId === 'string') ids.add((block as Record<string, string>).mediaId); });
    if (type === 'video' && !videoMediaId) throw new ConflictException('Video activity requires a ready Learning Media video.');
    if ([...ids].some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) throw new ConflictException('Activity contains an invalid Learning Media reference.');
    if (!ids.size) return;
    const imageIds = new Set<string>();
    if (Array.isArray(value.blocks)) value.blocks.forEach((block) => { if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'image' && typeof (block as Record<string, unknown>).mediaId === 'string') imageIds.add((block as Record<string, string>).mediaId); });
    const found = await this.prisma.$queryRaw<Array<{ id: string; mime_type: string }>>`
      SELECT id,mime_type FROM public.learning_media_assets WHERE course_id=${courseId}::uuid AND id=ANY(${[...ids]}::uuid[]) AND status='ready'`;
    if (found.length !== ids.size) throw new ConflictException('Every attached Learning Media file must be ready and belong to this course.');
    if (type === 'video' && !found.some((row) => row.id === videoMediaId && row.mime_type.startsWith('video/'))) throw new ConflictException('Video activity must reference a video file.');
    if (type === 'reading' && found.some((row) => row.mime_type.startsWith('video/'))) throw new ConflictException('Reading activities may attach documents and images, not video files.');
    if (found.some((row) => imageIds.has(row.id) && !row.mime_type.startsWith('image/'))) throw new ConflictException('Inline reading images must reference image files.');
  }
}
