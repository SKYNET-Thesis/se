import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { PaginationDto } from "./dto/pagination.dto";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto";
import { LearningScopeService } from "./learning-scope.service";

@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService) {}

  async courses(user: AuthenticatedUser, page: PaginationDto) {
    const classroomIds = await this.scope.classroomIds(user);
    const unrestricted = this.scope.isSystemAdministrator(user);
    const rows = await this.prisma.$queryRaw<CourseRow[]>`
      SELECT DISTINCT c.id,c.title,c.description,c.status,c.created_at,c.updated_at
      FROM public.learning_courses c
      LEFT JOIN public.learning_enrollments e ON e.course_id=c.id AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      LEFT JOIN public.learning_course_offerings o ON o.course_id=c.id
      LEFT JOIN public.learning_classrooms cl ON cl.offering_id=o.id
      LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active'
      LEFT JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active'
      WHERE ${unrestricted} OR e.id IS NOT NULL OR m.id IS NOT NULL
      ORDER BY c.created_at DESC LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}
    `;
    return { items: rows, page: page.page, pageSize: page.pageSize };
  }

  async course(user: AuthenticatedUser, courseId: string) {
    const row = (await this.courses(user, { page: 1, pageSize: 100 })).items.find((item) => item.id === courseId);
    if (!row) throw new NotFoundException("Course was not found.");
    return row;
  }

  async lessonsForCourse(user: AuthenticatedUser, courseId: string) {
    await this.course(user, courseId);
    return this.prisma.$queryRaw`SELECT id,course_id,title,content,ordinal,created_at FROM public.learning_lessons WHERE course_id=${courseId}::uuid ORDER BY ordinal`;
  }

  async lesson(user: AuthenticatedUser, lessonId: string) {
    const rows = await this.prisma.$queryRaw<{ id:string; course_id:string; title:string; content:unknown; ordinal:number; created_at:Date }[]>`SELECT id,course_id,title,content,ordinal,created_at FROM public.learning_lessons WHERE id=${lessonId}::uuid`;
    const lesson = rows[0]; if (!lesson) throw new NotFoundException("Lesson was not found.");
    await this.course(user, lesson.course_id); return lesson;
  }

  async enrollments(user: AuthenticatedUser, page: PaginationDto) {
    return this.prisma.$queryRaw`SELECT id,course_id,offering_id,classroom_id,status,enrolled_at,completed_at FROM public.learning_enrollments WHERE learner_user_id=${user.vistaUserId}::uuid ORDER BY enrolled_at DESC LIMIT ${page.pageSize} OFFSET ${(page.page-1)*page.pageSize}`;
  }

  async classrooms(user: AuthenticatedUser, page: PaginationDto) {
    const ids = await this.scope.classroomIds(user);
    if (this.scope.isSystemAdministrator(user)) return this.prisma.$queryRaw`SELECT id,organization_id,offering_id,name,code,description,capacity,status,created_at,updated_at FROM public.learning_classrooms ORDER BY created_at DESC LIMIT ${page.pageSize} OFFSET ${(page.page-1)*page.pageSize}`;
    if (!ids.length) return { items: [], page: page.page, pageSize: page.pageSize };
    const rows = await this.prisma.$queryRaw`SELECT id,organization_id,offering_id,name,code,description,capacity,status,created_at,updated_at FROM public.learning_classrooms WHERE id = ANY(${ids}::uuid[]) ORDER BY created_at DESC LIMIT ${page.pageSize} OFFSET ${(page.page-1)*page.pageSize}`;
    return { items: rows, page: page.page, pageSize: page.pageSize };
  }

  async classroom(user: AuthenticatedUser, classroomId: string) { await this.scope.assertClassroomAccess(user, classroomId); const rows=await this.prisma.$queryRaw<ClassroomRow[]>`SELECT id,organization_id,offering_id,name,code,description,capacity,status,created_at,updated_at FROM public.learning_classrooms WHERE id=${classroomId}::uuid`; if (!rows[0]) throw new NotFoundException("Classroom was not found."); return rows[0]; }
  async assignments(user: AuthenticatedUser, classroomId: string) {
    await this.classroom(user,classroomId);
    const canManage = await this.scope.canManageClassroom(user, classroomId);
    return this.prisma.$queryRaw`SELECT ca.id,ca.classroom_id,ca.assignment_id,ca.available_from,ca.due_at,ca.close_at,ca.max_attempts,ca.status,a.lesson_id,a.challenge_id,a.title,a.instructions,a.allowed_blocks,a.constraints FROM public.learning_classroom_assignments ca JOIN public.learning_assignments a ON a.id=ca.assignment_id WHERE ca.classroom_id=${classroomId}::uuid AND (${canManage} OR ca.status='published') ORDER BY ca.created_at DESC`;
  }
  async assignment(user: AuthenticatedUser, classroomAssignmentId: string) {
    const rows = await this.prisma.$queryRaw<{ classroom_id: string }[]>`SELECT classroom_id FROM public.learning_classroom_assignments WHERE id=${classroomAssignmentId}::uuid`;
    if (!rows[0]) throw new NotFoundException("Assignment was not found.");
    const classroomId = rows[0].classroom_id;
    await this.classroom(user, classroomId);
    const canManage = await this.scope.canManageClassroom(user, classroomId);
    const assignment = await this.prisma.$queryRaw<Record<string, unknown>[]>`SELECT ca.id,ca.classroom_id,ca.assignment_id,ca.available_from,ca.due_at,ca.close_at,ca.max_attempts,ca.status,a.lesson_id,a.challenge_id,a.title,a.instructions,a.allowed_blocks,a.constraints FROM public.learning_classroom_assignments ca JOIN public.learning_assignments a ON a.id=ca.assignment_id WHERE ca.id=${classroomAssignmentId}::uuid AND (${canManage} OR ca.status='published')`;
    if (!assignment[0]) throw new NotFoundException("Assignment was not found.");
    return assignment[0];
  }
  async createAssignment(user:AuthenticatedUser,classroomId:string,dto:CreateAssignmentDto) { await this.scope.assertTeacherClassroomAccess(user,classroomId); const rows=await this.prisma.$queryRaw<{id:string}[]>`SELECT l.id FROM public.learning_lessons l JOIN public.learning_course_offerings o ON o.course_id=l.course_id JOIN public.learning_classrooms c ON c.offering_id=o.id WHERE l.id=${dto.lessonId}::uuid AND c.id=${classroomId}::uuid`; if(!rows[0]) throw new NotFoundException("Lesson was not found."); const a=await this.prisma.$queryRaw<{id:string}[]>`INSERT INTO public.learning_assignments(lesson_id,challenge_id,title,instructions) VALUES(${dto.lessonId}::uuid,${dto.challengeId??null}::uuid,${dto.title},${dto.instructions??""}) RETURNING id`; return this.prisma.$queryRaw`INSERT INTO public.learning_classroom_assignments(classroom_id,assignment_id,published_by,status) VALUES(${classroomId}::uuid,${a[0].id}::uuid,${user.vistaUserId}::uuid,'published') RETURNING id,classroom_id,assignment_id,status` }
  async updateAssignment(user:AuthenticatedUser,classroomId:string,assignmentId:string,dto:UpdateAssignmentDto) { await this.scope.assertTeacherClassroomAccess(user,classroomId); const ok=await this.prisma.$queryRaw<{id:string}[]>`SELECT id FROM public.learning_classroom_assignments WHERE classroom_id=${classroomId}::uuid AND assignment_id=${assignmentId}::uuid`; if(!ok[0]) throw new NotFoundException("Assignment was not found."); return this.prisma.learning_assignments.update({where:{id:assignmentId},data:{...(dto.title!==undefined?{title:dto.title}:{}),...(dto.instructions!==undefined?{instructions:dto.instructions}:{})}}); }
  async startAttempt(user:AuthenticatedUser,classroomAssignmentId:string) {
    const assignment = await this.prisma.$queryRaw<{ classroom_id:string; max_attempts:number|null }[]>`
      SELECT classroom_id,max_attempts FROM public.learning_classroom_assignments
      WHERE id=${classroomAssignmentId}::uuid AND status='published'
        AND (available_from IS NULL OR available_from<=now())
        AND (close_at IS NULL OR close_at>now())`;
    if (!assignment[0]) throw new NotFoundException("Assignment was not found.");
    await this.scope.assertStudentClassroomAccess(user, assignment[0].classroom_id);
    return this.prisma.$transaction(async (tx) => {
      // Serializes attempt-number allocation per learner/assignment and avoids a
      // MAX()+1 uniqueness race without changing the existing schema.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${classroomAssignmentId}:${user.vistaUserId}`}))`;
      const rows = await tx.$queryRaw<{ n:number; existing:number }[]>`
        SELECT COALESCE(MAX(attempt_number),0)+1 AS n, COUNT(*)::int AS existing
        FROM public.learning_assignment_attempts
        WHERE classroom_assignment_id=${classroomAssignmentId}::uuid AND learner_user_id=${user.vistaUserId}::uuid`;
      const next = rows[0];
      if (!next || (assignment[0].max_attempts !== null && next.existing >= assignment[0].max_attempts)) {
        throw new NotFoundException("Assignment was not found.");
      }
      const created = await tx.$queryRaw<{ id: string; classroom_assignment_id: string; learner_user_id: string; attempt_number: number; status: string; started_at: Date }[]>`INSERT INTO public.learning_assignment_attempts(classroom_assignment_id,learner_user_id,attempt_number)
        VALUES(${classroomAssignmentId}::uuid,${user.vistaUserId}::uuid,${next.n})
        RETURNING id,classroom_assignment_id,learner_user_id,attempt_number,status,started_at`;
      return created[0];
    });
  }
  async myAttempts(user:AuthenticatedUser){return this.prisma.$queryRaw`SELECT id,classroom_assignment_id,attempt_number,status,started_at,submitted_at FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid ORDER BY started_at DESC`;}
  async myAttempt(user:AuthenticatedUser,id:string){const r=await this.prisma.$queryRaw<Record<string,unknown>[]>`SELECT id,classroom_assignment_id,attempt_number,status,workspace_snapshot,program_snapshot,result_snapshot,started_at,submitted_at FROM public.learning_assignment_attempts WHERE id=${id}::uuid AND learner_user_id=${user.vistaUserId}::uuid`;if(!r[0])throw new NotFoundException("Attempt was not found.");return r[0];}
  async assignmentTitleForAttempt(user:AuthenticatedUser,id:string){await this.myAttempt(user,id);const r=await this.prisma.$queryRaw<{title:string}[]>`SELECT a.title FROM public.learning_assignment_attempts at JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id JOIN public.learning_assignments a ON a.id=ca.assignment_id WHERE at.id=${id}::uuid AND at.learner_user_id=${user.vistaUserId}::uuid`;return r[0]?.title??null;}
}
export interface CourseRow { id:string; title:string; description:string|null; status:string; created_at:Date; updated_at:Date; }
export interface ClassroomRow { id:string; organization_id:string; offering_id:string; name:string; code:string; description:string|null; capacity:number|null; status:string; created_at:Date; updated_at:Date; }
