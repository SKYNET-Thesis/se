import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isSubmissionKey } from './learning-media.keys';
import { LearningMediaStorage } from './learning-media.storage';

export type SubmissionObjectHead = { contentLength: number; contentType?: string; fileId?: string };

const notFound = (error: unknown) => Boolean(error && typeof error === 'object' && '$metadata' in error
  && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);

/**
 * Student attachments in the SAME private Learning Media bucket, under learning-media/submissions/. It reuses the
 * already validated S3 configuration/client of LearningMediaStorage but only ever touches well-formed submission
 * keys; LearningMediaStorage itself keeps refusing anything outside learning-media/courses/.
 */
@Injectable()
export class SubmissionFileStorage {
  constructor(private readonly media: LearningMediaStorage) {}

  private assertKey(key: string) {
    if (!isSubmissionKey(key)) throw new ServiceUnavailableException('Submission file object key is not valid.');
  }

  async createUpload(key: string, fileId: string, contentType: string, sizeBytes: number) {
    this.assertKey(key);
    const { bucket, client } = this.media.s3Context();
    try {
      return await createPresignedPost(client, {
        Bucket: bucket, Key: key, Expires: 300,
        Fields: { 'Content-Type': contentType, 'x-amz-meta-vista-submission-file-id': fileId },
        Conditions: [
          ['eq', '$key', key],
          ['eq', '$Content-Type', contentType],
          ['eq', '$x-amz-meta-vista-submission-file-id', fileId],
          ['content-length-range', sizeBytes, sizeBytes],
        ],
      });
    } catch {
      throw new ServiceUnavailableException('Submission upload signing failed. Verify the API AWS role has s3:PutObject on learning-media/submissions/.');
    }
  }

  async head(key: string): Promise<SubmissionObjectHead | null> {
    this.assertKey(key);
    const { bucket, client } = this.media.s3Context();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (result.ContentLength === undefined) return null;
      return { contentLength: result.ContentLength, contentType: result.ContentType, fileId: result.Metadata?.['vista-submission-file-id'] };
    } catch (error) {
      if (notFound(error)) return null;
      throw new ServiceUnavailableException('Submission storage could not verify the uploaded object. Verify the API AWS role has s3:GetObject on learning-media/submissions/.');
    }
  }

  /** Ranged read (needs only s3:GetObject): never downloads the whole object. */
  async readRange(key: string, start: number, endInclusive: number): Promise<Uint8Array | null> {
    this.assertKey(key);
    const { bucket, client } = this.media.s3Context();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${endInclusive}` }));
      return result.Body ? await result.Body.transformToByteArray() : null;
    } catch (error) {
      if (notFound(error)) return null;
      throw new ServiceUnavailableException('Submission storage could not read the uploaded object. Verify the API AWS role has s3:GetObject on learning-media/submissions/.');
    }
  }

  /** Always an attachment (never rendered inline from the bucket), whatever the file type. */
  async createDownload(key: string, filename: string, contentType: string) {
    this.assertKey(key);
    const { bucket, client } = this.media.s3Context();
    const safeFilename = filename.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'submission-file';
    try {
      return await getSignedUrl(client, new GetObjectCommand({
        Bucket: bucket, Key: key, ResponseContentType: contentType,
        ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
      }), { expiresIn: 900 });
    } catch {
      throw new ServiceUnavailableException('Submission download signing failed. Verify the API AWS role has s3:GetObject on learning-media/submissions/.');
    }
  }
}
