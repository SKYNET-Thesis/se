import { ChangeMessageVisibilityCommand, DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { LearningMediaStorage } from "../modules/learning/learning-media.storage";
import { parseKey } from "../modules/learning/robot-recording.contract";
import { RecordingRejectedError, RecordingRetryError, RobotRecordingService } from "../modules/learning/robot-recording.service";
import { RobotRecordingStorage } from "../modules/learning/robot-recording.storage";

export interface RegisterPort { register(manifestKey: string): Promise<"registered" | "duplicate">; }

/** The manifest keys named in an S3 event notification body (percent-decoded; the S3 test event and anything else yields none). */
export function manifestKeys(body: string): string[] {
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new RecordingRejectedError("queue message is not JSON"); }
  const records = (value as { Records?: Array<{ s3?: { object?: { key?: string } } }> } | null)?.Records;
  if (!Array.isArray(records)) return [];
  return records.map((r) => r.s3?.object?.key).filter((k): k is string => typeof k === "string").map((k) => decodeURIComponent(k.replace(/\+/g, " "))).filter((k) => parseKey(k) !== null);
}

/** Episode event consumer: one SQS message per completed upload (manifest.json). Poison messages are acknowledged, transient ones retried, then dead-lettered by the queue. */
export class RobotRecordingsWorker {
  private stopping = false;
  constructor(private readonly queueUrl: string, private readonly service: RegisterPort, private readonly sqs = new SQSClient({}), private readonly log: Pick<Console, "info" | "warn"> = console, private readonly visibilitySeconds = 120) {}
  stop() { this.stopping = true; }
  async once() {
    const received = await this.sqs.send(new ReceiveMessageCommand({ QueueUrl: this.queueUrl, WaitTimeSeconds: 20, VisibilityTimeout: this.visibilitySeconds, MaxNumberOfMessages: 5 }));
    for (const message of received.Messages ?? []) await this.handle(message);
  }
  async run() { while (!this.stopping) await this.once(); }
  async handle(message: { Body?: string; ReceiptHandle?: string }) {
    let timer: NodeJS.Timeout | undefined;
    try {
      const keys = manifestKeys(message.Body ?? "");
      if (message.ReceiptHandle) timer = setInterval(() => { void this.sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle, VisibilityTimeout: this.visibilitySeconds })).catch(() => undefined); }, Math.max(1000, (this.visibilitySeconds * 1000) / 2));
      for (const key of keys) { const result = await this.service.register(key); this.log.info(JSON.stringify({ event: "robot_recording", result })); }
      await this.delete(message.ReceiptHandle);
    } catch (error) {
      if (error instanceof RecordingRejectedError) { this.log.warn(JSON.stringify({ event: "robot_recording_rejected", error: error.message })); await this.delete(message.ReceiptHandle); }
      else this.log.warn(JSON.stringify({ event: "robot_recording_retry", error: error instanceof RecordingRetryError ? error.message : "unexpected" }));
    } finally { if (timer) clearInterval(timer); }
  }
  private async delete(receiptHandle: string | undefined) { if (receiptHandle) await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle })); }
}

if (require.main === module) {
  if (process.env.VISTA_RECORDINGS_WORKER_ENABLED === "true") {
    if (!process.env.ROBOT_RECORDINGS_EVENTS_QUEUE_URL) throw new Error("ROBOT_RECORDINGS_EVENTS_QUEUE_URL is required when the recordings worker is enabled");
    const prisma = new PrismaClient(); const config = new ConfigService(process.env);
    const service = new RobotRecordingService(prisma as never, new RobotRecordingStorage(config, new LearningMediaStorage(config)));
    const worker = new RobotRecordingsWorker(process.env.ROBOT_RECORDINGS_EVENTS_QUEUE_URL, service);
    const shutdown = async () => { worker.stop(); await prisma.$disconnect(); };
    process.once("SIGTERM", () => { void shutdown(); }); process.once("SIGINT", () => { void shutdown(); });
    void worker.run().finally(() => prisma.$disconnect());
  }
}
