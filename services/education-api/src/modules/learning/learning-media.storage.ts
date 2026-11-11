import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type LearningMediaObjectHead = { contentLength: number; contentType?: string; mediaId?: string };

@Injectable()
export class LearningMediaStorage {
  private client?: S3Client;

  constructor(private readonly config: ConfigService) {}

  private settings() {
    const bucket = this.config.get<string>('LEARNING_MEDIA_BUCKET')?.trim();
    const region = this.config.get<string>('AWS_REGION')?.trim() || this.config.get<string>('AWS_DEFAULT_REGION')?.trim();
    if (!bucket || !region) throw new ServiceUnavailableException('Learning Media storage is not configured. Set LEARNING_MEDIA_BUCKET and AWS_REGION on the API server.');
    const endpoint = this.config.get<string>('LEARNING_MEDIA_S3_ENDPOINT')?.trim();
    if (endpoint) {
      let parsed: URL;
      try { parsed = new URL(endpoint); } catch { throw new ServiceUnavailableException('Learning Media S3-compatible endpoint must be a loopback URL.'); }
      if (process.env.NODE_ENV === 'production' || parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsed.hostname)) {
        throw new ServiceUnavailableException('Learning Media S3-compatible endpoint is restricted to local non-production testing.');
      }
      this.client ??= new S3Client({ region, endpoint, forcePathStyle: true });
    } else {
      this.client ??= new S3Client({ region });
    }
    return { bucket, client: this.client };
  }

  async createUpload(key: string, mediaId: string, contentType: string, sizeBytes: number) {
    const { bucket, client } = this.settings();
    try {
      return await createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Expires: 300,
        Fields: { 'Content-Type': contentType, 'x-amz-meta-vista-media-id': mediaId },
        Conditions: [
          ['eq', '$key', key],
          ['eq', '$Content-Type', contentType],
          ['eq', '$x-amz-meta-vista-media-id', mediaId],
          ['content-length-range', sizeBytes, sizeBytes],
        ],
      });
    } catch {
      throw new ServiceUnavailableException('Learning Media upload signing failed. Verify the API AWS role or local AWS profile has s3:PutObject access to the configured media bucket.');
    }
  }

  async head(key: string): Promise<LearningMediaObjectHead | null> {
    const { bucket, client } = this.settings();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (result.ContentLength === undefined) return null;
      return { contentLength: result.ContentLength, contentType: result.ContentType, mediaId: result.Metadata?.['vista-media-id'] };
    } catch (error) {
      if (error && typeof error === 'object' && '$metadata' in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw new ServiceUnavailableException('Learning Media storage could not verify the uploaded object. Verify the API AWS role or local AWS profile has s3:GetObject access to the configured media bucket.');
    }
  }

  async createDownload(key: string, filename: string, contentType: string, disposition: 'inline' | 'attachment' = 'inline') {
    const { bucket, client } = this.settings();
    const safeFilename = filename.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'learning-material';
    try {
      return await getSignedUrl(client, new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: `${disposition}; filename="${safeFilename}"`,
      }), { expiresIn: 900 });
    } catch {
      throw new ServiceUnavailableException('Learning Media download signing failed. Verify the API AWS role or local AWS profile has s3:GetObject access to the configured media bucket.');
    }
  }
}
