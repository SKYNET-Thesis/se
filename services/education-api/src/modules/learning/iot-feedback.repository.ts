import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { FeedbackEvent, IotFeedbackService, IotLifecycle, LifecycleRecord } from "./iot-feedback.service";

export type FeedbackProcessResult = "processed" | "duplicate";

/** A permanent input/correlation failure. SQS consumers may acknowledge it safely. */
export class IotFeedbackRejectedError extends Error {}
/** A transient correlation failure. SQS must retain it for redelivery or DLQ. */
export class IotFeedbackRetryableError extends Error {}

type LifecycleRow = {
  command_id: string; robot_id: string; experiment_id: string; control_session_id: string;
  session_robot_id: string; experiment_control_session_id: string | null;
  expires_at: Date; state: IotLifecycle; last_sequence: bigint;
};

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: Pick<PrismaService, "$transaction">, private readonly now: () => number = () => Date.now(), private readonly transitions = new IotFeedbackService()) {}

  async process(input: unknown): Promise<FeedbackProcessResult> {
    const event = this.parse(input);
    return this.prisma.$transaction(async (tx) => {
      if (!event.commandId) throw new IotFeedbackRejectedError("iot feedback commandId is required");
      const rows = await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`
        SELECT lifecycle.command_id,lifecycle.robot_id,lifecycle.experiment_id,lifecycle.control_session_id,
          session.robot_id AS session_robot_id,experiment.control_session_id AS experiment_control_session_id,
          lifecycle.expires_at,lifecycle.state,lifecycle.last_sequence
        FROM public.iot_command_lifecycles lifecycle
        JOIN public.control_sessions session ON session.id=lifecycle.control_session_id
        JOIN public.learning_experiments experiment ON experiment.id=lifecycle.experiment_id
        WHERE lifecycle.command_id=${event.commandId} FOR UPDATE`);
      const lifecycle = rows[0];
      if (!lifecycle) throw new IotFeedbackRetryableError("iot feedback command is unknown");
      if (lifecycle.robot_id !== event.robotId) throw new IotFeedbackRejectedError("iot feedback robot mismatch");
      if (lifecycle.robot_id !== lifecycle.session_robot_id || lifecycle.control_session_id !== lifecycle.experiment_control_session_id) throw new IotFeedbackRejectedError("iot feedback lifecycle targets are inconsistent");

      const inserted = await tx.$queryRaw<{ event_id: string }[]>(Prisma.sql`
        INSERT INTO public.iot_inbound_events(event_id,command_id,robot_id,kind,sequence,occurred_at,payload)
        VALUES(${event.eventId},${event.commandId},${event.robotId},${event.kind},${BigInt(event.sequence)},
          to_timestamp(${event.occurredAtMs}::double precision/1000),${JSON.stringify(event)}::jsonb)
        ON CONFLICT (event_id) DO NOTHING RETURNING event_id`);
      if (!inserted[0]) return "duplicate";

      const now = this.now();
      if (event.sequence <= Number(lifecycle.last_sequence)) throw new IotFeedbackRejectedError("iot feedback sequence is stale");
      if (event.occurredAtMs > now + 60_000) throw new IotFeedbackRejectedError("iot feedback occurredAt is too far in the future");

      const current: LifecycleRecord = { commandId: lifecycle.command_id, robotId: lifecycle.robot_id, expiresAtMs: lifecycle.expires_at.getTime(), state: lifecycle.state, sequence: Number(lifecycle.last_sequence) };
      let next: LifecycleRecord;
      try { next = this.transitions.apply(current, event, now); }
      catch (error) { throw new IotFeedbackRejectedError(error instanceof Error ? error.message : "iot feedback rejected"); }

      const mapped = this.mapState(next.state);
      await tx.$executeRaw(Prisma.sql`
        UPDATE public.iot_command_lifecycles
        SET state=${next.state},last_sequence=${BigInt(next.sequence)},
          acknowledged_at=CASE WHEN ${next.state}='acknowledged' THEN COALESCE(acknowledged_at,to_timestamp(${event.occurredAtMs}::double precision/1000)) ELSE acknowledged_at END,
          completed_at=CASE WHEN ${next.state} IN ('completed','failed','timed_out') THEN COALESCE(completed_at,to_timestamp(${event.occurredAtMs}::double precision/1000)) ELSE completed_at END,
          error_code=CASE WHEN ${next.state} IN ('failed','timed_out') THEN ${event.code ?? event.status ?? null} ELSE error_code END,
          updated_at=now()
        WHERE command_id=${lifecycle.command_id}`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE public.learning_experiments SET status=${mapped.experiment},
          output_snapshot=output_snapshot || ${JSON.stringify({ iot: { commandId: event.commandId, state: next.state, lastEventId: event.eventId, lastSequence: next.sequence } })}::jsonb,
          started_at=CASE WHEN ${mapped.experiment}='running' THEN COALESCE(started_at,to_timestamp(${event.occurredAtMs}::double precision/1000)) ELSE started_at END,
          ended_at=CASE WHEN ${mapped.terminal} THEN COALESCE(ended_at,to_timestamp(${event.occurredAtMs}::double precision/1000)) ELSE ended_at END
        WHERE id=${lifecycle.experiment_id}::uuid`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE public.control_sessions SET state=${mapped.session},
          ended_at=CASE WHEN ${mapped.terminal} THEN COALESCE(ended_at,to_timestamp(${event.occurredAtMs}::double precision/1000)) ELSE ended_at END
        WHERE id=${lifecycle.control_session_id}::uuid`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data,occurred_at)
        SELECT ${lifecycle.experiment_id}::uuid,COALESCE(MAX(event_index),-1)+1,${`iot_${event.kind}_${next.state}`},${JSON.stringify(event)}::jsonb,to_timestamp(${event.occurredAtMs}::double precision/1000)
        FROM public.learning_experiment_events WHERE experiment_id=${lifecycle.experiment_id}::uuid
        ON CONFLICT (experiment_id,event_index) DO NOTHING`);
      return "processed";
    });
  }

  private parse(value: unknown): FeedbackEvent {
    const event = value && typeof value === "object" ? value as Record<string, unknown> : null;
    if (!event || typeof event.eventId !== "string" || !event.eventId || (event.kind !== "ack" && event.kind !== "status") || typeof event.robotId !== "string" || !event.robotId || (event.commandId !== undefined && typeof event.commandId !== "string") || !Number.isSafeInteger(event.sequence) || !Number.isSafeInteger(event.occurredAtMs) || (event.status !== undefined && typeof event.status !== "string") || (event.code !== undefined && typeof event.code !== "string")) throw new IotFeedbackRejectedError("iot feedback malformed");
    return event as unknown as FeedbackEvent;
  }

  private mapState(state: IotLifecycle) {
    if (state === "executing") return { experiment: "running", session: "active", terminal: false };
    if (state === "completed") return { experiment: "succeeded", session: "completed", terminal: true };
    if (state === "failed" || state === "timed_out") return { experiment: "failed", session: "fault", terminal: true };
    return { experiment: "pending", session: "created", terminal: false };
  }
}
