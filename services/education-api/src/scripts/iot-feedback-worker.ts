import { ChangeMessageVisibilityCommand, DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PrismaClient } from "@prisma/client";
import { FeedbackRepository, IotFeedbackRejectedError } from "../modules/learning/iot-feedback.repository";

export interface FeedbackRepositoryPort { process(event: unknown): Promise<"processed" | "duplicate">; }

export class IotFeedbackWorker {
  private stopping = false;
  constructor(private readonly queueUrl: string, private readonly repository: FeedbackRepositoryPort, private readonly sqs = new SQSClient({}), private readonly log: Pick<Console, "info" | "warn"> = console, private readonly concurrency = Number(process.env.VISTA_IOT_FEEDBACK_WORKER_CONCURRENCY ?? "5"), private readonly visibilitySeconds = Number(process.env.VISTA_IOT_FEEDBACK_VISIBILITY_SECONDS ?? "90")) {}
  stop() { this.stopping = true; }
  async once() {
    const received = await this.sqs.send(new ReceiveMessageCommand({ QueueUrl: this.queueUrl, WaitTimeSeconds: 20, VisibilityTimeout: this.visibilitySeconds, MaxNumberOfMessages: Math.min(10, Math.max(1, this.concurrency)) }));
    const messages = received.Messages ?? [];
    for (let index = 0; index < messages.length; index += Math.max(1, this.concurrency)) await Promise.all(messages.slice(index, index + Math.max(1, this.concurrency)).map((message) => this.handle(message)));
  }
  async run() { while (!this.stopping) await this.once(); }
  private async handle(message: { Body?: string; ReceiptHandle?: string }) {
    let timer: NodeJS.Timeout | undefined;
    try {
      let value: unknown;
      try { value = JSON.parse(message.Body ?? ""); } catch { throw new IotFeedbackRejectedError("iot feedback SQS body is not JSON"); }
      if (message.ReceiptHandle) timer = setInterval(() => { void this.sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle, VisibilityTimeout: this.visibilitySeconds })).catch((error) => this.log.warn(JSON.stringify({ event: "iot_feedback_visibility_extension_failed", error: error instanceof Error ? error.message : "unknown" }))); }, Math.max(1_000, Math.floor(this.visibilitySeconds * 500)));
      await this.repository.process(value);
      await this.delete(message.ReceiptHandle);
    } catch (error) {
      if (error instanceof IotFeedbackRejectedError) { this.log.warn(JSON.stringify({ event: "iot_feedback_rejected", error: error.message })); await this.delete(message.ReceiptHandle); }
      else this.log.warn(JSON.stringify({ event: "iot_feedback_retry", error: error instanceof Error ? error.message : "unknown" }));
    } finally { if (timer) clearInterval(timer); }
  }
  private async delete(receiptHandle: string | undefined) { if (receiptHandle) await this.sqs.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle })); }
}

if (require.main === module) {
  if (process.env.VISTA_IOT_FEEDBACK_WORKER_ENABLED === "true") {
    if (!process.env.VISTA_IOT_FEEDBACK_QUEUE_URL) throw new Error("VISTA_IOT_FEEDBACK_QUEUE_URL is required when worker is enabled");
    const prisma = new PrismaClient(); const worker = new IotFeedbackWorker(process.env.VISTA_IOT_FEEDBACK_QUEUE_URL, new FeedbackRepository(prisma));
    const shutdown = async () => { worker.stop(); await prisma.$disconnect(); };
    process.once("SIGTERM", () => { void shutdown(); }); process.once("SIGINT", () => { void shutdown(); });
    void worker.run().finally(() => prisma.$disconnect());
  }
}
