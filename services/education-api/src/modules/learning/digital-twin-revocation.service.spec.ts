import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DigitalTwinRevocationService } from "./digital-twin-revocation.service";

const SECRET = "unit-test-scope-secret";
const rows = [{ attempt_id: "att-1", organization_id: "org-1", robot_id: "rob-1" }, { attempt_id: "att-2", organization_id: "org-1", robot_id: "rob-1" }];

describe("DigitalTwinRevocationService (contract with a local Twin double)", () => {
  let server: Server; let endpoint = ""; let status = 202;
  const received: Array<{ path: string; auth: string; body: Record<string, string> }> = [];
  const queryRaw = jest.fn();
  const make = (env: Record<string, string | undefined> = { DIGITAL_TWIN_SCOPE_SECRET: SECRET, DIGITAL_TWIN_TELEMETRY_URL: endpoint, DIGITAL_TWIN_REVOKE_RETRY_MS: "0,0,0" }) => new DigitalTwinRevocationService({ $queryRaw: queryRaw } as never, env as NodeJS.ProcessEnv);

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = ""; req.on("data", (c) => { raw += c; }); req.on("end", () => { received.push({ path: req.url ?? "", auth: String(req.headers.authorization ?? ""), body: JSON.parse(raw || "{}") }); res.writeHead(status, { "Content-Type": "application/json" }); res.end("{}"); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  beforeEach(() => { received.length = 0; status = 202; queryRaw.mockReset().mockResolvedValue(rows); });

  it("posts one signed revocation per attempt with the identity the Twin requires", async () => {
    const report = await make().revoke({ attemptIds: ["att-1", "att-2"] });
    expect(report).toEqual({ requested: 2, accepted: 2, unavailable: 0, rejected: 0 });
    expect(received.map((r) => r.path)).toEqual(["/internal/revoke-attempt", "/internal/revoke-attempt"]);
    expect(received[0].body).toEqual({ organization_id: "org-1", robot_id: "rob-1", attempt_id: "att-1" });
    const [version, encoded, signature] = received[0].auth.replace("Bearer ", "").split(".");
    expect(version).toBe("v1");
    expect(createHmac("sha256", SECRET).update(encoded).digest("base64url")).toBe(signature);             // signed with the shared publisher secret
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString());
    expect(claims).toMatchObject({ aud: "vista-digital-twin-simulation-publisher", kind: "simulation_publisher", org: "org-1", robots: ["rob-1"], sub: "education-api" });
    expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);                               // short-lived
    expect(new Set(received.map((r) => JSON.parse(Buffer.from(r.auth.split(".")[1], "base64url").toString()).jti)).size).toBe(2); // unique jti per call
  });

  it("reports a Twin that rejects the call without throwing and without retrying a definitive refusal", async () => {
    status = 403;
    await expect(make().revoke({ attemptIds: ["att-1"] })).resolves.toMatchObject({ requested: 2, accepted: 0, rejected: 2 });
    expect(received).toHaveLength(2);                                                                         // one request per attempt, no retries on 4xx
  });

  it("retries transient failures with a fresh token each time and succeeds once the Twin recovers", async () => {
    queryRaw.mockResolvedValue([rows[0]]); let calls = 0; const originalStatus = status;
    const flaky = createServer((req, res) => { calls += 1; req.resume(); req.on("end", () => { received.push({ path: req.url ?? "", auth: String(req.headers.authorization ?? ""), body: {} }); res.writeHead(calls < 3 ? 503 : 202); res.end("{}"); }); });
    await new Promise<void>((resolve) => flaky.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(flaky.address() as AddressInfo).port}`;
    try {
      await expect(make({ DIGITAL_TWIN_SCOPE_SECRET: SECRET, DIGITAL_TWIN_TELEMETRY_URL: url, DIGITAL_TWIN_REVOKE_RETRY_MS: "0,0,0,0" }).revoke({ attemptIds: ["att-1"] })).resolves.toMatchObject({ requested: 1, accepted: 1, unavailable: 0 });
      expect(calls).toBe(3);                                                                                  // two 503s, then accepted
      const jtis = received.map((r) => JSON.parse(Buffer.from(r.auth.split(".")[1], "base64url").toString()).jti);
      expect(new Set(jtis).size).toBe(3);
    } finally { status = originalStatus; await new Promise<void>((resolve) => flaky.close(() => resolve())); }
  });

  it("gives up as unavailable after the configured number of attempts", async () => {
    status = 503; queryRaw.mockResolvedValue([rows[0]]);
    await expect(make({ DIGITAL_TWIN_SCOPE_SECRET: SECRET, DIGITAL_TWIN_TELEMETRY_URL: endpoint, DIGITAL_TWIN_REVOKE_RETRY_MS: "0,0,0" }).revoke({ attemptIds: ["att-1"] })).resolves.toMatchObject({ requested: 1, accepted: 0, unavailable: 1 });
    expect(received).toHaveLength(3);
  });

  it("never fails the caller when the Twin is unreachable, unconfigured or not on loopback", async () => {
    await expect(make({ DIGITAL_TWIN_SCOPE_SECRET: SECRET, DIGITAL_TWIN_TELEMETRY_URL: "http://127.0.0.1:1", DIGITAL_TWIN_REVOKE_RETRY_MS: "0,0" }).revoke({ attemptIds: ["att-1"] })).resolves.toMatchObject({ unavailable: 2 });
    await expect(make({}).revoke({ attemptIds: ["att-1"] })).resolves.toMatchObject({ unavailable: 2 });
    await expect(make({ DIGITAL_TWIN_SCOPE_SECRET: SECRET, DIGITAL_TWIN_TELEMETRY_URL: "https://twin.example.com" }).revoke({ attemptIds: ["att-1"] })).resolves.toMatchObject({ unavailable: 2 });
    queryRaw.mockRejectedValue(new Error("database down"));
    await expect(make().revoke({ userId: "u1", organizationId: "org-1" })).resolves.toEqual({ requested: 0, accepted: 0, unavailable: 0, rejected: 0 });
  });

  it("refuses an unscoped request so it can never revoke every viewer by accident", async () => {
    await expect(make().revoke({})).resolves.toEqual({ requested: 0, accepted: 0, unavailable: 0, rejected: 0 });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it("restricts user/organization/classroom revocations to in-progress attempts", async () => {
    await make().revoke({ userId: "u1", organizationId: "org-1" });
    expect(JSON.stringify(queryRaw.mock.calls[0])).toContain("in_progress");   // the status filter is part of the generated statement
  });

  it("prepare() resolves the viewers first and revokes them after the change commits", async () => {
    const run = await make().prepare({ classroomId: "cl-1" });
    expect(received).toHaveLength(0);                                                                         // nothing sent yet
    queryRaw.mockResolvedValue([]);                                                                           // the data changed meanwhile; the earlier resolution still applies
    await expect(run()).resolves.toMatchObject({ requested: 2, accepted: 2 });
    expect(received).toHaveLength(2);
  });
});
