import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { RECORDING_SCHEMA, objectKey } from "./robot-recording.contract";
import { RecordingRejectedError, RecordingRetryError, RobotRecordingService } from "./robot-recording.service";

const ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9", RUN = "11111111-2222-4333-8444-555555555555", EPISODE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", USER = { vistaUserId: "u1" } as never;
const SHA = "b".repeat(64);
const file = { name: "trajectory.ndjson", sizeBytes: 1200, sha256: SHA, contentType: "application/x-ndjson", artifactType: "trajectory" };
const manifest = (over: Record<string, unknown> = {}) => ({ schema: RECORDING_SCHEMA, episodeId: EPISODE, robotId: ROBOT, experimentId: RUN, startedAtMs: 1000, endedAtMs: 2000, declaredRuntimeKind: "PHYSICAL_ROBOT", files: [file], ...over });
const manifestKey = objectKey(ROBOT, RUN, EPISODE, "manifest.json");

function fixture(over: { manifest?: unknown; experiment?: boolean; heads?: Record<string, unknown>; inserted?: number[]; enabled?: boolean } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const queue = [...(over.inserted ?? [1])];
  const storage = {
    enabled: () => over.enabled ?? true,
    createUpload: async (key: string) => ({ url: "https://bucket.example", fields: { key } }),
    createManifestUpload: async (key: string) => ({ url: "https://bucket.example", fields: { key } }),
    readManifest: async () => (over.manifest === undefined ? manifest() : over.manifest),
    head: async (key: string) => (key in (over.heads ?? {}) ? over.heads![key] : { contentLength: file.sizeBytes, sha256: SHA }),
    download: async (key: string) => `https://signed.example/${key}`,
  };
  const prisma = {
    $queryRaw: async (strings: TemplateStringsArray) => (/FROM public\.learning_experiments e JOIN/.test(strings.join("?")) && (over.experiment ?? true) ? [{ id: RUN, robot_id: ROBOT }] : /learning_experiment_artifacts a/.test(strings.join("?")) ? [] : []),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      $executeRaw: async (query: { sql?: string; strings?: string[]; values?: unknown[] } | TemplateStringsArray, ...rest: unknown[]) => {
        const text = Array.isArray(query) ? (query as unknown as string[]).join("?") : ((query as { sql?: string }).sql ?? "");
        calls.push({ sql: text, values: Array.isArray(query) ? rest : ((query as { values?: unknown[] }).values ?? []) });
        return /learning_experiment_artifacts/.test(text) ? (queue.shift() ?? 0) : 1;
      },
    }),
  };
  return { service: new RobotRecordingService(prisma as never, storage as never, () => 1_700_000_000_000), calls };
}

describe("RobotRecordingService.register (episode consumer)", () => {
  it("registers every file as evidence, once, and never labels the declared runtime as verified", async () => {
    const { service, calls } = fixture();
    await expect(service.register(manifestKey)).resolves.toBe("registered");
    const insert = calls.find((c) => /INSERT INTO public\.learning_experiment_artifacts/.test(c.sql))!;
    const metadata = JSON.parse(insert.values.find((v) => typeof v === "string" && v.startsWith("{")) as string);
    expect(metadata).toMatchObject({ schema: RECORDING_SCHEMA, episodeId: EPISODE, declaredRuntimeKind: "PHYSICAL_ROBOT", runtimeVerified: false, sha256: SHA });
    expect(insert.values).toContain(objectKey(ROBOT, RUN, EPISODE, file.name));
    expect(calls.some((c) => /robot_recording_registered/.test(c.sql))).toBe(true);
  });

  it("is idempotent: a duplicate manifest registers nothing and records no second event", async () => {
    const { service, calls } = fixture({ inserted: [0] });
    await expect(service.register(manifestKey)).resolves.toBe("duplicate");
    expect(calls.some((c) => /robot_recording_registered/.test(c.sql))).toBe(false);
  });

  it("retries (never loses) an episode whose artifact is not in the bucket yet, and when the manifest is not readable yet", async () => {
    const missing = fixture({ heads: { [objectKey(ROBOT, RUN, EPISODE, file.name)]: null } });
    await expect(missing.service.register(manifestKey)).rejects.toBeInstanceOf(RecordingRetryError);
    await expect(fixture({ manifest: null }).service.register(manifestKey)).rejects.toBeInstanceOf(RecordingRetryError);
  });

  it("rejects permanently what can never become valid: wrong size or checksum, bad manifest, foreign identity, unknown run, bad key", async () => {
    const head = (over: Record<string, unknown>) => ({ [objectKey(ROBOT, RUN, EPISODE, file.name)]: { contentLength: file.sizeBytes, sha256: SHA, ...over } });
    await expect(fixture({ heads: head({ sha256: "c".repeat(64) }) }).service.register(manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);
    await expect(fixture({ heads: head({ contentLength: 1 }) }).service.register(manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);
    await expect(fixture({ manifest: manifest({ schema: "nope" }) }).service.register(manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);
    await expect(fixture({ manifest: manifest({ robotId: "99999999-2222-4333-8444-555555555555" }) }).service.register(manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);
    await expect(fixture({ experiment: false }).service.register(manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);
    await expect(fixture().service.register(`episodes/${ROBOT}/${RUN}/${EPISODE}/trajectory.ndjson`)).rejects.toBeInstanceOf(RecordingRejectedError);
    await expect(fixture().service.register("anything/else")).rejects.toBeInstanceOf(RecordingRejectedError);
  });
});

describe("RobotRecordingService.authorizeUpload", () => {
  it("returns one presigned upload per file under the run's own prefix, and the manifest last", async () => {
    const { service } = fixture();
    const result = await service.authorizeUpload(USER, RUN, { episodeId: EPISODE, files: [file] });
    expect(result.uploads.map((u) => u.key)).toEqual([objectKey(ROBOT, RUN, EPISODE, file.name)]);
    expect(result.manifest).toMatchObject({ key: manifestKey, uploadLast: true });
    expect(result.robotId).toBe(ROBOT);
  });

  it("refuses: disabled storage, a run the student does not own, bad input", async () => {
    await expect(fixture({ enabled: false }).service.authorizeUpload(USER, RUN, { episodeId: EPISODE, files: [file] })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(fixture({ experiment: false }).service.authorizeUpload(USER, RUN, { episodeId: EPISODE, files: [file] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(fixture().service.authorizeUpload(USER, RUN, { episodeId: "x", files: [file] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(fixture().service.authorizeUpload(USER, RUN, { episodeId: EPISODE, files: [{ ...file, name: "../x" }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(fixture().service.authorizeUpload(USER, "not-a-uuid", { episodeId: EPISODE, files: [file] })).rejects.toBeInstanceOf(BadRequestException);
  });
});
