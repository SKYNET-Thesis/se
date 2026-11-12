import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { assertAttemptOpen, assignmentAcceptsAttachments, loadOwnAttempt } from './attempt-lifecycle';
import { LearningScopeService } from './learning-scope.service';
import { submissionFileKey } from './learning-media.keys';
import { SubmissionFileStorage } from './submission-file.storage';
import {
  describeSubmissionFile, MAX_SUBMISSION_FILES_PER_ATTEMPT, SUBMISSION_UPLOAD_GRACE_MS, verifySubmissionContent,
  type SubmissionFileRequest,
} from './submission-file.validation';

type FileRow = { id: string; attempt_id: string; assignment_id: string; learner_user_id: string; object_key: string; original_filename: string; mime_type: string; size_bytes: number; status: string; created_at: Date };

/** Student attachments of an attempt. Every write needs an active enrollment and an open attempt. */
@Injectable()
export class SubmissionFilesService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly storage: SubmissionFileStorage) {}

  async createUpload(user: AuthenticatedUser, attemptId: string, input: SubmissionFileRequest) {
    const described = describeSubmissionFile(input);
    return this.prisma.$transaction(async (tx) => {
      const attempt = await loadOwnAttempt(tx, user.vistaUserId, attemptId, true);
      await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id, { requireActiveEnrollment: true });
      assertAttemptOpen(attempt);
      if (!assignmentAcceptsAttachments(attempt.assignment_constraints)) throw new ConflictException({ code: 'ATTACHMENTS_NOT_ENABLED', message: 'This assignment does not accept file attachments.' });
      const counted = await tx.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.learning_submission_files
        WHERE attempt_id=${attemptId}::uuid AND (status='ready' OR (status='pending' AND created_at > now() - (${SUBMISSION_UPLOAD_GRACE_MS / 1000}::int * interval '1 second')))`;
      if ((counted[0]?.n ?? 0) >= MAX_SUBMISSION_FILES_PER_ATTEMPT) throw new ConflictException({ code: 'ATTACHMENT_LIMIT', message: `At most ${MAX_SUBMISSION_FILES_PER_ATTEMPT} files can be attached to an attempt.` });
      const id = randomUUID();
      const key = submissionFileKey(attempt.assignment_id, user.vistaUserId, attempt.attempt_id, id, described.extension);
      const upload = await this.storage.createUpload(key, id, described.mime, input.sizeBytes);
      const rows = await tx.$queryRaw<Record<string, unknown>[]>`
        INSERT INTO public.learning_submission_files(id,attempt_id,assignment_id,learner_user_id,object_key,original_filename,mime_type,size_bytes,status)
        VALUES(${id}::uuid,${attempt.attempt_id}::uuid,${attempt.assignment_id}::uuid,${user.vistaUserId}::uuid,${key},${described.filename},${described.mime},${input.sizeBytes},'pending')
        RETURNING id,attempt_id,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at,ready_at`;
      return { file: rows[0], upload };
    });
  }

  async completeUpload(user: AuthenticatedUser, attemptId: string, fileId: string) {
    const attempt = await loadOwnAttempt(this.prisma, user.vistaUserId, attemptId);
    await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id, { requireActiveEnrollment: true });
    assertAttemptOpen(attempt);
    const file = await this.ownFile(user, attemptId, fileId, ['pending']);
    const fail = async (message: string): Promise<never> => {
      await this.prisma.$executeRaw`UPDATE public.learning_submission_files SET status='failed' WHERE id=${fileId}::uuid AND status='pending'`;
      throw new BadRequestException(message);
    };
    const head = await this.storage.head(file.object_key);
    if (!head) {
      if (Date.now() - new Date(file.created_at).getTime() > SUBMISSION_UPLOAD_GRACE_MS) await fail('The upload window expired before the file arrived. Upload the file again.');
      throw new BadRequestException('The uploaded file is not present in storage yet.');
    }
    if (head.contentLength !== Number(file.size_bytes) || head.contentType !== file.mime_type || head.fileId !== file.id) {
      await fail('Uploaded object metadata does not match the authorized file.');
    }
    const verdict = await verifySubmissionContent(file.mime_type, Number(file.size_bytes), (start, end) => this.storage.readRange(file.object_key, start, end));
    if (!verdict.ok) await fail(verdict.reason);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      UPDATE public.learning_submission_files SET status='ready',ready_at=now() WHERE id=${fileId}::uuid AND status='pending'
      RETURNING id,attempt_id,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at,ready_at`;
    if (!rows[0]) throw new ConflictException('Upload is no longer pending.');
    return rows[0];
  }

  async remove(user: AuthenticatedUser, attemptId: string, fileId: string) {
    const attempt = await loadOwnAttempt(this.prisma, user.vistaUserId, attemptId);
    await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id, { requireActiveEnrollment: true });
    assertAttemptOpen(attempt);
    await this.ownFile(user, attemptId, fileId, ['pending', 'ready']);
    await this.prisma.$executeRaw`UPDATE public.learning_submission_files SET status='removed',removed_at=now() WHERE id=${fileId}::uuid AND status IN ('pending','ready')`;
    return { id: fileId, status: 'removed' };
  }

  /** Reading the learner's own history needs membership only, so revocation never hides preserved evidence. */
  async list(user: AuthenticatedUser, attemptId: string) {
    const attempt = await loadOwnAttempt(this.prisma, user.vistaUserId, attemptId);
    await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id,attempt_id,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at,ready_at FROM public.learning_submission_files
      WHERE attempt_id=${attemptId}::uuid AND learner_user_id=${user.vistaUserId}::uuid AND status IN ('ready','pending')
      ORDER BY created_at`;
  }

  async downloadUrl(user: AuthenticatedUser, attemptId: string, fileId: string) {
    const attempt = await loadOwnAttempt(this.prisma, user.vistaUserId, attemptId);
    await this.scope.assertStudentClassroomAccess(user, attempt.classroom_id);
    const file = await this.ownFile(user, attemptId, fileId, ['ready']);
    return this.signed(file);
  }

  async teacherList(user: AuthenticatedUser, attemptId: string) {
    await this.assertTeacherAttempt(user, attemptId);
    return this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id,attempt_id,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at,ready_at FROM public.learning_submission_files WHERE attempt_id=${attemptId}::uuid AND status='ready' ORDER BY created_at`;
  }

  async teacherDownloadUrl(user: AuthenticatedUser, attemptId: string, fileId: string) {
    await this.assertTeacherAttempt(user, attemptId);
    const rows = await this.prisma.$queryRaw<FileRow[]>`
      SELECT id,attempt_id,assignment_id,learner_user_id,object_key,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at
      FROM public.learning_submission_files WHERE id=${fileId}::uuid AND attempt_id=${attemptId}::uuid AND status='ready'`;
    if (!rows[0]) throw new NotFoundException('Attachment was not found.');
    return this.signed(rows[0]);
  }

  private async assertTeacherAttempt(user: AuthenticatedUser, attemptId: string) {
    const rows = await this.prisma.$queryRaw<{ classroom_id: string }[]>`
      SELECT ca.classroom_id FROM public.learning_assignment_attempts a
      JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE a.id=${attemptId}::uuid`;
    if (!rows[0]) throw new NotFoundException('Attempt was not found.');
    await this.scope.assertTeacherClassroomPermission(user, rows[0].classroom_id, ['learning.work.review']);
  }

  private async ownFile(user: AuthenticatedUser, attemptId: string, fileId: string, states: string[]): Promise<FileRow> {
    const rows = await this.prisma.$queryRaw<FileRow[]>`
      SELECT id,attempt_id,assignment_id,learner_user_id,object_key,original_filename,mime_type,size_bytes::int AS size_bytes,status,created_at
      FROM public.learning_submission_files
      WHERE id=${fileId}::uuid AND attempt_id=${attemptId}::uuid AND learner_user_id=${user.vistaUserId}::uuid AND status=ANY(${states}::text[])`;
    if (!rows[0]) throw new NotFoundException('Attachment was not found.');
    return rows[0];
  }

  private async signed(file: FileRow) {
    try {
      return { url: await this.storage.createDownload(file.object_key, file.original_filename, file.mime_type), filename: file.original_filename, mimeType: file.mime_type, expiresIn: 900 };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Submission download is unavailable.');
    }
  }

}
