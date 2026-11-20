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
});
