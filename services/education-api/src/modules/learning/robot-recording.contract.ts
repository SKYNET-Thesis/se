/**
 * Robot Recordings: what the Desktop/edge uploads for a robot run, and the one manifest that makes an episode count.
 * Layout in the private recordings bucket: episodes/<robotId>/<experimentId>/<episodeId>/<file>. `manifest.json` is uploaded LAST; its creation is the
 * "episode complete" event (S3 to SQS), so a manifest can only describe files that were uploaded before it.
 */
export const RECORDING_SCHEMA = "vista.robot.recording.v1";
export const MANIFEST_NAME = "manifest.json";
export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 128 * 1024;
/** A subset of the artifact types the database allows (learning_experiment_artifacts_artifact_type_check). */
export const ARTIFACT_TYPES = ["video", "trajectory", "observation", "log", "metrics", "image", "other"] as const;
export const CONTENT_TYPES = ["video/mp4", "video/webm", "application/json", "application/x-ndjson", "text/plain", "text/csv", "image/png", "image/jpeg", "application/vnd.apache.parquet", "application/octet-stream"] as const;
/** What the uploader DECLARES. The API never upgrades a declaration to a verified fact: only the runtime the API itself dispatched to can be verified. */
export const DECLARED_RUNTIME_KINDS = ["SIMULATION", "MOCK_RUNTIME", "PHYSICAL_ROBOT", "UNVERIFIED_RUNTIME"] as const;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const KEY = new RegExp(`^episodes/(${UUID})/(${UUID})/(${UUID})/([A-Za-z0-9][A-Za-z0-9._-]{0,79})$`);

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
export interface RecordingFile { name: string; sizeBytes: number; sha256: string; contentType: string; artifactType: ArtifactType }
export interface RecordingManifest {
  schema: typeof RECORDING_SCHEMA; episodeId: string; robotId: string; experimentId: string; startedAtMs: number; endedAtMs: number;
  declaredRuntimeKind: (typeof DECLARED_RUNTIME_KINDS)[number]; files: RecordingFile[];
}

export const episodePrefix = (robotId: string, experimentId: string, episodeId: string) => `episodes/${robotId}/${experimentId}/${episodeId}`;
export const objectKey = (robotId: string, experimentId: string, episodeId: string, name: string) => `${episodePrefix(robotId, experimentId, episodeId)}/${name}`;

/** Splits a bucket key into its identities, or null when it is not a well-formed recording key. */
export function parseKey(key: unknown): { robotId: string; experimentId: string; episodeId: string; name: string } | null {
  if (typeof key !== "string") return null;
  const match = KEY.exec(key);
  return match ? { robotId: match[1], experimentId: match[2], episodeId: match[3], name: match[4] } : null;
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && new RegExp(`^${UUID}$`).test(value);

export type FileCheck = { ok: true; file: RecordingFile } | { ok: false; reason: string };
export function checkFile(value: unknown): FileCheck {
  const f = value as Record<string, unknown> | null;
  if (!f || typeof f !== "object") return { ok: false, reason: "file entry is not an object" };
  if (typeof f.name !== "string" || !NAME.test(f.name) || f.name === MANIFEST_NAME) return { ok: false, reason: "file name is invalid" };
  if (!Number.isSafeInteger(f.sizeBytes) || (f.sizeBytes as number) < 1 || (f.sizeBytes as number) > MAX_FILE_BYTES) return { ok: false, reason: `file ${f.name} size is invalid` };
  if (typeof f.sha256 !== "string" || !SHA256.test(f.sha256)) return { ok: false, reason: `file ${f.name} sha256 is invalid` };
  if (!(CONTENT_TYPES as readonly string[]).includes(f.contentType as string)) return { ok: false, reason: `file ${f.name} content type is not allowed` };
  if (!(ARTIFACT_TYPES as readonly string[]).includes(f.artifactType as string)) return { ok: false, reason: `file ${f.name} artifact type is not allowed` };
  return { ok: true, file: { name: f.name, sizeBytes: f.sizeBytes as number, sha256: f.sha256, contentType: f.contentType as string, artifactType: f.artifactType as ArtifactType } };
}

export function checkFiles(value: unknown): { ok: true; files: RecordingFile[] } | { ok: false; reason: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FILES) return { ok: false, reason: `an episode has 1 to ${MAX_FILES} files` };
  const files: RecordingFile[] = []; const names = new Set<string>(); let total = 0;
  for (const entry of value) {
    const checked = checkFile(entry);
    if (!checked.ok) return checked;
    if (names.has(checked.file.name)) return { ok: false, reason: `file ${checked.file.name} is listed twice` };
    names.add(checked.file.name); total += checked.file.sizeBytes; files.push(checked.file);
  }
  return total > MAX_TOTAL_BYTES ? { ok: false, reason: "episode is larger than the allowed total" } : { ok: true, files };
}

export function parseManifest(value: unknown): { ok: true; manifest: RecordingManifest } | { ok: false; reason: string } {
  const m = value as Record<string, unknown> | null;
  if (!m || typeof m !== "object" || Array.isArray(m)) return { ok: false, reason: "manifest is not an object" };
  if (m.schema !== RECORDING_SCHEMA) return { ok: false, reason: "manifest schema is not supported" };
  if (!isUuid(m.episodeId) || !isUuid(m.robotId) || !isUuid(m.experimentId)) return { ok: false, reason: "manifest identities must be UUIDs" };
  if (!Number.isSafeInteger(m.startedAtMs) || !Number.isSafeInteger(m.endedAtMs) || (m.endedAtMs as number) < (m.startedAtMs as number)) return { ok: false, reason: "manifest times are invalid" };
  if (!(DECLARED_RUNTIME_KINDS as readonly string[]).includes(m.declaredRuntimeKind as string)) return { ok: false, reason: "declaredRuntimeKind is invalid" };
  const files = checkFiles(m.files);
  if (!files.ok) return files;
  return { ok: true, manifest: { schema: RECORDING_SCHEMA, episodeId: m.episodeId, robotId: m.robotId, experimentId: m.experimentId, startedAtMs: m.startedAtMs as number, endedAtMs: m.endedAtMs as number, declaredRuntimeKind: m.declaredRuntimeKind as RecordingManifest["declaredRuntimeKind"], files: files.files } };
}
