import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { ExperimentController } from "./experiment.controller";
import { ExperimentService } from "./experiment.service";
import { ProgrammingController } from "./programming.controller";
import { ProgrammingService } from "./programming.service";
import { SymbolicEvaluationService } from "./symbolic-rules/symbolic-evaluation.service";

const user = { authUserId: "auth-1", vistaUserId: "user-1", email: "learner@vista.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [{ id: "m-1", organizationId: "org-1", roleCode: "student", status: "active", permissions: ["learning.work.write", "learning.experiment.execute"] }] };
class FixtureSupabaseGuard implements CanActivate {
  canActivate(context: ExecutionContext) { const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: unknown }>(); if (request.headers.authorization !== "Bearer fixture-supabase-access-token") throw new UnauthorizedException("Invalid or expired Supabase access token."); request.user = user; return true; }
}
const id = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const experimentId = "33333333-3333-4333-8333-333333333333";

describe("Learner mutation HTTP contract", () => {
  let app: INestApplication;
  const programming = { createProgram: jest.fn(), createVersion: jest.fn(), submit: jest.fn() };
  const experiments = { create: jest.fn(), runSchematic: jest.fn(), result: jest.fn() };
  const symbolicEvaluations = { evaluateOwnExperiment: jest.fn(), own: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProgrammingController, ExperimentController], providers: [{ provide: ProgrammingService, useValue: programming }, { provide: ExperimentService, useValue: experiments }, { provide: SymbolicEvaluationService, useValue: symbolicEvaluations }] }).overrideGuard(SupabaseAuthGuard).useClass(FixtureSupabaseGuard).compile();
    app = module.createNestApplication(); app.setGlobalPrefix("api/v1"); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => { Object.values(programming).forEach((mock) => mock.mockReset()); Object.values(experiments).forEach((mock) => mock.mockReset()); Object.values(symbolicEvaluations).forEach((mock) => mock.mockReset()); });
  const authed = () => ({ Authorization: "Bearer fixture-supabase-access-token" });
  const program = { kind: "robot_program", schemaVersion: 1, steps: [{ type: "arm.select", arm: "left" }, { type: "gripper.open" }] };

  it("routes the authorized attempt → draft → version → submission → experiment → result chain", async () => {
    programming.createProgram.mockResolvedValue({ id }); programming.createVersion.mockResolvedValue({ id: versionId, version_number: 1 }); programming.submit.mockResolvedValue({ id: "submission-1", program_version_id: versionId }); experiments.create.mockResolvedValue({ id: experimentId, status: "pending", execution_mode: "schematic" }); experiments.runSchematic.mockResolvedValue({ engineVersion: "vista-schematic-1" }); experiments.result.mockResolvedValue([{ output_snapshot: { engineVersion: "vista-schematic-1", timeline: [] } }]);
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${id}/program`).set(authed()).send({ title: "Draft", workspaceJson: {}, robotProgram: program }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/me/programs/${id}/versions`).set(authed()).send({ changeSummary: "first version" }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${id}/submission`).set(authed()).send({ programVersionId: versionId }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${id}/experiments`).set(authed()).send({ programVersionId: versionId, executionMode: "schematic" }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/me/experiments/${experimentId}/run-schematic`).set(authed()).expect(201);
    await request(app.getHttpServer()).get(`/api/v1/me/experiments/${experimentId}/result`).set(authed()).expect(200);
    expect(programming.submit).toHaveBeenCalledWith(user, id, { programVersionId: versionId });
    expect(experiments.create).toHaveBeenCalledWith(user, id, { programVersionId: versionId, executionMode: "schematic" });
  });

  it("rejects missing authentication and malformed experiment/version input before mutation", async () => {
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${id}/program`).send({}).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${id}/submission`).set(authed()).send({ programVersionId: "not-a-uuid" }).expect(400);
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${id}/experiments`).set(authed()).send({ programVersionId: versionId, executionMode: "simulation" }).expect(400);
    await request(app.getHttpServer()).post("/api/v1/me/experiments/not-a-uuid/evaluate-symbolic").set(authed()).expect(400);
  });

  it("routes persisted symbolic evaluation only for the authenticated learner", async () => {
    symbolicEvaluations.evaluateOwnExperiment.mockResolvedValue({ id: "evaluation-1", experimentId, verdict: "passed", ruleResults: [], metrics: {} });
    symbolicEvaluations.own.mockResolvedValue({ id: "evaluation-1", experimentId, verdict: "passed", ruleResults: [], metrics: {} });
    await request(app.getHttpServer()).post(`/api/v1/me/experiments/${experimentId}/evaluate-symbolic`).set(authed()).expect(201);
    await request(app.getHttpServer()).get(`/api/v1/me/symbolic-evaluations/${id}`).set(authed()).expect(200);
    expect(symbolicEvaluations.evaluateOwnExperiment).toHaveBeenCalledWith(user, experimentId);
    expect(symbolicEvaluations.own).toHaveBeenCalledWith(user, id);
  });
});
