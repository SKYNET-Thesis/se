import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { PaginationDto } from "./dto/pagination.dto";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto";
import { LearningScopeService } from "./learning-scope.service";
import { ProgressionService } from "./progression.service";
import { normalizeLessonContent } from "./lesson-content.schema";

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: LearningScopeService,
    private readonly progression?: ProgressionService,
  ) {}

  async courses(user: AuthenticatedUser, page: PaginationDto) {
    const unrestricted = this.scope.isSystemAdministrator(user);
    const rows = await this.prisma.$queryRaw<CourseRow[]>`
      SELECT DISTINCT c.id,c.title,c.description,c.status,c.created_at,c.updated_at
      FROM public.learning_courses c
      WHERE ${unrestricted} OR EXISTS (
        SELECT 1 FROM public.learning_enrollments e
        JOIN public.learning_course_offerings o ON o.id=e.offering_id AND o.course_id=c.id AND o.status='active'
        JOIN public.learning_classrooms cl ON cl.id=e.classroom_id AND cl.offering_id=o.id AND cl.status='active'
        JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id AND cm.user_id=e.learner_user_id
          AND cm.classroom_role='student' AND cm.status='active'
        JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=e.learner_user_id
          AND m.organization_id=cl.organization_id AND m.status='active'
        WHERE e.course_id=c.id AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      )
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
    const rows = await this.prisma.$queryRaw<{ id:string; course_id:string; title:string; content:unknown; ordinal:number; created_at:Date }[]>`
      SELECT id,course_id,title,content,ordinal,created_at FROM public.learning_lessons WHERE id=${lessonId}::uuid`;
    const lesson = rows[0]; if (!lesson) throw new NotFoundException("Lesson was not found.");
    const course = await this.course(user, lesson.course_id);

    const path = this.progression && !this.scope.isSystemAdministrator(user)
      ? await this.progression.coursePath(user, lesson.course_id)
      : null;
    const progressionLesson = path?.lessons.find((l) => l.id === lesson.id) ?? null;
    if (path && !progressionLesson) throw new NotFoundException("Lesson was not found in the authoritative course path.");
    if (progressionLesson?.status === "locked") {
      throw new ConflictException(progressionLesson.lockReason ?? "Lesson prerequisites are not satisfied.");
    }

    const objectives = await this.prisma.$queryRaw<Array<{ code: string; description: string; competency_code: string | null; competency_title: string | null }>>`
      SELECT o.code, o.description, c.code AS competency_code, c.title AS competency_title
      FROM public.learning_objectives o
      LEFT JOIN public.learning_objective_competencies oc ON oc.objective_id=o.id
      LEFT JOIN public.learning_competencies c ON c.id=oc.competency_id
      WHERE o.lesson_id=${lesson.id}::uuid
      ORDER BY o.ordinal`;

    const assignments = await this.prisma.$queryRaw<Array<{
      assignment_id: string;
      classroom_assignment_id: string;
      title: string;
      instructions: string;
      allowed_blocks: string[];
      constraints: unknown;
      challenge_title: string | null;
      challenge_description: string | null;
    }>>`
      SELECT a.id AS assignment_id, ca.id AS classroom_assignment_id, a.title, a.instructions, a.allowed_blocks, a.constraints,
             ch.title AS challenge_title, ch.description AS challenge_description
      FROM public.learning_assignments a
      JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id
      JOIN public.learning_classrooms cl ON cl.id=ca.classroom_id
      JOIN public.learning_course_offerings offering ON offering.id=cl.offering_id
        AND offering.course_id=${lesson.course_id}::uuid AND offering.status='active'
      JOIN public.learning_enrollments enrollment ON enrollment.course_id=${lesson.course_id}::uuid
        AND enrollment.offering_id=offering.id AND enrollment.classroom_id=cl.id
        AND enrollment.learner_user_id=${user.vistaUserId}::uuid AND enrollment.status='active'
      JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id AND cm.user_id=${user.vistaUserId}::uuid AND cm.status='active'
      LEFT JOIN public.learning_challenges ch ON ch.id=a.challenge_id
      WHERE a.lesson_id=${lesson.id}::uuid AND ca.status='published'
      ORDER BY ca.created_at DESC LIMIT 1`;

    const assignment = assignments[0] ?? null;

    let activeAttempt: { id: string; status: string; score: number | null } | null = null;
    let priorAttempt: { id: string; status: string; score: number | null; submitted_at: Date | null } | null = null;

    if (assignment) {
      const attempts = await this.prisma.$queryRaw<Array<{ id: string; status: string; score: number | null; submitted_at: Date | null }>>`
        SELECT id, status, score, submitted_at
        FROM public.learning_assignment_attempts
        WHERE classroom_assignment_id=${assignment.classroom_assignment_id}::uuid AND learner_user_id=${user.vistaUserId}::uuid
        ORDER BY attempt_number DESC`;
      const inProgress = attempts.find((att) => att.status === "in_progress");
      activeAttempt = inProgress ? { id: inProgress.id, status: inProgress.status, score: inProgress.score } : null;
      const evaluated = attempts.find((att) => att.status === "evaluated" || att.status === "submitted");
      priorAttempt = evaluated ? { id: evaluated.id, status: evaluated.status, score: evaluated.score, submitted_at: evaluated.submitted_at } : null;
    }

    const validatedContent = normalizeLessonContent(lesson.content, lesson.title, lesson.ordinal);

    let qualification: {
      lessonId: string;
      evaluationId: string;
      experimentId: string;
      programVersionId: string;
      versionNumber: number;
      attemptId: string;
      passedAt: Date;
    } | null = null;
    if (lesson.ordinal === 5 && this.progression) {
      qualification = await this.progression.resolveQualifiedL4ProgramVersion(user, lesson.course_id).catch(() => null);
    }

    return {
      id: lesson.id,
      course_id: lesson.course_id,
      course_title: (course as { title?: string }).title ?? "Course",
      title: lesson.title,
      ordinal: lesson.ordinal,
      content: validatedContent,
      objectives: objectives.map((obj) => ({
        code: obj.code,
        description: obj.description,
        competencyCode: obj.competency_code,
        competencyTitle: obj.competency_title,
      })),
      status: progressionLesson?.status ?? "available",
      progressPercent: progressionLesson?.progressPercent ?? 0,
      lockReason: progressionLesson?.lockReason ?? null,
      prerequisites: progressionLesson?.prerequisite ?? [],
      qualification,
      assignment: assignment ? {
        id: assignment.assignment_id,
        classroomAssignmentId: assignment.classroom_assignment_id,
        title: assignment.title,
        instructions: assignment.instructions,
        allowedBlocks: assignment.allowed_blocks ?? [],
        constraints: assignment.constraints,
        challengeTitle: assignment.challenge_title,
        challengeDescription: assignment.challenge_description,
      } : null,
      activeAttempt,
      priorAttempt,
      created_at: lesson.created_at,
    };
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

  /** Classroom teaching scope; unlike /me/classrooms this never includes a learner membership. */
  async teachingClassrooms(user: AuthenticatedUser) {
    if (this.scope.isSystemAdministrator(user)) {
      return this.prisma.$queryRaw`SELECT c.id,c.organization_id,c.name,c.code,c.status,o.name AS organization_name,COUNT(DISTINCT cm.id) FILTER (WHERE cm.status='active' AND cm.classroom_role='student')::int AS student_count,COUNT(DISTINCT ca.id)::int AS assignment_count FROM public.learning_classrooms c JOIN public.organizations o ON o.id=c.organization_id LEFT JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id LEFT JOIN public.learning_classroom_assignments ca ON ca.classroom_id=c.id GROUP BY c.id,o.name ORDER BY c.name`;
    }
    return this.prisma.$queryRaw`
      SELECT c.id,c.organization_id,c.name,c.code,c.status,o.name AS organization_name,
        COUNT(DISTINCT students.id) FILTER (WHERE students.status='active' AND students.classroom_role='student')::int AS student_count,
        COUNT(DISTINCT ca.id)::int AS assignment_count
      FROM public.learning_classroom_members mine
      JOIN public.memberships m ON m.id=mine.membership_id AND m.status='active'
      JOIN public.learning_classrooms c ON c.id=mine.classroom_id AND c.organization_id=m.organization_id
      JOIN public.organizations o ON o.id=c.organization_id
      LEFT JOIN public.learning_classroom_members students ON students.classroom_id=c.id
      LEFT JOIN public.learning_classroom_assignments ca ON ca.classroom_id=c.id
      WHERE mine.user_id=${user.vistaUserId}::uuid AND mine.status='active'
        AND mine.classroom_role IN ('teacher','teaching_assistant')
        AND EXISTS (SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=m.role_id AND p.code='learning.delivery.manage')
      GROUP BY c.id,o.name ORDER BY c.name`;
  }

  async myLearning(user: AuthenticatedUser) {
    return this.prisma.$queryRaw`
      SELECT ca.id AS classroom_assignment_id,a.title,a.instructions,l.id AS lesson_id,l.title AS lesson_title,
        c.id AS classroom_id,c.name AS classroom_name,co.title AS course_title,
        latest.id AS attempt_id,latest.status AS attempt_status,latest.started_at,latest.submitted_at,
        CASE WHEN latest.submitted_at IS NOT NULL THEN 'completed' WHEN latest.id IS NOT NULL THEN 'started' ELSE 'assigned' END AS learning_status
      FROM public.learning_classroom_assignments ca
      JOIN public.learning_assignments a ON a.id=ca.assignment_id
      JOIN public.learning_lessons l ON l.id=a.lesson_id
      JOIN public.learning_classrooms c ON c.id=ca.classroom_id
      JOIN public.learning_course_offerings o ON o.id=c.offering_id
      JOIN public.learning_courses co ON co.id=o.course_id
      JOIN public.learning_enrollments e ON e.course_id=co.id AND e.offering_id=o.id AND e.classroom_id=c.id
        AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id AND cm.user_id=${user.vistaUserId}::uuid AND cm.classroom_role='student' AND cm.status='active'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active' AND m.organization_id=c.organization_id
      LEFT JOIN LATERAL (SELECT id,status,started_at,submitted_at FROM public.learning_assignment_attempts WHERE classroom_assignment_id=ca.id AND learner_user_id=${user.vistaUserId}::uuid ORDER BY started_at DESC LIMIT 1) latest ON true
      WHERE ca.status='published' AND (ca.available_from IS NULL OR ca.available_from<=now()) AND (ca.close_at IS NULL OR ca.close_at>now())
      ORDER BY ca.created_at DESC`;
  }

  async classroom(user: AuthenticatedUser, classroomId: string) { await this.scope.assertClassroomAccess(user, classroomId); const rows=await this.prisma.$queryRaw<ClassroomRow[]>`SELECT c.id,c.organization_id,c.offering_id,c.name,c.code,c.description,c.capacity,c.status,c.created_at,c.updated_at,CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'name',r.name,'serialNo',r.serial_no,'modelName',r.model_name) END AS allocated_robot FROM public.learning_classrooms c LEFT JOIN public.learning_classroom_robot_allocations ar ON ar.classroom_id=c.id LEFT JOIN public.robots r ON r.id=ar.robot_id WHERE c.id=${classroomId}::uuid`; if (!rows[0]) throw new NotFoundException("Classroom was not found."); return rows[0]; }
  async assignments(user: AuthenticatedUser, classroomId: string) {
    await this.classroom(user,classroomId);
    const canManage = await this.scope.canManageClassroom(user, classroomId);
    return this.prisma.$queryRaw`SELECT ca.id,ca.classroom_id,ca.assignment_id,ca.available_from,ca.due_at,ca.close_at,ca.max_attempts,ca.status,ca.published_by,a.lesson_id,l.title AS lesson_title,a.challenge_id,ch.title AS challenge_title,a.title,a.instructions,a.allowed_blocks,a.constraints FROM public.learning_classroom_assignments ca JOIN public.learning_assignments a ON a.id=ca.assignment_id JOIN public.learning_lessons l ON l.id=a.lesson_id LEFT JOIN public.learning_challenges ch ON ch.id=a.challenge_id WHERE ca.classroom_id=${classroomId}::uuid AND (${canManage} OR ca.status='published') ORDER BY ca.created_at DESC`;
  }
  async assignment(user: AuthenticatedUser, classroomAssignmentId: string) {
    const rows = await this.prisma.$queryRaw<{ classroom_id: string }[]>`SELECT classroom_id FROM public.learning_classroom_assignments WHERE id=${classroomAssignmentId}::uuid`;
    if (!rows[0]) throw new NotFoundException("Assignment was not found.");
    const classroomId = rows[0].classroom_id;
    await this.classroom(user, classroomId);
    const canManage = await this.scope.canManageClassroom(user, classroomId);
    const assignment = await this.prisma.$queryRaw<Record<string, unknown>[]>`SELECT ca.id,ca.classroom_id,ca.assignment_id,ca.available_from,ca.due_at,ca.close_at,ca.max_attempts,ca.status,a.lesson_id,l.title AS lesson_title,a.challenge_id,ch.title AS challenge_title,a.title,a.instructions,a.allowed_blocks,a.constraints FROM public.learning_classroom_assignments ca JOIN public.learning_assignments a ON a.id=ca.assignment_id JOIN public.learning_lessons l ON l.id=a.lesson_id LEFT JOIN public.learning_challenges ch ON ch.id=a.challenge_id WHERE ca.id=${classroomAssignmentId}::uuid AND (${canManage} OR ca.status='published')`;
    if (!assignment[0]) throw new NotFoundException("Assignment was not found.");
    return assignment[0];
  }
  async deliveryOptions(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomAccess(user, classroomId);
    return this.prisma.$queryRaw`
      SELECT co.id AS course_id,co.title AS course_title,l.id AS lesson_id,l.title AS lesson_title,
        COALESCE(template.title,l.title) AS title,COALESCE(template.instructions,'') AS instructions,template.challenge_id,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id',ch.id,'title',ch.title) ORDER BY ch.title)
          FROM public.learning_challenges ch
          WHERE ch.status='published'
            AND (ch.organization_id IS NULL OR ch.organization_id=c.organization_id)
            AND 'blockly'=ANY(ch.permitted_modes)
            AND EXISTS (
              SELECT 1 FROM public.learning_challenge_conditions cc
              WHERE cc.challenge_id=ch.id AND cc.condition_type='success'
            )
        ),'[]'::jsonb) AS challenges
      FROM public.learning_classrooms c
      JOIN public.learning_course_offerings o ON o.id=c.offering_id
      JOIN public.learning_courses co ON co.id=o.course_id
      JOIN public.learning_lessons l ON l.course_id=o.course_id
      LEFT JOIN LATERAL (
        SELECT a.title,a.instructions,a.challenge_id FROM public.learning_assignments a
        JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id
        JOIN public.learning_classrooms source ON source.id=ca.classroom_id
        WHERE a.lesson_id=l.id AND source.organization_id=c.organization_id
        ORDER BY ca.created_at DESC LIMIT 1
      ) template ON true
      WHERE c.id=${classroomId}::uuid ORDER BY l.ordinal`;
  }
  async createAssignment(user:AuthenticatedUser,classroomId:string,dto:CreateAssignmentDto) {
    await this.scope.assertTeacherClassroomAccess(user,classroomId);
    const lessons=await this.prisma.$queryRaw<{id:string;organization_id:string}[]>`
      SELECT l.id,c.organization_id
      FROM public.learning_lessons l
      JOIN public.learning_course_offerings o ON o.course_id=l.course_id
      JOIN public.learning_classrooms c ON c.offering_id=o.id
      WHERE l.id=${dto.lessonId}::uuid AND c.id=${classroomId}::uuid`;
    if(!lessons[0]) throw new NotFoundException("Lesson was not found.");
    if(dto.challengeId){
      const challenges=await this.prisma.$queryRaw<{id:string}[]>`
        SELECT ch.id
        FROM public.learning_challenges ch
        WHERE ch.id=${dto.challengeId}::uuid AND ch.status='published'
          AND (ch.organization_id IS NULL OR ch.organization_id=${lessons[0].organization_id}::uuid)
          AND 'blockly'=ANY(ch.permitted_modes)
          AND EXISTS (
            SELECT 1 FROM public.learning_challenge_conditions cc
            WHERE cc.challenge_id=ch.id AND cc.condition_type='success'
          )`;
      if(!challenges[0]) throw new NotFoundException("Challenge was not found.");
    }
    return this.prisma.$transaction(async(tx)=>{
      const assignments=await tx.$queryRaw<{id:string}[]>`
        INSERT INTO public.learning_assignments(lesson_id,challenge_id,title,instructions)
        VALUES(${dto.lessonId}::uuid,${dto.challengeId??null}::uuid,${dto.title},${dto.instructions??""}) RETURNING id`;
      const deliveries=await tx.$queryRaw<Record<string,unknown>[]>`
        INSERT INTO public.learning_classroom_assignments(classroom_id,assignment_id,status)
        VALUES(${classroomId}::uuid,${assignments[0].id}::uuid,'draft')
        RETURNING id,classroom_id,assignment_id,status,published_by,available_from,due_at,close_at,max_attempts`;
      return deliveries[0];
    });
  }

  async publishAssignment(user:AuthenticatedUser,classroomId:string,assignmentId:string){
    await this.scope.assertTeacherClassroomAccess(user,classroomId);
    return this.prisma.$transaction(async(tx)=>{
      const deliveries=await tx.$queryRaw<{id:string;status:string}[]>`
        SELECT id,status FROM public.learning_classroom_assignments
        WHERE classroom_id=${classroomId}::uuid AND assignment_id=${assignmentId}::uuid
        FOR UPDATE`;
      const delivery=deliveries[0];
      if(!delivery) throw new NotFoundException("Assignment was not found.");
      if(delivery.status==='closed'||delivery.status==='archived'){
        throw new ConflictException("Assignment cannot be published from its current state.");
      }
      if(delivery.status==='draft'){
        await tx.$queryRaw`
          UPDATE public.learning_classroom_assignments
          SET status='published',published_by=${user.vistaUserId}::uuid
          WHERE id=${delivery.id}::uuid`;
      }
      const current=await tx.$queryRaw<Record<string,unknown>[]>`
        SELECT ca.id,ca.classroom_id,ca.assignment_id,ca.available_from,ca.due_at,ca.close_at,ca.max_attempts,ca.status,ca.published_by,
          a.lesson_id,l.title AS lesson_title,a.challenge_id,ch.title AS challenge_title,a.title,a.instructions,a.allowed_blocks,a.constraints
        FROM public.learning_classroom_assignments ca
        JOIN public.learning_assignments a ON a.id=ca.assignment_id
        JOIN public.learning_lessons l ON l.id=a.lesson_id
        LEFT JOIN public.learning_challenges ch ON ch.id=a.challenge_id
        WHERE ca.id=${delivery.id}::uuid`;
      return current[0];
    });
  }
  async updateAssignment(user:AuthenticatedUser,classroomId:string,assignmentId:string,dto:UpdateAssignmentDto) {
    const deliveries=await this.prisma.$queryRaw<{classroom_id:string}[]>`SELECT classroom_id FROM public.learning_classroom_assignments WHERE assignment_id=${assignmentId}::uuid`;
    const classroomIds=[...new Set(deliveries.map((delivery)=>delivery.classroom_id))];
    if(!classroomIds.includes(classroomId)) throw new NotFoundException("Assignment was not found.");
    for(const deliveryClassroomId of classroomIds) await this.scope.assertTeacherClassroomAccess(user,deliveryClassroomId);
    return this.prisma.learning_assignments.update({where:{id:assignmentId},data:{...(dto.title!==undefined?{title:dto.title}:{}),...(dto.instructions!==undefined?{instructions:dto.instructions}:{})}});
  }
  async startAttempt(user:AuthenticatedUser,classroomAssignmentId:string) {
    const assignment = await this.prisma.$queryRaw<{ classroom_id:string; lesson_id?: string; max_attempts:number|null }[]>`
      SELECT ca.classroom_id,a.lesson_id,ca.max_attempts FROM public.learning_classroom_assignments ca
      JOIN public.learning_assignments a ON a.id=ca.assignment_id
      JOIN public.learning_lessons lesson ON lesson.id=a.lesson_id
      JOIN public.learning_classrooms classroom ON classroom.id=ca.classroom_id AND classroom.status='active'
      JOIN public.learning_course_offerings offering ON offering.id=classroom.offering_id
        AND offering.course_id=lesson.course_id AND offering.status='active'
      JOIN public.learning_enrollments enrollment ON enrollment.course_id=lesson.course_id
        AND enrollment.offering_id=offering.id AND enrollment.classroom_id=classroom.id
        AND enrollment.learner_user_id=${user.vistaUserId}::uuid AND enrollment.status='active'
      WHERE ca.id=${classroomAssignmentId}::uuid AND ca.status='published'
        AND (ca.available_from IS NULL OR ca.available_from<=now())
        AND (ca.close_at IS NULL OR ca.close_at>now())`;
    if (!assignment[0]) throw new NotFoundException("Assignment was not found.");
    await this.scope.assertStudentClassroomAccess(user, assignment[0].classroom_id);
    if (this.progression && assignment[0].lesson_id) {
      await this.progression.assertPrerequisites(this.prisma, user.vistaUserId, assignment[0].lesson_id);
    }
    return this.prisma.$transaction(async (tx) => {
      // Serializes attempt-number allocation per learner/assignment and avoids a
      // MAX()+1 uniqueness race without changing the existing schema.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${classroomAssignmentId}:${user.vistaUserId}`}))`;
      const active=await tx.$queryRaw<{ id:string;classroom_assignment_id:string;learner_user_id:string;attempt_number:number;status:string;started_at:Date }[]>`SELECT id,classroom_assignment_id,learner_user_id,attempt_number,status,started_at FROM public.learning_assignment_attempts WHERE classroom_assignment_id=${classroomAssignmentId}::uuid AND learner_user_id=${user.vistaUserId}::uuid AND status='in_progress' ORDER BY attempt_number DESC LIMIT 1`;
      if(active[0])return active[0];
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
