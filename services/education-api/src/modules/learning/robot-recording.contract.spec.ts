import { MAX_FILES, MAX_FILE_BYTES, RECORDING_SCHEMA, checkFiles, objectKey, parseKey, parseManifest } from "./robot-recording.contract";

const ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9", RUN = "11111111-2222-4333-8444-555555555555", EPISODE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const file = (over: Record<string, unknown> = {}) => ({ name: "trajectory.ndjson", sizeBytes: 1200, sha256: "a".repeat(64), contentType: "application/x-ndjson", artifactType: "trajectory", ...over });
const manifest = (over: Record<string, unknown> = {}) => ({ schema: RECORDING_SCHEMA, episodeId: EPISODE, robotId: ROBOT, experimentId: RUN, startedAtMs: 1000, endedAtMs: 2000, declaredRuntimeKind: "MOCK_RUNTIME", files: [file()], ...over });

describe("robot recording contract", () => {
  it("builds and parses keys round trip, and refuses anything else", () => {
    const key = objectKey(ROBOT, RUN, EPISODE, "manifest.json");
    expect(key).toBe(`episodes/${ROBOT}/${RUN}/${EPISODE}/manifest.json`);
    expect(parseKey(key)).toEqual({ robotId: ROBOT, experimentId: RUN, episodeId: EPISODE, name: "manifest.json" });
    for (const bad of [`episodes/${ROBOT}/${RUN}/${EPISODE}/../x`, `episodes/x/${RUN}/${EPISODE}/a`, `other/${ROBOT}/${RUN}/${EPISODE}/a`, `episodes/${ROBOT}/${RUN}/${EPISODE}/a/b`, "", undefined, 5]) expect(parseKey(bad)).toBeNull();
  });

  it("accepts a well-formed episode and refuses unsafe file lists", () => {
    expect(checkFiles([file(), file({ name: "front.mp4", contentType: "video/mp4", artifactType: "video" })]).ok).toBe(true);
    const refused = (value: unknown) => { const r = checkFiles(value); return r.ok ? "accepted" : r.reason; };
    expect(refused([])).toMatch(/1 to/);
    expect(refused(Array.from({ length: MAX_FILES + 1 }, (_, i) => file({ name: `f${i}.json` })))).toMatch(/1 to/);
    expect(refused([file(), file()])).toMatch(/twice/);
    expect(refused([file({ name: "../etc/passwd" })])).toMatch(/name/);
    expect(refused([file({ name: "manifest.json" })])).toMatch(/name/);
    expect(refused([file({ sizeBytes: 0 })])).toMatch(/size/);
    expect(refused([file({ sizeBytes: MAX_FILE_BYTES + 1 })])).toMatch(/size/);
    expect(refused([file({ sha256: "xyz" })])).toMatch(/sha256/);
    expect(refused([file({ contentType: "text/html" })])).toMatch(/content type/);
    expect(refused([file({ artifactType: "program" })])).toMatch(/artifact type/);
    expect(refused([file({ sizeBytes: MAX_FILE_BYTES }), file({ name: "b.json", sizeBytes: MAX_FILE_BYTES }), file({ name: "c.json", sizeBytes: MAX_FILE_BYTES }), file({ name: "d.json", sizeBytes: MAX_FILE_BYTES }), file({ name: "e.json", sizeBytes: 1 })])).toMatch(/total/);
  });

  it("validates the manifest strictly", () => {
    expect(parseManifest(manifest()).ok).toBe(true);
    const reason = (value: unknown) => { const r = parseManifest(value); return r.ok ? "accepted" : r.reason; };
    expect(reason(null)).toMatch(/object/);
    expect(reason(manifest({ schema: "v0" }))).toMatch(/schema/);
    expect(reason(manifest({ robotId: "not-a-uuid" }))).toMatch(/UUID/);
    expect(reason(manifest({ endedAtMs: 10 }))).toMatch(/times/);
    expect(reason(manifest({ declaredRuntimeKind: "REAL" }))).toMatch(/declaredRuntimeKind/);
    expect(reason(manifest({ files: [] }))).toMatch(/1 to/);
  });
});
