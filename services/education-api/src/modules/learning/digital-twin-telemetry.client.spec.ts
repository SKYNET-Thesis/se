import { DigitalTwinTelemetryClient } from "./digital-twin-telemetry.client";

describe("DigitalTwinTelemetryClient", () => {
  const telemetry = { source_mode: "SIMULATION", robot_id: "robot-a", sequence: 1 };

  it("sends only scoped simulation data to a loopback twin endpoint", async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "accepted" }) });
    const client = new DigitalTwinTelemetryClient({ DIGITAL_TWIN_SCOPE_SECRET: "test-secret", DIGITAL_TWIN_TELEMETRY_URL: "http://127.0.0.1:8000" } as NodeJS.ProcessEnv, fetcher);
    await expect(client.publish({ organizationId: "org-a", robotId: "robot-a", experimentId: "exp-a", telemetry })).resolves.toMatchObject({ status: "accepted" });
    const [, request] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toMatchObject({ Authorization: expect.stringMatching(/^Bearer v1\./) });
    expect(JSON.parse(request.body as string)).toMatchObject({ organization_id: "org-a", robot_id: "robot-a", telemetry });
  });

  it("rejects physical or mismatched telemetry before network access", async () => {
    const fetcher = jest.fn();
    const client = new DigitalTwinTelemetryClient({ DIGITAL_TWIN_SCOPE_SECRET: "test-secret", DIGITAL_TWIN_TELEMETRY_URL: "http://127.0.0.1:8000" } as NodeJS.ProcessEnv, fetcher);
    await expect(client.publish({ organizationId: "org-a", robotId: "robot-a", experimentId: "exp-a", telemetry: { ...telemetry, source_mode: "LIVE_PHYSICAL" } })).resolves.toEqual({ status: "rejected" });
    await expect(client.publish({ organizationId: "org-a", robotId: "robot-a", experimentId: "exp-a", telemetry: { ...telemetry, robot_id: "robot-b" } })).resolves.toEqual({ status: "rejected" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses non-loopback endpoints", async () => {
    const fetcher = jest.fn();
    const client = new DigitalTwinTelemetryClient({ DIGITAL_TWIN_SCOPE_SECRET: "test-secret", DIGITAL_TWIN_TELEMETRY_URL: "https://twin.example" } as NodeJS.ProcessEnv, fetcher);
    await expect(client.publish({ organizationId: "org-a", robotId: "robot-a", experimentId: "exp-a", telemetry })).resolves.toEqual({ status: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  describe("physical publisher route", () => {
    const env = { DIGITAL_TWIN_SCOPE_SECRET: "s".repeat(32), DIGITAL_TWIN_TELEMETRY_URL: "http://vista-digital-twin:8767" } as NodeJS.ProcessEnv;
    const input = { ownerId: "owner-1", organizationId: "org-1", robotId: "robot-1", measuredAt: "2026-11-27T01:00:00.000Z", observation: { "gripper.pos": 5 } };
    it("posts to /internal/physical-telemetry (never the simulation route) with a publisher-audience token bound to owner, organization and robot", async () => {
      const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
      await expect(new DigitalTwinTelemetryClient(env, fetcher as never).publishPhysical(input)).resolves.toEqual({ status: "accepted" });
      const [url, init] = fetcher.mock.calls[0]; expect(url).toBe("http://vista-digital-twin:8767/internal/physical-telemetry"); expect(String(url)).not.toContain("simulation");
      const claims = JSON.parse(Buffer.from(String(init.headers.Authorization).split(".")[1], "base64url").toString());
      expect(claims).toMatchObject({ aud: "vista-digital-twin-publisher", kind: "publisher", sub: "owner-1", org: "org-1", robots: ["robot-1"] });
      expect(JSON.parse(init.body)).toEqual({ owner_id: "owner-1", organization_id: "org-1", robot_id: "robot-1", measured_at: input.measuredAt, observation: input.observation });
    });
    it("is unavailable without the secret or for a non-private endpoint, and maps rejection/outage", async () => {
      expect(await new DigitalTwinTelemetryClient({} as NodeJS.ProcessEnv, jest.fn() as never).publishPhysical(input)).toEqual({ status: "unavailable" });
      expect(await new DigitalTwinTelemetryClient({ ...env, DIGITAL_TWIN_TELEMETRY_URL: "https://example.com" } as NodeJS.ProcessEnv, jest.fn() as never).publishPhysical(input)).toEqual({ status: "unavailable" });
      expect(await new DigitalTwinTelemetryClient(env, jest.fn().mockResolvedValue({ ok: false }) as never).publishPhysical(input)).toEqual({ status: "rejected" });
      expect(await new DigitalTwinTelemetryClient(env, jest.fn().mockRejectedValue(new Error("down")) as never).publishPhysical(input)).toEqual({ status: "unavailable" });
    });
  });
});
