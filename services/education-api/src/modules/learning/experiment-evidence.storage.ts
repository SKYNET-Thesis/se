import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { LearningMediaStorage } from "./learning-media.storage";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const KEY = new RegExp(`^learning-media/experiments/${UUID}/${UUID}/${UUID}/${UUID}/${UUID}\\.json$`);

/** Stores bounded server-produced simulation evidence in the existing private Learning Media bucket. */
@Injectable()
export class ExperimentEvidenceStorage {
  constructor(private readonly media: LearningMediaStorage) {}

  newKey(input: { organizationId: string; classroomId: string; experimentId: string; studentId: string }) {
    const key = `learning-media/experiments/${input.organizationId}/${input.classroomId}/${input.experimentId}/${input.studentId}/${input.experimentId}.json`;
    if (!KEY.test(key)) throw new ServiceUnavailableException("Experiment evidence identity is invalid.");
    return key;
  }

  validKey(key: string) { return typeof key === "string" && KEY.test(key); }

  async put(key: string, body: Uint8Array, scope: { experimentId: string; studentId: string; classroomId: string; organizationId: string }) {
    if (!this.validKey(key) || body.byteLength === 0 || body.byteLength > 1_000_000) throw new ServiceUnavailableException("Experiment evidence object is invalid.");
    const digest = createHash("sha256").update(body).digest("hex");
    const { bucket, client } = this.media.s3Context();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: body.byteLength, ContentType: "application/json", Metadata: { "vista-sha256": digest, "vista-experiment-id": scope.experimentId, "vista-student-id": scope.studentId, "vista-classroom-id": scope.classroomId, "vista-organization-id": scope.organizationId } }));
    return { sha256: digest, sizeBytes: body.byteLength };
  }

  async verify(key: string, expected: { sha256: string; sizeBytes: number; experimentId: string; studentId: string; classroomId: string; organizationId: string }) {
    if (!this.validKey(key)) return false;
    const { bucket, client } = this.media.s3Context();
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const meta = head.Metadata ?? {};
      return head.ContentLength === expected.sizeBytes && meta["vista-sha256"] === expected.sha256 && meta["vista-experiment-id"] === expected.experimentId && meta["vista-student-id"] === expected.studentId && meta["vista-classroom-id"] === expected.classroomId && meta["vista-organization-id"] === expected.organizationId;
    } catch (error) {
      const status = error && typeof error === "object" && "$metadata" in error ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
      if (status === 404) return false;
      throw new ServiceUnavailableException("Experiment evidence availability could not be verified.");
    }
  }

  async download(key: string, filename = "experiment-evidence.json") {
    if (!this.validKey(key)) throw new ServiceUnavailableException("Experiment evidence reference is invalid.");
    const { bucket, client } = this.media.s3Context();
    const safeName = filename.replace(/[\r\n"\\]/g, "_").slice(0, 160) || "experiment-evidence.json";
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: "application/json", ResponseContentDisposition: `attachment; filename="${safeName}"` }), { expiresIn: 300 }).catch(() => {
      throw new ServiceUnavailableException("Experiment evidence download signing failed.");
    });
  }
}
