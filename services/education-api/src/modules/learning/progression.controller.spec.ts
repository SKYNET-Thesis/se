import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { ProgressionController } from "./progression.controller";
import { ProgressionService } from "./progression.service";
import { ActivityProgressService } from './activity-progress.service';

const user = { authUserId: "auth-1", vistaUserId: "user-1", email: "learner@vista.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [] };
class Guard implements CanActivate { canActivate(context: ExecutionContext) { const req = context.switchToHttp().getRequest<{ headers:{authorization?:string};user?:unknown }>(); if (req.headers.authorization !== "Bearer token") throw new UnauthorizedException(); req.user = user; return true; } }
const uuid = "11111111-1111-4111-8111-111111111111";

describe("ProgressionController HTTP contract", () => {
  let app: INestApplication;
  const progression = {
    coursePath: jest.fn(),
    myQuizzes: jest.fn(),
    submitKnowledgeCheck: jest.fn(),
    resolveQualifiedL4ProgramVersion: jest.fn(),
  };
  const activityProgress = { courseProgress: jest.fn(), completeSelfReport: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProgressionController], providers: [{ provide: ProgressionService, useValue: progression }, { provide: ActivityProgressService, useValue: activityProgress }] }).overrideGuard(SupabaseAuthGuard).useClass(Guard).compile();
    app = module.createNestApplication(); app.setGlobalPrefix("api/v1"); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    progression.coursePath.mockReset();
    progression.myQuizzes.mockReset();
    progression.submitKnowledgeCheck.mockReset();
    progression.resolveQualifiedL4ProgramVersion.mockReset();
    activityProgress.courseProgress.mockReset();
    activityProgress.completeSelfReport.mockReset();
  });

  it('reads only the authenticated learner activity progress for an enrolled course', async () => {
    activityProgress.courseProgress.mockResolvedValue({ courseId: uuid, activities: [] });
    await request(app.getHttpServer()).get(`/api/v1/me/courses/${uuid}/activity-progress`).expect(401);
    const res = await request(app.getHttpServer()).get(`/api/v1/me/courses/${uuid}/activity-progress`).set('Authorization', 'Bearer token').expect(200);
    expect(res.body).toEqual({ courseId: uuid, activities: [] });
    expect(activityProgress.courseProgress).toHaveBeenCalledWith(user, uuid);
  });

  it('accepts only a bodyless self-completion request', async () => {
    const activityId = `${uuid}-reading-1`;
    activityProgress.completeSelfReport.mockResolvedValue({ activityId, status: 'completed', completedAt: new Date('2026-11-03T10:00:00Z') });
    await request(app.getHttpServer()).post(`/api/v1/me/activities/${activityId}/complete`).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/me/activities/${activityId}/complete`).set('Authorization', 'Bearer token').send({ passed: true }).expect(400);
    const res = await request(app.getHttpServer()).post(`/api/v1/me/activities/${activityId}/complete`).set('Authorization', 'Bearer token').expect(201);
    expect(res.body).toMatchObject({ activityId, status: 'completed' });
    expect(activityProgress.completeSelfReport).toHaveBeenCalledTimes(1);
    expect(activityProgress.completeSelfReport).toHaveBeenCalledWith(user, activityId);
  });

  it("routes authenticated quizzes read", async () => {
    progression.myQuizzes.mockResolvedValue([{ quiz_title: "Safety Knowledge Check", status: "passed", score: 100 }]);
    const res = await request(app.getHttpServer()).get(`/api/v1/me/quizzes`).set("Authorization", "Bearer token").expect(200);
    expect(res.body).toEqual([{ quiz_title: "Safety Knowledge Check", status: "passed", score: 100 }]);
    expect(progression.myQuizzes).toHaveBeenCalledWith(user);
  });

  it("routes authenticated course path reads", async () => {
    progression.coursePath.mockResolvedValue({ course: { id: uuid, title: "Robotics Fundamentals" }, progressPercent: 0, currentLessonId: "lesson-1", lessons: [] });
    await request(app.getHttpServer()).get(`/api/v1/me/courses/${uuid}/path`).set("Authorization", "Bearer token").expect(200);
    expect(progression.coursePath).toHaveBeenCalledWith(user, uuid);
  });

  it("validates knowledge-check answers and never accepts a client PASS field", async () => {
    progression.submitKnowledgeCheck.mockResolvedValue({ passed: true, score: 100 });
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${uuid}/knowledge-check`).set("Authorization", "Bearer token").send({ answers: [{ questionId: "safety", optionId: "stop" }] }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/me/attempts/${uuid}/knowledge-check`).set("Authorization", "Bearer token").send({ answers: [], passed: true }).expect(400);
    expect(progression.submitKnowledgeCheck).toHaveBeenCalledTimes(1);
  });

  it('accepts multiple-choice selections and rejects client score, PASS and answer keys', async () => {
    const endpoint = `/api/v1/me/attempts/${uuid}/knowledge-check`;
    progression.submitKnowledgeCheck.mockResolvedValue({ score: 100, passed: true });
    await request(app.getHttpServer()).post(endpoint).set('Authorization', 'Bearer token').send({ answers: [{ questionId: uuid, optionIds: ['a', 'b'] }] }).expect(201);
    await request(app.getHttpServer()).post(endpoint).set('Authorization', 'Bearer token').send({ answers: [{ questionId: uuid, optionIds: ['a', 'b'], answerKey: ['a'] }] }).expect(400);
    await request(app.getHttpServer()).post(endpoint).set('Authorization', 'Bearer token').send({ answers: [{ questionId: uuid, optionIds: ['a', 'b'] }], score: 100, passed: true }).expect(400);
    expect(progression.submitKnowledgeCheck).toHaveBeenCalledTimes(1);
  });

  it("resolves qualified C1-L4 program version for authenticated learner", async () => {
    progression.resolveQualifiedL4ProgramVersion = jest.fn().mockResolvedValue({
      courseId: uuid,
      lessonId: "lesson-4",
      qualifiedProgramVersionId: "pv-4-2",
      programVersionId: "pv-4-2",
      programId: "prog-4",
      versionNumber: 2,
      challengeId: "chal-4",
      symbolicEvaluationId: "eval-4-2",
      evaluationId: "eval-4-2",
      schematicExperimentId: "exp-4-2",
      experimentId: "exp-4-2",
      verdict: "passed",
      attemptId: "att-4",
      passedAt: new Date("2026-10-31T12:00:00Z"),
      qualifiedAt: new Date("2026-10-31T12:00:00Z"),
      changeSummary: "Corrected trajectory",
    });
    const res = await request(app.getHttpServer())
      .get(`/api/v1/me/courses/${uuid}/qualification/c1-l4`)
      .set("Authorization", "Bearer token")
      .expect(200);
    expect(res.body.qualifiedProgramVersionId).toBe("pv-4-2");
    expect(res.body.versionNumber).toBe(2);
    expect(res.body.verdict).toBe("passed");
    expect(progression.resolveQualifiedL4ProgramVersion).toHaveBeenCalledWith(user, uuid);
  });

  it("returns 404 when no qualified version exists for C1-L4", async () => {
    progression.resolveQualifiedL4ProgramVersion = jest.fn().mockResolvedValue(null);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/me/courses/${uuid}/qualification/c1-l4`)
      .set("Authorization", "Bearer token")
      .expect(404);
    expect(res.body.code).toBe("QUALIFIED_VERSION_NOT_FOUND");
    expect(res.body.message).toContain("No qualified ProgramVersion found");
  });

  it("rejects unauthenticated and malformed UUID requests before service mutation", async () => {
    await request(app.getHttpServer()).get(`/api/v1/me/courses/${uuid}/path`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/me/courses/${uuid}/qualification/c1-l4`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/me/courses/not-a-uuid/qualification/c1-l4`).set("Authorization", "Bearer token").expect(400);
    await request(app.getHttpServer()).post("/api/v1/me/attempts/not-a-uuid/knowledge-check").set("Authorization", "Bearer token").send({ answers: [{ questionId: "safety", optionId: "stop" }] }).expect(400);
    expect(progression.submitKnowledgeCheck).not.toHaveBeenCalled();
  });
});
