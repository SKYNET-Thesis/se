import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { ExperimentEvidenceStorage } from "./experiment-evidence.storage";

interface EvidenceScope { experiment_id: string; learner_user_id: string; classroom_id: string; organization_id: string; assignment_id: string; }
interface Artifact { id: string; artifact_type?: string; storage_path: string | null; external_uri?: string | null; mime_type?: string | null; metadata: Record<string, unknown>; experiment_id: string; learner_user_id: string; classroom_id: string; organization_id: string; }

@Injectable()
export class ExperimentEvidenceService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly storage?: ExperimentEvidenceStorage) {}

  /** Persist only server-originated simulation telemetry, idempotently scoped to experiment and learner. */
  async persistTelemetry(experimentId: string, telemetry: unknown) {
    const state = telemetry as Record<string, unknown> | null;
    if (!this.storage || !state || state.source_mode !== "SIMULATION") return { availability: "unavailable" as const };
    const rows = await this.prisma.$queryRaw<EvidenceScope[]>`
      SELECT e.id AS experiment_id,e.learner_user_id,(e.input_snapshot->>'classroomId') AS classroom_id,cs.organization_id,s.assignment_id
      FROM public.learning_experiments e JOIN public.control_sessions cs ON cs.id=e.control_session_id
      JOIN public.learning_submissions s ON s.id=e.submission_id AND s.learner_user_id=e.learner_user_id
      WHERE e.id=${experimentId}::uuid AND e.status='succeeded' AND e.execution_mode='real_robot'
        AND e.learner_user_id::text=e.input_snapshot->>'studentId'
        AND e.input_snapshot->>'robotId'=${typeof state.robot_id === "string" ? state.robot_id : ""}
      LIMIT 1`;
    const scope = rows[0];
    if (!scope || !scope.classroom_id) return { availability: "unavailable" as const };
    const old = await this.prisma.$queryRaw<Artifact[]>`
      SELECT a.id,a.storage_path,a.metadata,e.id AS experiment_id,e.learner_user_id,
        e.input_snapshot->>'classroomId' AS classroom_id,cs.organization_id
      FROM public.learning_experiment_artifacts a JOIN public.learning_experiments e ON e.id=a.experiment_id
      JOIN public.control_sessions cs ON cs.id=e.control_session_id
      WHERE a.experiment_id=${experimentId}::uuid AND a.artifact_type='other' AND a.metadata->>'schema'='vista.experiment.telemetry.v1' ORDER BY a.created_at LIMIT 1`;
    if (old[0]) return await this.isAvailable(old[0]) ? { availability: "available" as const, artifactId: old[0].id } : { availability: "unavailable" as const, artifactId: old[0].id };

    const body = Buffer.from(JSON.stringify({ schema: "vista.experiment.telemetry.v1", experimentId, assignmentId: scope.assignment_id, studentId: scope.learner_user_id, classroomId: scope.classroom_id, organizationId: scope.organization_id, sourceMode: "SIMULATION", telemetry }));
    const key = this.storage.newKey({ organizationId: scope.organization_id, classroomId: scope.classroom_id, experimentId, studentId: scope.learner_user_id });
    let metadata: Record<string, unknown> = { schema: "vista.experiment.telemetry.v1", sourceMode: "SIMULATION", availability: "unavailable" };
    let storagePath: string | null = null;
    try {
      const digest = await this.storage.put(key, body, { experimentId, studentId: scope.learner_user_id, classroomId: scope.classroom_id, organizationId: scope.organization_id });
      if (await this.storage.verify(key, { ...digest, experimentId, studentId: scope.learner_user_id, classroomId: scope.classroom_id, organizationId: scope.organization_id })) {
        metadata = { ...metadata, availability: "available", sha256: digest.sha256, sizeBytes: digest.sizeBytes };
        storagePath = key;
      }
    } catch { /* object-store failure is persisted as unavailable, never as a delivered artifact */ }
    // The table requires a storage_path or external_uri: when the object store did not accept the evidence nothing is persisted
    // (an artifact row without an object would violate that constraint and must never be reported as delivered).
    if (!storagePath) return { availability: "unavailable" as const };
    const artifact = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${experimentId}::text, 73))`;
      const existing = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM public.learning_experiment_artifacts WHERE experiment_id=${experimentId}::uuid AND artifact_type='other' AND metadata->>'schema'='vista.experiment.telemetry.v1' ORDER BY created_at LIMIT 1`;
      if (existing[0]) return existing[0];
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO public.learning_experiment_artifacts(experiment_id,artifact_type,storage_path,mime_type,metadata)
        VALUES(${experimentId}::uuid,'other',${storagePath},'application/json',${JSON.stringify({ ...metadata, schema: "vista.experiment.telemetry.v1" })}::jsonb)
        RETURNING id`;
      return inserted[0];
    });
    return { availability: storagePath ? "available" as const : "unavailable" as const, artifactId: artifact?.id };
  }

  async studentDownload(user: AuthenticatedUser, experimentId: string, artifactId: string) {
    const row = await this.prisma.$queryRaw<Artifact[]>`
      SELECT a.id,a.storage_path,a.metadata,e.id AS experiment_id,e.learner_user_id,
        e.input_snapshot->>'classroomId' AS classroom_id,cs.organization_id,e.input_snapshot->>'assignmentId' AS assignment_id
      FROM public.learning_experiment_artifacts a JOIN public.learning_experiments e ON e.id=a.experiment_id
      JOIN public.control_sessions cs ON cs.id=e.control_session_id
      JOIN public.learning_submissions s ON s.id=e.submission_id AND s.learner_user_id=e.learner_user_id
      JOIN public.learning_assignment_attempts at ON at.id=s.attempt_id
      JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id AND ca.assignment_id=s.assignment_id
        AND ca.classroom_id=(e.input_snapshot->>'classroomId')::uuid
      JOIN public.learning_classroom_members cm ON cm.classroom_id=(e.input_snapshot->>'classroomId')::uuid
        AND cm.user_id=e.learner_user_id AND cm.status='active' AND cm.classroom_role='student'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=e.learner_user_id
        AND m.organization_id=cs.organization_id AND m.status='active'
      WHERE a.id=${artifactId}::uuid AND e.id=${experimentId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid`;
    if (!row[0]) throw new NotFoundException("Experiment evidence was not found.");
    return this.download(row[0]);
  }

  async listStudent(user: AuthenticatedUser, experimentId: string) {
    const rows = await this.prisma.$queryRaw<Artifact[]>`
      SELECT a.id,a.artifact_type,a.storage_path,a.external_uri,a.mime_type,a.metadata,e.id AS experiment_id,
        e.learner_user_id,e.input_snapshot->>'classroomId' AS classroom_id,cs.organization_id,e.input_snapshot->>'assignmentId' AS assignment_id
      FROM public.learning_experiment_artifacts a JOIN public.learning_experiments e ON e.id=a.experiment_id
      JOIN public.control_sessions cs ON cs.id=e.control_session_id
      JOIN public.learning_submissions s ON s.id=e.submission_id AND s.learner_user_id=e.learner_user_id
      JOIN public.learning_assignment_attempts at ON at.id=s.attempt_id
      JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id AND ca.assignment_id=s.assignment_id
        AND ca.classroom_id=(e.input_snapshot->>'classroomId')::uuid
      JOIN public.learning_classroom_members cm ON cm.classroom_id=(e.input_snapshot->>'classroomId')::uuid
        AND cm.user_id=e.learner_user_id AND cm.status='active' AND cm.classroom_role='student'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=e.learner_user_id
        AND m.organization_id=cs.organization_id AND m.status='active'
      WHERE e.id=${experimentId}::uuid AND e.learner_user_id=${user.vistaUserId}::uuid ORDER BY a.created_at`;
    return Promise.all(rows.map(async (row) => {
      const available = await this.isAvailable(row);
      return {
        id: row.id, type: row.artifact_type, mimeType: row.mime_type, createdAt: (row.metadata as any)?.createdAt,
        availability: available ? "available" : row.external_uri && !row.external_uri.startsWith("local://") ? "access_unverified" : "unavailable",
        downloadPath: available && row.metadata?.schema === "vista.experiment.telemetry.v1" ? `/me/experiments/${experimentId}/artifacts/${row.id}/download` : null,
      };
    }));
  }

  async teacherDownload(submissionId: string, experimentId: string, artifactId: string) {
    const rows = await this.prisma.$queryRaw<Artifact[]>`
      SELECT a.id,a.storage_path,a.metadata,e.id AS experiment_id,e.learner_user_id,
        e.input_snapshot->>'classroomId' AS classroom_id,cs.organization_id,
        e.input_snapshot->>'assignmentId' AS assignment_id
      FROM public.learning_experiment_artifacts a JOIN public.learning_experiments e ON e.id=a.experiment_id
      JOIN public.control_sessions cs ON cs.id=e.control_session_id
      JOIN public.learning_submissions s ON s.id=e.submission_id AND s.learner_user_id=e.learner_user_id
      JOIN public.learning_assignment_attempts at ON at.id=s.attempt_id
      JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id AND ca.assignment_id=s.assignment_id
        AND ca.classroom_id=(e.input_snapshot->>'classroomId')::uuid
      WHERE a.id=${artifactId}::uuid AND e.id=${experimentId}::uuid AND e.submission_id=${submissionId}::uuid`;
    if (!rows[0]) throw new NotFoundException("Experiment evidence was not found.");
    return this.download(rows[0]);
  }

  async studentDownloadFromClassroom(user: AuthenticatedUser, experimentId: string, artifactId: string) {
    const rows = await this.prisma.$queryRaw<Array<Artifact & { attempt_id: string }>>`
      SELECT a.id,a.storage_path,a.metadata,e.id AS experiment_id,e.learner_user_id,
        e.input_snapshot->>'classroomId' AS classroom_id,cs.organization_id,s.assignment_id,s.attempt_id
      FROM public.learning_experiment_artifacts a JOIN public.learning_experiments e ON e.id=a.experiment_id
      JOIN public.control_sessions cs ON cs.id=e.control_session_id
      JOIN public.learning_submissions s ON s.id=e.submission_id AND s.learner_user_id=e.learner_user_id
      JOIN public.learning_assignment_attempts at ON at.id=s.attempt_id
      JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id AND ca.assignment_id=s.assignment_id
        AND ca.classroom_id=(e.input_snapshot->>'classroomId')::uuid
      WHERE a.id=${artifactId}::uuid AND e.id=${experimentId}::uuid`;
    if (!rows[0]) throw new NotFoundException("Experiment evidence was not found.");
    return this.studentDownload(user, experimentId, artifactId);
  }

  private async download(row: Artifact) {
    if (!this.storage || !row.storage_path || !this.storage.validKey(row.storage_path) || !(await this.isAvailable(row))) {
      return { status: "unavailable" as const };
    }
    return { status: "available" as const, url: await this.storage.download(row.storage_path) };
  }

  private verifyArtifact(row: Artifact) {
    const meta = row.metadata ?? {};
    if (!this.storage || !row.storage_path || typeof meta.sha256 !== "string" || typeof meta.sizeBytes !== "number") return Promise.resolve(false);
    return this.storage.verify(row.storage_path, { sha256: meta.sha256, sizeBytes: meta.sizeBytes, experimentId: row.experiment_id, studentId: row.learner_user_id, classroomId: row.classroom_id, organizationId: row.organization_id });
  }

  private async isAvailable(row: Artifact) {
    try { return await this.verifyArtifact(row); }
    catch { return false; }
  }
}
