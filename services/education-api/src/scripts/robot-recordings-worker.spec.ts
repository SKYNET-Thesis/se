import { RecordingRejectedError, RecordingRetryError } from "../modules/learning/robot-recording.service";
import { RobotRecordingsWorker, manifestKeys } from "./robot-recordings-worker";

const ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9", RUN = "11111111-2222-4333-8444-555555555555", EPISODE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const key = `episodes/${ROBOT}/${RUN}/${EPISODE}/manifest.json`;
const body = (k: string) => JSON.stringify({ Records: [{ s3: { object: { key: k } } }] });

describe("manifestKeys", () => {
  it("reads S3 notification bodies, decodes keys, and ignores test events and foreign keys", () => {
    expect(manifestKeys(body(key))).toEqual([key]);
    expect(manifestKeys(body(key.replace(/-/g, "%2D")))).toEqual([key]);
    expect(manifestKeys(JSON.stringify({ Event: "s3:TestEvent" }))).toEqual([]);
    expect(manifestKeys(body("somewhere/else.json"))).toEqual([]);
    expect(() => manifestKeys("not json")).toThrow(RecordingRejectedError);
  });
});

describe("RobotRecordingsWorker.handle", () => {
  const make = (register: () => Promise<"registered" | "duplicate">) => {
    const sent: string[] = [];
    const sqs = { send: async (command: { constructor: { name: string } }) => { sent.push(command.constructor.name); return {}; } };
    const log = { info: jest.fn(), warn: jest.fn() };
    return { worker: new RobotRecordingsWorker("https://sqs.example/q", { register } as never, sqs as never, log, 120), sent, log };
  };
  it("acknowledges a registered or duplicate episode and a notification with nothing to do", async () => {
    for (const result of ["registered", "duplicate"] as const) { const m = make(async () => result); await m.worker.handle({ Body: body(key), ReceiptHandle: "r" }); expect(m.sent).toContain("DeleteMessageCommand"); }
    const empty = make(async () => "registered"); await empty.worker.handle({ Body: JSON.stringify({ Event: "s3:TestEvent" }), ReceiptHandle: "r" }); expect(empty.sent).toContain("DeleteMessageCommand");
  });
  it("acknowledges a permanently invalid episode (so it never loops) and keeps a retryable one for redelivery", async () => {
    const rejected = make(async () => { throw new RecordingRejectedError("mismatch"); }); await rejected.worker.handle({ Body: body(key), ReceiptHandle: "r" });
    expect(rejected.sent).toContain("DeleteMessageCommand");
    const retry = make(async () => { throw new RecordingRetryError("artifact missing"); }); await retry.worker.handle({ Body: body(key), ReceiptHandle: "r" });
    expect(retry.sent).not.toContain("DeleteMessageCommand");
    const unexpected = make(async () => { throw new Error("db down"); }); await unexpected.worker.handle({ Body: body(key), ReceiptHandle: "r" });
    expect(unexpected.sent).not.toContain("DeleteMessageCommand");
  });
});
