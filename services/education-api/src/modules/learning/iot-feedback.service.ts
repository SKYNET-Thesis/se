import { BadRequestException } from "@nestjs/common";

export type IotLifecycle = "pending_publish" | "publishing" | "queued" | "acknowledged" | "executing" | "completed" | "failed" | "timed_out" | "publish_failed" | "reconciliation_required";
export interface FeedbackEvent { eventId: string; kind: "ack" | "status"; robotId: string; commandId?: string; sequence: number; occurredAtMs: number; status?: string; code?: string; }
export interface LifecycleRecord { commandId: string; robotId: string; expiresAtMs: number; state: IotLifecycle; sequence: number; }

/** Pure transition guard; persistence adapter must call it inside one DB transaction. */
export class IotFeedbackService {
  apply(record: LifecycleRecord, event: FeedbackEvent, now = Date.now()): LifecycleRecord {
    if (!event.eventId || !Number.isSafeInteger(event.sequence) || !Number.isSafeInteger(event.occurredAtMs)) throw new BadRequestException("iot feedback malformed");
    if (event.robotId !== record.robotId || (event.commandId && event.commandId !== record.commandId)) throw new BadRequestException("iot feedback identity mismatch");
    if (event.occurredAtMs > now + 60_000 || event.sequence <= record.sequence) return record;
    if (record.state === "queued" && now > record.expiresAtMs) return { ...record, state: "timed_out", sequence: event.sequence };
    const state: IotLifecycle = event.kind === "ack" ? (event.status === "accepted" ? "acknowledged" : "failed") : event.status === "executing" ? "executing" : event.status === "completed" ? "completed" : event.status === "failed" ? "failed" : record.state;
    const order: Record<IotLifecycle, number> = { pending_publish: 0, publishing: 0, queued: 0, acknowledged: 1, executing: 2, completed: 3, failed: 3, timed_out: 3, publish_failed: 3, reconciliation_required: 3 };
    return order[state] < order[record.state] ? record : { ...record, state, sequence: event.sequence };
  }
}
