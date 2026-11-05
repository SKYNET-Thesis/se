import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { QuestionBankController } from './question-bank.controller';
import { QuestionBankService } from './question-bank.service';

const id = '11111111-1111-4111-8111-111111111111';
const user = { vistaUserId: id, status: 'active', systemPermissions: [], memberships: [] };
class Guard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: unknown }>();
    if (req.headers.authorization !== 'Bearer token') throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describe('QuestionBankController HTTP contract', () => {
  let app: INestApplication;
  const bank = {
    createQuestion: jest.fn(), list: jest.fn(), get: jest.fn(), history: jest.fn(), createVersion: jest.fn(),
    updateDraft: jest.fn(), mapObjectives: jest.fn(), submitReview: jest.fn(), publish: jest.fn(), archive: jest.fn(),
    assignmentQuestions: jest.fn(), addToAssignment: jest.fn(), removeFromAssignment: jest.fn(), reorderAssignment: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [QuestionBankController], providers: [{ provide: QuestionBankService, useValue: bank }] }).overrideGuard(SupabaseAuthGuard).useClass(Guard).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => Object.values(bank).forEach((mock) => mock.mockReset()));

  it('requires authentication and does not expose a public question list', async () => {
    await request(app.getHttpServer()).get(`/api/v1/author/question-bank/questions?organizationId=${id}`).expect(401);
    await request(app.getHttpServer()).get('/api/v1/question-bank/questions').expect(404);
  });
  it('validates question options, answer shape and rejects privileged mass assignment', async () => {
    const url = `/api/v1/author/question-bank/questions/${id}/versions`;
    const body = { type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem: 'Question', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answerKey: ['a'] };
    bank.createVersion.mockResolvedValue({ id });
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer token').send({ ...body, status: 'published' }).expect(400);
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer token').send({ ...body, options: [{ id: 'a', text: 'A', isCorrect: true }, body.options[1]] }).expect(400);
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer token').send(body).expect(201);
    expect(bank.createVersion).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid pagination and mapping payloads', async () => {
    await request(app.getHttpServer()).get(`/api/v1/author/question-bank/questions?organizationId=${id}&pageSize=1000`).set('Authorization', 'Bearer token').expect(400);
    await request(app.getHttpServer()).put(`/api/v1/author/question-bank/versions/${id}/objectives`).set('Authorization', 'Bearer token').send({ objectiveIds: [id, id] }).expect(400);
    expect(bank.list).not.toHaveBeenCalled();
    expect(bank.mapObjectives).not.toHaveBeenCalled();
  });
});
