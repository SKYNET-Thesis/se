import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LearningMediaStorage } from "./learning-media.storage";
import { MANIFEST_NAME, MAX_MANIFEST_BYTES, parseKey } from "./robot-recording.contract";

export type RecordingObjectHead = { contentLength: number; sha256?: string };

/** The private Robot Recordings bucket (ROBOT_RECORDINGS_BUCKET). It shares the validated S3 client of Learning Media but never touches the media bucket. */
@Injectable()
export class RobotRecordingStorage {
  constructor(private readonly config: ConfigService, private readonly media: LearningMediaStorage) {}

  enabled(): boolean { return Boolean(this.config.get<string>("ROBOT_RECORDINGS_BUCKET")?.trim()); }

  private context() {
    const bucket = this.config.get<string>("ROBOT_RECORDINGS_BUCKET")?.trim();
    if (!bucket) throw new ServiceUnavailableException("Robot recordings are not configured.");
    return { bucket, client: this.media.s3Context().client };
  }

  private assertKey(key: string) { if (!parseKey(key)) throw new ServiceUnavailableException("Robot recording key is not valid."); }

  /** One short-lived presigned POST that accepts exactly this object: key, size, content type and the declared checksum. */
  async createUpload(key: string, file: { contentType: string; sizeBytes: number; sha256: string }) {
    this.assertKey(key);
    const { bucket, client } = this.context();
    try {
      return await createPresignedPost(client, {
        Bucket: bucket, Key: key, Expires: 900,
        Fields: { "Content-Type": file.contentType, "x-amz-meta-vista-sha256": file.sha256 },
        Conditions: [["eq", "$key", key], ["eq", "$Content-Type", file.contentType], ["eq", "$x-amz-meta-vista-sha256", file.sha256], ["content-length-range", file.sizeBytes, file.sizeBytes]],
      });
    } catch { throw new ServiceUnavailableException("Robot recording upload signing failed."); }
  }

  /** The manifest is the one object whose content is not known in advance, so only its size is bounded. */
  async createManifestUpload(key: string) {
    this.assertKey(key);
    if (!key.endsWith(`/${MANIFEST_NAME}`)) throw new ServiceUnavailableException("Robot recording manifest key is not valid.");
    const { bucket, client } = this.context();
    try {
      return await createPresignedPost(client, { Bucket: bucket, Key: key, Expires: 900, Fields: { "Content-Type": "application/json" },
        Conditions: [["eq", "$key", key], ["eq", "$Content-Type", "application/json"], ["content-length-range", 2, MAX_MANIFEST_BYTES]] });
    } catch { throw new ServiceUnavailableException("Robot recording manifest signing failed."); }
  }

  async head(key: string): Promise<RecordingObjectHead | null> {
    this.assertKey(key);
    const { bucket, client } = this.context();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return result.ContentLength === undefined ? null : { contentLength: result.ContentLength, sha256: result.Metadata?.["vista-sha256"] };
    } catch (error) {
      if (error && typeof error === "object" && "$metadata" in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw new ServiceUnavailableException("Robot recording storage could not verify the object.");
    }
  }

  async readManifest(key: string): Promise<unknown | null> {
    this.assertKey(key);
    const { bucket, client } = this.context();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if ((result.ContentLength ?? 0) > MAX_MANIFEST_BYTES) return { tooLarge: true };
      const text = await result.Body?.transformToString();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error instanceof SyntaxError) return { invalidJson: true };
      if (error && typeof error === "object" && "$metadata" in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw new ServiceUnavailableException("Robot recording manifest could not be read.");
    }
  }

  async download(key: string, filename: string) {
    this.assertKey(key);
    const { bucket, client } = this.context();
    const safe = filename.replace(/[\r\n"\\]/g, "_").slice(0, 160) || "recording";
    try { return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `attachment; filename="${safe}"` }), { expiresIn: 300 }); }
    catch { throw new ServiceUnavailableException("Robot recording download signing failed."); }
  }
}
