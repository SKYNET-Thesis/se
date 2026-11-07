import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

const courseId = '11111111-1111-4111-8111-111111111111';
const lessonId = '22222222-2222-4222-8222-222222222222';
const user = { vistaUserId: '33333333-3333-4333-8333-333333333333', status: 'active', systemPermissions: [], memberships: [] };

class Guard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: unknown }>();
    if (request.headers.authorization !== 'Bearer token') throw new UnauthorizedException();
    request.user = user;
    return true;
  }
}

describe('LearningController catalog HTTP contract', () => {
  let app: INestApplication;
  const learning = {
    createGlobalCourse: jest.fn(), updateGlobalCourse: jest.fn(), publishCourse: jest.fn(), archiveCourse: jest.fn(),
    createCourseLesson: jest.fn(), updateCourseLesson: jest.fn(), reorderCourseLessons: jest.fn(), setLessonPrerequisites: jest.fn(),
    courses: jest.fn(), course: jest.fn(), lessonsForCourse: jest.fn(), lesson: jest.fn(), enrollments: jest.fn(), classrooms: jest.fn(),
    teachingClassrooms: jest.fn(), myLearning: jest.fn(), classroom: jest.fn(), assignments: jest.fn(), deliveryOptions: jest.fn(),
    assignment: jest.fn(), createAssignment: jest.fn(), publishAssignment: jest.fn(), updateAssignment: jest.fn(), startAttempt: jest.fn(),
    myAttempts: jest.fn(), myAttempt: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [LearningController], providers: [{ provide: LearningService, useValue: learning }],
    }).overrideGuard(SupabaseAuthGuard).useClass(Guard).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => Object.values(learning).forEach((mock) => mock.mockReset()));

  it('exposes lesson reordering at the admin course route with POST', async () => {
    learning.reorderCourseLessons.mockResolvedValue({ courseId, orderedIds: [lessonId] });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/courses/${courseId}/lessons/order`)
      .set('Authorization', 'Bearer token')
      .send({ orderedIds: [lessonId] })
      .expect(201);

    expect(learning.reorderCourseLessons).toHaveBeenCalledWith(user, courseId, [lessonId]);
  });

  it('rejects whitespace-only course and lesson titles before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/courses')
      .set('Authorization', 'Bearer token')
      .send({ title: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/courses/${courseId}/lessons`)
      .set('Authorization', 'Bearer token')
      .send({ title: '   ' })
      .expect(400);

    expect(learning.createGlobalCourse).not.toHaveBeenCalled();
    expect(learning.createCourseLesson).not.toHaveBeenCalled();
  });
});
