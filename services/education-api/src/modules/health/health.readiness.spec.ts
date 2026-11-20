import { ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";

describe("readiness", () => {
  const repo = { schemaReadiness: jest.fn(), canConnect: jest.fn() };
  const service = new HealthService({ check: jest.fn() } as never, repo as never);
  afterEach(() => { delete process.env.DATABASE_RUNTIME_ROLE; });

  it("is ready only when the database answers and the schema matches this build", async () => {
    repo.schemaReadiness.mockResolvedValue({ database: true, academicMetadataColumns: true, mediaArchiveColumns: true, runtimeRole: "vista_app_runtime" });
    await expect(service.ready()).resolves.toMatchObject({ status: "ready", checks: { database: true, academicMetadataColumns: true, mediaArchiveColumns: true, runtimeRole: true } });
  });
  it.each([
    ["the database is down", { database: false, academicMetadataColumns: false, mediaArchiveColumns: false, runtimeRole: null }],
    ["migration P has not been applied", { database: true, academicMetadataColumns: false, mediaArchiveColumns: true, runtimeRole: "vista_app_runtime" }],
    ["staged migration Q (media archive) has not been applied", { database: true, academicMetadataColumns: true, mediaArchiveColumns: false, runtimeRole: "vista_app_runtime" }],
  ])("answers 503 when %s", async (_name, checks) => {
    repo.schemaReadiness.mockResolvedValue(checks);
    await expect(service.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it("answers 503 when connected with a different database role than the configured runtime role", async () => {
    process.env.DATABASE_RUNTIME_ROLE = "vista_app_runtime";
    repo.schemaReadiness.mockResolvedValue({ database: true, academicMetadataColumns: true, mediaArchiveColumns: true, runtimeRole: "postgres" });
    await expect(service.ready()).rejects.toMatchObject({ response: { checks: { runtimeRole: false } } });
  });
  it("accepts the pooler's role suffix (role.project-ref)", async () => {
    process.env.DATABASE_RUNTIME_ROLE = "vista_app_runtime";
    repo.schemaReadiness.mockResolvedValue({ database: true, academicMetadataColumns: true, mediaArchiveColumns: true, runtimeRole: "vista_app_runtime.abcdefgh" });
    await expect(service.ready()).resolves.toMatchObject({ status: "ready" });
  });
});
