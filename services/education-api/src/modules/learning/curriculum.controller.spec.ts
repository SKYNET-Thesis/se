import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';

const lessonId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const user = { vistaUserId: '33333333-3333-4333-8333-333333333333', status: 'active', systemPermissions: [], memberships: [] };

class Guard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: unknown }>();
    if (req.headers.authorization !== 'Bearer token') throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describe('CurriculumController HTTP contract', () => {
  let app: INestApplication;
  const curriculum = {
    lessonSections: jest.fn(), authorSections: jest.fn(), createSection: jest.fn(), updateSection: jest.fn(),
    reorderSections: jest.fn(), setSectionStatus: jest.fn(), createActivity: jest.fn(),
    updateActivity: jest.fn(), reorderActivities: jest.fn(), setActivityStatus: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CurriculumController], providers: [{ provide: CurriculumService, useValue: curriculum }],
    }).overrideGuard(SupabaseAuthGuard).useClass(Guard).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => Object.values(curriculum).forEach((mock) => mock.mockReset()));

  it('requires authentication for published lesson sections', async () => {
    curriculum.lessonSections.mockResolvedValue({ lessonId, source: 'database', sections: [] });
    await request(app.getHttpServer()).get(`/api/v1/lessons/${lessonId}/sections`).expect(401);
    const response = await request(app.getHttpServer()).get(`/api/v1/lessons/${lessonId}/sections`).set('Authorization', 'Bearer token').expect(200);
    expect(response.body).toEqual({ lessonId, source: 'database', sections: [] });
    expect(curriculum.lessonSections).toHaveBeenCalledWith(user, lessonId);
  });

  it('validates section creation and ordering payloads before authoring', async () => {
    curriculum.createSection.mockResolvedValue({ id: sectionId, title: 'Basics', ordinal: 1, status: 'draft' });
    await request(app.getHttpServer()).post(`/api/v1/author/lessons/${lessonId}/sections`).set('Authorization', 'Bearer token').send({ title: 'Basics', ordinal: 1 }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/author/lessons/${lessonId}/sections`).set('Authorization', 'Bearer token').send({ title: 'Basics', ordinal: 0 }).expect(400);
    await request(app.getHttpServer()).put(`/api/v1/author/lessons/${lessonId}/sections/order`).set('Authorization', 'Bearer token').send({ orderedIds: [sectionId, sectionId] }).expect(400);
    expect(curriculum.createSection).toHaveBeenCalledTimes(1);
    expect(curriculum.reorderSections).not.toHaveBeenCalled();
  });

  it('rejects an unknown activity type and client-supplied PASS', async () => {
    curriculum.createActivity.mockResolvedValue({ id: sectionId, status: 'draft' });
    const url = `/api/v1/author/sections/${sectionId}/activities`;
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer token').send({ title: 'Test', type: 'unknown', ordinal: 1, contentRef: { kind: 'none' } }).expect(400);
    await request(app.getHttpServer()).post(url).set('Authorization', 'Bearer token').send({ title: 'Test', type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'summary' }, passed: true }).expect(400);
    expect(curriculum.createActivity).not.toHaveBeenCalled();
  });
});
