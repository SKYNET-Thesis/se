import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningService } from "./learning.service";
import { PrismaService } from "../../common/database/prisma.service";

type State = "READY" | "RECORDING" | "FINALIZING" | "COMPLETED" | "FAILED";
type Session = {
  id: string;
  attemptId: string;
  userId: string;
  state: State;
  mode: "offline_fake_follower";
  error: string | null;
  artifact: Record<string, unknown> | null;
  reflection: string | null;
};
type Context = {
  organization_id: string;
  classroom_id: string;
  submission_id: string;
  challenge_id: string | null;
  program_version_id: string | null;
};

@Injectable()
export class DemonstrationLessonService {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly config: ConfigService,
    private readonly learning: LearningService,
    private readonly prisma: PrismaService,
  ) {}

  async session(user: AuthenticatedUser, attemptId: string) {
    await this.own(user, attemptId);
    const live = [...this.sessions.values()].find(
      (candidate) => candidate.userId === user.vistaUserId && candidate.attemptId === attemptId,
    );
    if (live) return live;
    const rows = await this.prisma.$queryRaw<{
      id: string;
      frame_count: number | null;
      metrics: unknown;
      experiment_id: string;
      reflection: string | null;
    }[]>`
      SELECT d.id,d.frame_count,d.metrics,e.id AS experiment_id,
        (SELECT r.response_text FROM public.learning_reflections r
          WHERE r.experiment_id=e.id AND r.learner_user_id=${user.vistaUserId}::uuid
          ORDER BY r.created_at DESC LIMIT 1) AS reflection
      FROM public.demonstration_episodes d
      JOIN public.learning_experiments e ON e.demonstration_episode_id=d.id
      WHERE d.recorded_by=${user.vistaUserId}::uuid
        AND d.provenance->>'attemptId'=${attemptId}
      ORDER BY d.created_at DESC LIMIT 1`;
    const saved = rows[0];
    if (!saved) return { state: "READY", mode: "offline_fake_follower", error: null };
    const metrics = saved.metrics as Record<string, unknown>;
    const recovered: Session = {
      id: randomUUID(), attemptId, userId: user.vistaUserId, state: "COMPLETED",
      mode: "offline_fake_follower", error: null, reflection: saved.reflection,
      artifact: { demonstrationId: saved.id, experimentId: saved.experiment_id,
        frameCount: saved.frame_count, durationS: metrics?.durationS ?? null },
    };
    this.sessions.set(recovered.id, recovered);
    return recovered;
  }

  async create(user: AuthenticatedUser, attemptId: string) {
    await this.own(user, attemptId);
    let session = [...this.sessions.values()].find(
      (candidate) => candidate.userId === user.vistaUserId && candidate.attemptId === attemptId,
    );
    if (!session) {
      session = { id: randomUUID(), attemptId, userId: user.vistaUserId, state: "READY",
        mode: "offline_fake_follower", error: null, artifact: null, reflection: null };
      this.sessions.set(session.id, session);
    }
    return session;
  }

  async start(user: AuthenticatedUser, id: string) {
    const session = await this.owned(user, id);
    if (session.state === "RECORDING") return session;
    try {
      await this.runtime("/api/tasks/vr-lekiwi/recording/start", "POST", {
        metadata: { attemptId: session.attemptId, mode: session.mode, source: "vista_c3_01" },
      });
      session.state = "RECORDING";
      session.error = null;
    } catch (error) {
      session.state = "FAILED";
      session.error = error instanceof Error ? error.message : "Could not start recording.";
    }
    return session;
  }

  async stop(user: AuthenticatedUser, id: string) {
    const session = await this.owned(user, id);
    if (session.state !== "RECORDING") throw new BadRequestException("Recording is not active.");
    session.state = "FINALIZING";
    try {
      const result = await this.runtime("/api/tasks/vr-lekiwi/recording/stop", "POST", {});
      if (result.state !== "COMPLETED" || !result.artifact) {
        throw new Error(typeof result.error === "string" ? result.error : "Recording could not finalize.");
      }
      const artifact = result.artifact as Record<string, unknown>;
      const storageUri = typeof artifact.storageUri === "string" ? artifact.storageUri : "";
      if (!storageUri) throw new Error("Recording artifact identity is missing.");
      const benchmark = await this.prisma.benchmark_tasks.findUnique({
        where: { code: "C3_DEMONSTRATION" }, select: { id: true },
      });
      if (!benchmark) throw new Error("C3 benchmark task is missing; run the demo seed.");
      const context = await this.context(user, session.attemptId);
      const existing = await this.prisma.demonstration_episodes.findFirst({
        where: { storage_uri: storageUri },
        select: { id: true, recorded_by: true, organization_id: true, provenance: true },
      });
      const provenance = existing?.provenance as Record<string, unknown> | undefined;
      if (existing && (existing.recorded_by !== user.vistaUserId ||
        existing.organization_id !== context.organization_id ||
        provenance?.attemptId !== session.attemptId ||
        provenance?.submissionId !== context.submission_id)) {
        throw new Error("Recording artifact identity conflicts with existing evidence.");
      }
      const demonstration = existing ?? await this.prisma.demonstration_episodes.create({
        data: {
          organization_id: context.organization_id,
          recorded_by: user.vistaUserId,
          benchmark_task_id: benchmark.id,
          source: "vista_c3_01_offline_fake",
          instruction: "Record one observation/action demonstration episode.",
          outcome: artifact.interrupted ? "interrupted" : "completed",
          started_at: new Date(String(artifact.startedAt)),
          ended_at: new Date(String(artifact.endedAt)),
          frame_count: Number(artifact.frameCount),
          storage_uri: storageUri,
          checksum: String(artifact.checksum),
          provenance: { attemptId: session.attemptId, submissionId: context.submission_id,
            classroomId: context.classroom_id, runtimeMode: session.mode,
            schemaVersion: "vista_demonstration_episode_v1" },
          metrics: { durationS: Number(artifact.durationS) },
        },
      });
      const experiments = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM public.learning_experiments
        WHERE demonstration_episode_id=${demonstration.id}::uuid
          AND learner_user_id=${user.vistaUserId}::uuid
          AND submission_id=${context.submission_id}::uuid LIMIT 1`;
      let experimentId = experiments[0]?.id;
      if (!experimentId) {
        const created = await this.prisma.$queryRaw<{ id: string }[]>`
          INSERT INTO public.learning_experiments(
            challenge_id,submission_id,learner_user_id,method,execution_mode,status,
            demonstration_episode_id,input_snapshot,output_snapshot,metrics,started_at,ended_at)
          VALUES(${context.challenge_id}::uuid,${context.submission_id}::uuid,${user.vistaUserId}::uuid,
            'demonstration','demonstration','succeeded',${demonstration.id}::uuid,
            ${JSON.stringify({ attemptId: session.attemptId, programVersionId: context.program_version_id })}::jsonb,
            ${JSON.stringify({ outcome: artifact.interrupted ? "interrupted" : "completed" })}::jsonb,
            ${JSON.stringify({ durationS: Number(artifact.durationS), frameCount: Number(artifact.frameCount) })}::jsonb,
            ${new Date(String(artifact.startedAt))},${new Date(String(artifact.endedAt))}) RETURNING id`;
        experimentId = created[0].id;
        await this.prisma.$executeRaw`
          INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data)
          VALUES(${experimentId}::uuid,1,'demonstration_recorded',
            ${JSON.stringify({ outcome: artifact.interrupted ? "interrupted" : "completed" })}::jsonb)`;
      }
      session.state = "COMPLETED";
      session.artifact = { ...artifact, demonstrationId: demonstration.id, experimentId };
      session.error = null;
    } catch (error) {
      session.state = "FAILED";
      session.error = error instanceof Error ? error.message : "Could not finalize recording.";
    }
    return session;
  }

  async reflect(user: AuthenticatedUser, id: string, reflection: unknown) {
    const session = await this.owned(user, id);
    if (session.state !== "COMPLETED") throw new BadRequestException("Finalize a demonstration before reflecting.");
    if (typeof reflection !== "string" || !reflection.trim()) throw new BadRequestException("Write a reflection first.");
    const experimentId = session.artifact?.experimentId;
    if (typeof experimentId !== "string") throw new BadRequestException("Demonstration evidence is unavailable.");
    const context = await this.context(user, session.attemptId);
    await this.prisma.$executeRaw`
      INSERT INTO public.learning_reflections(
        submission_id,experiment_id,learner_user_id,prompt_key,prompt_text,response_text)
      VALUES(${context.submission_id}::uuid,${experimentId}::uuid,${user.vistaUserId}::uuid,
        'c3_demonstration_reflection','What did the robot observe and which actions did you demonstrate?',${reflection.trim()})`;
    session.reflection = reflection.trim();
    return session;
  }

  async review(user: AuthenticatedUser, demoId: string) {
    const demonstration = await this.prisma.demonstration_episodes.findFirst({
      where: { id: demoId, recorded_by: user.vistaUserId },
      select: { id: true, storage_uri: true, checksum: true, frame_count: true, started_at: true,
        ended_at: true, provenance: true, metrics: true, outcome: true },
    });
    if (!demonstration?.storage_uri) throw new NotFoundException("Demonstration was not found.");
    const episodeId = demonstration.storage_uri.match(/^local:\/\/episodes\/([0-9a-f-]{36})\.json$/i)?.[1];
    if (!episodeId) throw new NotFoundException("Demonstration artifact is unavailable.");
    const review = await this.runtime("/api/tasks/vr-lekiwi/recording/review", "POST", { episodeId });
    if (review.checksum !== demonstration.checksum) {
      throw new BadRequestException("Demonstration artifact checksum does not match metadata.");
    }
    return { demonstration: { id: demonstration.id, status: demonstration.outcome,
      frameCount: demonstration.frame_count, startedAt: demonstration.started_at,
      endedAt: demonstration.ended_at,
      runtimeMode: (demonstration.provenance as any)?.runtimeMode ?? "offline_fake_follower",
      durationS: (demonstration.metrics as any)?.durationS ?? null,
      schemaVersion: review.schemaVersion },
      observationSummary: "Robot joint state and tracking metadata",
      actionSummary: "Final post-safety command", frameSamples: review.frameSamples };
  }

  private async context(user: AuthenticatedUser, attemptId: string): Promise<Context> {
    const rows = await this.prisma.$queryRaw<Context[]>`
      SELECT c.organization_id,ca.classroom_id,s.id AS submission_id,a.challenge_id,s.program_version_id
      FROM public.learning_assignment_attempts at
      JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id
      JOIN public.learning_classrooms c ON c.id=ca.classroom_id
      JOIN public.learning_assignments a ON a.id=ca.assignment_id
      JOIN public.learning_submissions s ON s.assignment_id=a.id
        AND s.program_id=at.program_id AND s.learner_user_id=at.learner_user_id
      WHERE at.id=${attemptId}::uuid AND at.learner_user_id=${user.vistaUserId}::uuid
      ORDER BY s.submitted_at DESC NULLS LAST LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("C3 submission context was not found.");
    return rows[0];
  }

  private async own(user: AuthenticatedUser, attemptId: string) {
    if (await this.learning.assignmentTitleForAttempt(user, attemptId) !== "Teach by Demonstration") {
      throw new NotFoundException("C3 demonstration practice was not found.");
    }
  }

  private async owned(user: AuthenticatedUser, id: string) {
    const session = this.sessions.get(id);
    if (!session || session.userId !== user.vistaUserId) {
      throw new NotFoundException("Demonstration session was not found.");
    }
    await this.own(user, session.attemptId);
    return session;
  }

  private async runtime(path: string, method: "POST", body: Record<string, unknown>) {
    const base = this.config.get<string>("ROBOT_RUNTIME_BASE_URL")?.replace(/\/$/, "");
    if (!base) throw new ServiceUnavailableException("VR runtime is not configured.");
    const response = await fetch(`${base}${path}`, { method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body) });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : `VR runtime returned ${response.status}`);
    return value as Record<string, unknown>;
  }
}
