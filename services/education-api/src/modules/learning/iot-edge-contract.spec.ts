import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { FeedbackRepository } from "./iot-feedback.repository";
import { FeedbackEvent, IotFeedbackService, LifecycleRecord } from "./iot-feedback.service";

/**
 * Contract between the edge runtime (services/robot-runtime/src/iot.py) and this API. The fixture is generated from the real bridge and its
 * own test fails if the bridge changes, so the two sides cannot drift apart unnoticed.
 */
const fixture = JSON.parse(readFileSync(join(__dirname, "../../../../robot-runtime/tests/fixtures/edge-feedback-events.json"), "utf8")) as {
  robotId: string; commandId: string; commandSequence: number; events: FeedbackEvent[];
};

describe("edge runtime to feedback worker contract", () => {
  const repository = new FeedbackRepository({} as never) as unknown as { parse(value: unknown): FeedbackEvent };

  it("every event the edge publishes passes the worker's input validation", () => {
    expect(fixture.events.map((e) => `${e.kind}:${e.status}`)).toEqual(["ack:accepted", "status:executing", "status:completed"]);
    for (const event of fixture.events) expect(() => repository.parse(event)).not.toThrow();
    expect(new Set(fixture.events.map((e) => e.eventId)).size).toBe(fixture.events.length);       // unique ids make redelivery idempotent
  });

  it("applied in order they walk the command lifecycle queued, acknowledged, executing, completed", () => {
    const service = new IotFeedbackService();
    let record: LifecycleRecord = { commandId: fixture.commandId, robotId: fixture.robotId, expiresAtMs: 1700000010000, state: "queued", sequence: -1 };
    const states: string[] = [];
    for (const event of fixture.events) { record = service.apply(record, event, 1700000006000); states.push(record.state); }
    expect(states).toEqual(["acknowledged", "executing", "completed"]);
  });

  it("a duplicate or out-of-order event never moves a finished command backwards", () => {
    const service = new IotFeedbackService();
    let record: LifecycleRecord = { commandId: fixture.commandId, robotId: fixture.robotId, expiresAtMs: 1700000010000, state: "queued", sequence: -1 };
    for (const event of fixture.events) record = service.apply(record, event, 1700000006000);
    const [ack, executing] = fixture.events;
    expect(service.apply(record, ack, 1700000006000)).toEqual(record);
    expect(service.apply(record, executing, 1700000006000).state).toBe("completed");
  });

  it("an event addressed by the Thing name instead of the robot id is refused", () => {
    const service = new IotFeedbackService();
    const record: LifecycleRecord = { commandId: fixture.commandId, robotId: fixture.robotId, expiresAtMs: 1700000010000, state: "queued", sequence: -1 };
    expect(() => service.apply(record, { ...fixture.events[0], robotId: `vista-demo-${fixture.robotId}` }, 1700000006000)).toThrow(BadRequestException);
  });
});
