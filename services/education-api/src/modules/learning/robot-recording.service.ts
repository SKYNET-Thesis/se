import { BadRequestException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { MANIFEST_NAME, RECORDING_SCHEMA, checkFiles, isUuid, objectKey, parseKey, parseManifest } from "./robot-recording.contract";
import { RobotRecordingStorage } from "./robot-recording.storage";

/** A permanent input or correlation failure: the queue message is acknowledged and never retried. */
export class RecordingRejectedError extends Error {}
/** A transient condition (an artifact is not there yet, storage unreachable): the message stays for redelivery and ends in the DLQ if it never resolves. */
export class RecordingRetryError extends Error {}

export type RegisterResult = "registered" | "duplicate";
type ExperimentRow = { id: string; robot_id: string };

@Injectable()
export class RobotRecordingService {
  private readonly now: () => number;
  constructor(private readonly prisma: PrismaService, private readonly storage: RobotRecordingStorage, @Optional() @Inject("ROBOT_RECORDING_NOW") now?: () => number) { this.now = now ?? (() => Date.now()); }

  /** The student's own real-robot experiment, still inside its upload window (24 h), together with the robot it ran on. */
  private async ownedExperiment(user: AuthenticatedUser, experimentId: string): Promise<ExperimentRow> {
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>`
      SELECT e.id, cs.robot_id
      FROM public.learning_experiments e JOIN public.control_sessions cs ON cs.id=e.control_session_id
      WHERE e.id=${experimentId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid AND e.execution_mode='real_robot'
        AND e.input_snapshot->>'robotId'=cs.robot_id::text AND e.created_at > now() - interval '24 hours'
      LIMIT 1`;
    if (!rows[0]) throw new NotFoundException("The robot run was not found, or its upload window has closed.");
    return rows[0];
  }

  /** Authorises one episode upload: validates the file list, then returns one presigned POST per file and one for the manifest (to be sent last). */
  async authorizeUpload(user: AuthenticatedUser, experimentId: string, body: unknown) {
    if (!this.storage.enabled()) throw new ServiceUnavailableException("Robot recordings are not enabled.");
    if (!isUuid(experimentId)) throw new BadRequestException("Experiment id is invalid.");
    const input = body as { episodeId?: unknown; files?: unknown } | null;
    if (!input || !isUuid(input.episodeId)) throw new BadRequestException("episodeId must be a UUID.");
    const files = checkFiles(input.files);
    if (!files.ok) throw new BadRequestException(files.reason);
    const experiment = await this.ownedExperiment(user, experimentId);
    const episodeId = input.episodeId;
    const uploads = await Promise.all(files.files.map(async (file) => {
      const key = objectKey(experiment.robot_id, experimentId, episodeId, file.name);
      const post = await this.storage.createUpload(key, file);
      return { name: file.name, key, url: post.url, fields: post.fields };
    }));
    const manifestKey = objectKey(experiment.robot_id, experimentId, episodeId, MANIFEST_NAME);
    const manifest = await this.storage.createManifestUpload(manifestKey);
    return { episodeId, robotId: experiment.robot_id, schema: RECORDING_SCHEMA, expiresInSeconds: 900, uploads, manifest: { key: manifestKey, url: manifest.url, fields: manifest.fields, uploadLast: true } };
  }

  /**
   * The episode consumer. Called with the key of a created manifest; verifies it against the database and the bucket, then registers every file as
   * evidence of the experiment. Idempotent: a redelivered or duplicated manifest registers nothing twice.
   */
  async register(manifestKey: string): Promise<RegisterResult> {
    const ids = parseKey(manifestKey);
    if (!ids || ids.name !== MANIFEST_NAME) throw new RecordingRejectedError("not a recording manifest key");
    const raw = await this.storage.readManifest(manifestKey).catch(() => { throw new RecordingRetryError("manifest could not be read"); });
    if (raw === null) throw new RecordingRetryError("manifest is not readable yet");
    const parsed = parseManifest(raw);
    if (!parsed.ok) throw new RecordingRejectedError(parsed.reason);
    const manifest = parsed.manifest;
    if (manifest.robotId !== ids.robotId || manifest.experimentId !== ids.experimentId || manifest.episodeId !== ids.episodeId) throw new RecordingRejectedError("manifest identities do not match its location");
    const rows = await this.prisma.$queryRaw<ExperimentRow[]>`
      SELECT e.id, cs.robot_id FROM public.learning_experiments e JOIN public.control_sessions cs ON cs.id=e.control_session_id
      WHERE e.id=${manifest.experimentId}::uuid AND cs.robot_id=${manifest.robotId}::uuid AND e.execution_mode='real_robot' AND e.input_snapshot->>'robotId'=${manifest.robotId}
      LIMIT 1`;
    if (!rows[0]) throw new RecordingRejectedError("no real-robot experiment matches this robot and run");

    const missing: string[] = [];
    for (const file of manifest.files) {
      const head = await this.storage.head(objectKey(manifest.robotId, manifest.experimentId, manifest.episodeId, file.name)).catch(() => { throw new RecordingRetryError("storage unavailable"); });
      if (!head) { missing.push(file.name); continue; }
      if (head.contentLength !== file.sizeBytes || head.sha256 !== file.sha256) throw new RecordingRejectedError(`artifact ${file.name} does not match the manifest`);
    }
    if (missing.length) throw new RecordingRetryError(`artifact missing: ${missing.join(", ")}`);

    const registeredAt = new Date(this.now()).toISOString();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${manifest.experimentId + ":" + manifest.episodeId}, 7))`;
      let inserted = 0;
      for (const file of manifest.files) {
        const key = objectKey(manifest.robotId, manifest.experimentId, manifest.episodeId, file.name);
        const metadata = { schema: RECORDING_SCHEMA, episodeId: manifest.episodeId, name: file.name, sizeBytes: file.sizeBytes, sha256: file.sha256,
          declaredRuntimeKind: manifest.declaredRuntimeKind, runtimeVerified: false, startedAtMs: manifest.startedAtMs, endedAtMs: manifest.endedAtMs, registeredAt };
        inserted += await tx.$executeRaw(Prisma.sql`
          INSERT INTO public.learning_experiment_artifacts(experiment_id,artifact_type,storage_path,mime_type,metadata)
          SELECT ${manifest.experimentId}::uuid,${file.artifactType},${key},${file.contentType},${JSON.stringify(metadata)}::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM public.learning_experiment_artifacts WHERE experiment_id=${manifest.experimentId}::uuid AND storage_path=${key})`);
      }
      if (inserted === 0) return "duplicate" as const;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO public.learning_experiment_events(experiment_id,event_index,event_type,event_data,occurred_at)
        SELECT ${manifest.experimentId}::uuid,COALESCE(MAX(event_index),-1)+1,'robot_recording_registered',${JSON.stringify({ episodeId: manifest.episodeId, files: inserted, declaredRuntimeKind: manifest.declaredRuntimeKind })}::jsonb,now()
        FROM public.learning_experiment_events WHERE experiment_id=${manifest.experimentId}::uuid
        ON CONFLICT (experiment_id,event_index) DO NOTHING`);
      return "registered" as const;
    });
  }

  /** The student's registered recordings of one run. A file is "available" only while its object still verifies. */
  async list(user: AuthenticatedUser, experimentId: string) {
    if (!isUuid(experimentId)) throw new BadRequestException("Experiment id is invalid.");
    const rows = await this.prisma.$queryRaw<Array<{ id: string; artifact_type: string; storage_path: string; mime_type: string | null; metadata: Record<string, unknown> }>>`
      SELECT a.id,a.artifact_type,a.storage_path,a.mime_type,a.metadata
      FROM public.learning_experiment_artifacts a JOIN public.learning_experiments e ON e.id=a.experiment_id
      WHERE e.id=${experimentId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid AND a.metadata->>'schema'=${RECORDING_SCHEMA}
      ORDER BY a.created_at,a.id`;
    return Promise.all(rows.map(async (row) => {
      const head = this.storage.enabled() && parseKey(row.storage_path) ? await this.storage.head(row.storage_path).catch(() => undefined) : null;
      const availability = head === undefined ? "access_unverified" : head && head.contentLength === row.metadata.sizeBytes ? "available" : "unavailable";
      return { id: row.id, type: row.artifact_type, name: row.metadata.name, mimeType: row.mime_type, sizeBytes: row.metadata.sizeBytes, episodeId: row.metadata.episodeId,
        declaredRuntimeKind: row.metadata.declaredRuntimeKind, runtimeVerified: false, availability,
        downloadPath: availability === "available" ? `/me/experiments/${experimentId}/recordings/${row.id}/download` : null };
    }));
  }

  async download(user: AuthenticatedUser, experimentId: string, artifactId: string) {
    if (!isUuid(experimentId) || !isUuid(artifactId)) throw new BadRequestException("Identity is invalid.");
    const rows = await this.prisma.$queryRaw<Array<{ storage_path: string; metadata: Record<string, unknown> }>>`
      SELECT a.storage_path,a.metadata FROM public.learning_experiment_artifacts a JOIN public.learning_experiments e ON e.id=a.experiment_id
      WHERE a.id=${artifactId}::uuid AND e.id=${experimentId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid AND a.metadata->>'schema'=${RECORDING_SCHEMA}`;
    const row = rows[0];
    if (!row || !parseKey(row.storage_path)) throw new NotFoundException("The recording was not found.");
    return { url: await this.storage.download(row.storage_path, String(row.metadata.name ?? "recording")), expiresInSeconds: 300 };
  }
}
