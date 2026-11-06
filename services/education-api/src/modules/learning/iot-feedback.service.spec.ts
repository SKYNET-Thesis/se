import { IotFeedbackService } from "./iot-feedback.service";
describe("IotFeedbackService", () => {
  const base = { commandId: "c", robotId: "r", expiresAtMs: 2000, state: "queued" as const, sequence: 0 };
  it("is idempotent for duplicate and out-of-order SQS deliveries", () => {
    const service = new IotFeedbackService();
    const acknowledged = service.apply(base, { eventId: "e1", kind: "ack", robotId: "r", commandId: "c", sequence: 2, occurredAtMs: 1000, status: "accepted" }, 1000);
    expect(acknowledged.state).toBe("acknowledged");
    expect(service.apply(acknowledged, { eventId: "e2", kind: "status", robotId: "r", commandId: "c", sequence: 1, occurredAtMs: 1001, status: "executing" }, 1001)).toEqual(acknowledged);
  });
});
