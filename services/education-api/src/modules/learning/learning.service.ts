import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { PaginationDto } from "./dto/pagination.dto";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto";
import { CreateQuizDeliveryDto } from './dto/create-quiz-delivery.dto';
import { LearningScopeService } from "./learning-scope.service";
import { ProgressionService, QualifiedProgramVersionHandoff } from "./progression.service";
import { normalizeLessonContent } from "./lesson-content.schema";
import { EnrollmentDeliveryService } from "./enrollment-delivery.service";
import { runCourseSyncTransaction } from "./course-sync-transaction";
import { assertCurriculumMutable, curriculumDeliverability, deliveryEvidence } from "./course-lifecycle";

const requiredTitle = (value: string, label: string): string => {
  const title = value.trim();
  if (!title) throw new BadRequestException(`${label} cannot be empty.`);
  return title;
};

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: LearningScopeService,
    private readonly progression?: ProgressionService,
    private readonly enrollmentDelivery?: EnrollmentDeliveryService,
  ) {}

  async createGlobalCourse(user: AuthenticatedUser, input: { title: string; description?: string }) {
    this.assertSystemAdministrator(user);
    return this.prisma.learning_courses.create({ data: {
      title: requiredTitle(input.title, 'Course title'), description: input.description?.trim(), status: 'draft', created_by: user.vistaUserId,
    } });
  }

  async updateGlobalCourse(user: AuthenticatedUser, courseId: string, input: { title?: string; description?: string }) {
    this.assertSystemAdministrator(user);
    const course = await this.prisma.learning_courses.findFirst({ where: { id: courseId, organization_id: null } });
    if (!course) throw new NotFoundException('Course was not found.');
    return this.prisma.learning_courses.update({ where: { id: courseId }, data: {
      ...(input.title === undefined ? {} : { title: requiredTitle(input.title, 'Course title') }),
      ...(input.description === undefined ? {} : { description: input.description.trim() }),
    } });
  }

  /**
   * Publishing and enrolling the existing classroom members are one all-or-nothing transaction: the course row is
   * locked (FOR NO KEY UPDATE: a FOR UPDATE lock would block the foreign-key checks of concurrent single-classroom
   * enrollments, which wait for classroom locks this transaction also needs), deliverability is re-checked under the lock, the status changes and every active classroom of an active
   * offering is synchronized (ascending id, see EnrollmentDeliveryService). If any step fails the course stays in its
   * previous state and the caller gets the error, so learner access can never be half-synchronized. Publishing again
   * is idempotent and is the safe retry.
   */
  async publishCourse(user: AuthenticatedUser, courseId: string) {
    this.assertSystemAdministrator(user);
    return runCourseSyncTransaction(this.prisma, async (tx) => {
      const courses = await tx.$queryRaw<Array<{ id: string; status: string; organization_id: string | null }>>`
        SELECT id, status, organization_id FROM public.learning_courses WHERE id=${courseId}::uuid FOR NO KEY UPDATE`;
      const course = courses[0];
      if (!course || course.organization_id !== null) throw new NotFoundException('Course was not found.');
      if (course.status === 'archived') throw new ConflictException('An archived course cannot be published.');
      const lessons = await curriculumDeliverability(tx, courseId);
      if (!lessons.length) throw new ConflictException('A course needs at least one lesson before publishing.');
      // Course 1 and other legacy courses deliver content through the activity adapter, not
      // section rows, so requiring sections here would reject valid existing curricula.
      const undeliverable = lessons.filter((lesson) => !lesson.legacyCourse && lesson.publishedActivities === 0);
      if (undeliverable.length) {
        throw new ConflictException(
          `Every lesson needs at least one published section with a published activity before the course can be published (${undeliverable.length} lesson(s) are not deliverable).`,
        );
      }
      const published = await tx.learning_courses.update({ where: { id: courseId }, data: { status: 'published' } });
      if (!this.enrollmentDelivery) throw new ConflictException('Enrollment synchronization is not configured.');
      const enrollmentSync = await this.enrollmentDelivery.synchronizeCourseIn(tx, courseId);
      return { ...published, enrollmentSync };
    });
  }

  /** Idempotent, all-or-nothing re-synchronization of a published course's classroom enrollments. */
  async syncCourseEnrollments(user: AuthenticatedUser, courseId: string) {
    this.assertSystemAdministrator(user);
    const course = await this.prisma.learning_courses.findFirst({ where: { id: courseId, organization_id: null }, select: { id: true, status: true } });
    if (!course) throw new NotFoundException('Course was not found.');
    if (course.status !== 'published') throw new ConflictException('Only a published course can synchronize classroom enrollments.');
    if (!this.enrollmentDelivery) throw new ConflictException('Enrollment synchronization is not configured.');
    return this.enrollmentDelivery.synchronizeCourse(courseId);
  }

  async archiveCourse(user: AuthenticatedUser, courseId: string) {
    this.assertSystemAdministrator(user);
    const course = await this.prisma.learning_courses.findFirst({ where: { id: courseId, organization_id: null } });
    if (!course) throw new NotFoundException('Course was not found.');
    const evidence = await deliveryEvidence(this.prisma, courseId);
    if (evidence.activeEnrollments > 0 || evidence.activeOfferings > 0 || evidence.activeClassrooms > 0) {
      throw new ConflictException(
        'This course still has active delivery. Archive classrooms and deactivate offerings before archiving it.',
      );
    }
    return this.prisma.learning_courses.update({ where: { id: courseId }, data: { status: 'archived' } });
  }

  async createCourseLesson(user: AuthenticatedUser, courseId: string, input: { title: string; content?: Record<string, unknown> }) {
    this.assertSystemAdministrator(user); const course = await this.globalCourse(courseId);
    await assertCurriculumMutable(this.prisma, courseId, 'Adding lessons');
    const ordinal = (await this.prisma.learning_lessons.aggregate({ where: { course_id: courseId }, _max: { ordinal: true } }))._max.ordinal ?? 0;
    return this.prisma.learning_lessons.create({ data: { course_id: courseId, title: requiredTitle(input.title, 'Lesson title')!, content: (input.content ?? {}) as Prisma.InputJsonValue, ordinal: ordinal + 1 } });
  }

  async updateCourseLesson(user: AuthenticatedUser, lessonId: string, input: { title?: string; content?: Record<string, unknown> }) {
    this.assertSystemAdministrator(user); const lesson = await this.prisma.learning_lessons.findUnique({ where: { id: lessonId } }); if (!lesson) throw new NotFoundException('Lesson was not found.'); const course = await this.globalCourse(lesson.course_id);
    if (course.status === 'archived') throw new ConflictException('An archived course cannot change curriculum.');
    // Titles are cosmetic; lesson body content is meaning-bearing for enrolled learners.
    if (input.content !== undefined) await assertCurriculumMutable(this.prisma, lesson.course_id, 'Changing lesson content');
    return this.prisma.learning_lessons.update({ where: { id: lessonId }, data: { ...(input.title === undefined ? {} : { title: requiredTitle(input.title, 'Lesson title') }), ...(input.content === undefined ? {} : { content: input.content as Prisma.InputJsonValue }) } });
  }

  async reorderCourseLessons(user: AuthenticatedUser, courseId: string, orderedIds: string[]) {
    this.assertSystemAdministrator(user); const course = await this.globalCourse(courseId);
    if (course.status === 'archived') throw new ConflictException('An archived course cannot change curriculum.');
    await assertCurriculumMutable(this.prisma, courseId, 'Reordering lessons');
    const current = await this.prisma.learning_lessons.findMany({ where: { course_id: courseId }, select: { id: true } });
    if (current.length !== orderedIds.length || !current.every(l => orderedIds.includes(l.id))) throw new BadRequestException('Reorder must include every lesson exactly once.');
    return this.prisma.$transaction(async tx => {
      // Prisma creates @@unique as a unique index, not a deferrable constraint.
      // Lock the course to serialize competing reorders, then move every ordinal
      // out of the target range before assigning the requested positions.
      await tx.$queryRaw`SELECT id FROM public.learning_courses WHERE id=${courseId}::uuid FOR UPDATE`;
      const lessons = await tx.learning_lessons.findMany({ where: { course_id: courseId }, select: { id: true } });
      if (lessons.length !== orderedIds.length || !lessons.every((lesson) => orderedIds.includes(lesson.id))) {
        throw new BadRequestException('Reorder must include every lesson exactly once.');
      }
      await tx.$executeRaw`UPDATE public.learning_lessons SET ordinal=ordinal+${lessons.length} WHERE course_id=${courseId}::uuid`;
      for (let i = 0; i < orderedIds.length; i += 1) {
        await tx.learning_lessons.update({ where: { id: orderedIds[i] }, data: { ordinal: i + 1 } });
      }
      return { courseId, orderedIds };
    });
  }

  async setLessonPrerequisites(user: AuthenticatedUser, lessonId: string, prerequisiteLessonIds: string[]) {
    this.assertSystemAdministrator(user); const lesson = await this.prisma.learning_lessons.findUnique({ where: { id: lessonId } }); if (!lesson) throw new NotFoundException('Lesson was not found.'); const course = await this.globalCourse(lesson.course_id);
    if (course.status === 'archived') throw new ConflictException('An archived course cannot change curriculum.');
    if (prerequisiteLessonIds.includes(lessonId)) throw new BadRequestException('A lesson cannot require itself.'); const count = await this.prisma.learning_lessons.count({ where: { id: { in: prerequisiteLessonIds }, course_id: lesson.course_id } }); if (count !== prerequisiteLessonIds.length) throw new BadRequestException('Prerequisites must belong to the course.');
    if (prerequisiteLessonIds.length) {
      const cycles = await this.prisma.$queryRaw<{ id: string }[]>`
        WITH RECURSIVE dependencies(id) AS (
          SELECT prerequisite_lesson_id FROM public.learning_lesson_prerequisites WHERE lesson_id=ANY(${prerequisiteLessonIds}::uuid[])
          UNION SELECT p.prerequisite_lesson_id FROM public.learning_lesson_prerequisites p JOIN dependencies d ON p.lesson_id=d.id
        ) SELECT id FROM dependencies WHERE id=${lessonId}::uuid LIMIT 1`;
      if (cycles.length) throw new BadRequestException('Prerequisites cannot create a circular dependency.');
    }
    await assertCurriculumMutable(this.prisma, lesson.course_id, 'Changing lesson prerequisites');
    return this.prisma.$transaction(async tx => { await tx.learning_lesson_prerequisites.deleteMany({ where: { lesson_id: lessonId } }); if (prerequisiteLessonIds.length) await tx.learning_lesson_prerequisites.createMany({ data: prerequisiteLessonIds.map(prerequisite_lesson_id => ({ lesson_id: lessonId, prerequisite_lesson_id, required: true })) }); return { lessonId, prerequisiteLessonIds }; });
  }

  private async globalCourse(courseId: string) { const course = await this.prisma.learning_courses.findFirst({ where: { id: courseId, organization_id: null } }); if (!course) throw new NotFoundException('Course was not found.'); return course; }

  private assertSystemAdministrator(user: AuthenticatedUser) {
    if (!this.scope.isSystemAdministrator(user)) throw new NotFoundException('Course was not found.');
  }

  async courses(user: AuthenticatedUser, page: PaginationDto) {
    const unrestricted = this.scope.isSystemAdministrator(user);
    const rows = await this.prisma.$queryRaw<CourseRow[]>`
      SELECT DISTINCT c.id,c.title,c.description,c.status,c.created_at,c.updated_at
      FROM public.learning_courses c
      WHERE ${unrestricted} OR (c.status='published' AND EXISTS (
        SELECT 1 FROM public.learning_enrollments e
        JOIN public.learning_course_offerings o ON o.id=e.offering_id AND o.course_id=c.id AND o.status='active'
        JOIN public.learning_classrooms cl ON cl.id=e.classroom_id AND cl.offering_id=o.id AND cl.status='active'
        JOIN public.learning_classroom_members cm ON cm.classroom_id=cl.id AND cm.user_id=e.learner_user_id
          AND cm.classroom_role='student' AND cm.status='active'
        JOIN public.memberships m ON m.id=cm.membership_id AND m.user_id=e.learner_user_id
          AND m.organization_id=cl.organization_id AND m.status='active'
        WHERE e.course_id=c.id AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      ))
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
    return this.prisma.$queryRaw`SELECT l.id,l.course_id,l.title,l.content,l.ordinal,l.created_at,
      COALESCE((SELECT jsonb_agg(p.prerequisite_lesson_id ORDER BY prerequisite_lesson_id)
        FROM public.learning_lesson_prerequisites p WHERE p.lesson_id=l.id),'[]'::jsonb) AS "prerequisiteLessonIds"
      FROM public.learning_lessons l WHERE l.course_id=${courseId}::uuid ORDER BY l.ordinal`;
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
      ORDER BY CASE WHEN EXISTS (
        SELECT 1 FROM public.learning_activities quiz_activity
        JOIN public.learning_sections quiz_section ON quiz_section.id=quiz_activity.section_id
        WHERE quiz_section.lesson_id=a.lesson_id AND quiz_section.status='published'
          AND quiz_activity.status='published' AND quiz_activity.type='knowledge_check'
          AND quiz_activity.content_ref->>'kind'='assignment' AND quiz_activity.content_ref->>'id'=a.id::text
      ) THEN 0 ELSE 1 END,ca.created_at DESC LIMIT 1`;

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

    let qualification: QualifiedProgramVersionHandoff | null = null;
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
        a.challenge_id,ch.title AS challenge_title,
        c.id AS classroom_id,c.name AS classroom_name,co.title AS course_title,
        COALESCE(ca.due_at, a.due_at) AS due_at,
        latest.id AS attempt_id,latest.status AS attempt_status,latest.started_at,latest.submitted_at,
        COALESCE(latest.score::float, sub.assessment_score) AS score,
        COALESCE(sub.overall_feedback, tf.feedback_content) AS teacher_feedback,
        CASE
          WHEN latest.status = 'evaluated' OR sub.overall_feedback IS NOT NULL OR sub.assessment_score IS NOT NULL THEN 'evaluated'
          WHEN latest.status = 'submitted' OR latest.submitted_at IS NOT NULL OR sub.submission_id IS NOT NULL THEN 'submitted'
          WHEN latest.id IS NOT NULL THEN 'in_progress'
          ELSE 'assigned'
        END AS status,
        CASE
          WHEN latest.status = 'evaluated' THEN 'evaluated'
          WHEN latest.submitted_at IS NOT NULL THEN 'completed'
          WHEN latest.id IS NOT NULL THEN 'started'
          ELSE 'assigned'
        END AS learning_status
      FROM public.learning_classroom_assignments ca
      JOIN public.learning_assignments a ON a.id=ca.assignment_id
      JOIN public.learning_lessons l ON l.id=a.lesson_id
      LEFT JOIN public.learning_challenges ch ON ch.id=a.challenge_id
      JOIN public.learning_classrooms c ON c.id=ca.classroom_id
      JOIN public.learning_course_offerings o ON o.id=c.offering_id
      JOIN public.learning_courses co ON co.id=o.course_id
      JOIN public.learning_enrollments e ON e.course_id=co.id AND e.offering_id=o.id AND e.classroom_id=c.id
        AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active'
      JOIN public.learning_classroom_members cm ON cm.classroom_id=c.id AND cm.user_id=${user.vistaUserId}::uuid AND cm.classroom_role='student' AND cm.status='active'
      JOIN public.memberships m ON m.id=cm.membership_id AND m.status='active' AND m.organization_id=c.organization_id
      LEFT JOIN LATERAL (
        SELECT id,status,program_id,score,started_at,submitted_at,grading_released_at
        FROM public.learning_assignment_attempts
        WHERE classroom_assignment_id=ca.id AND learner_user_id=${user.vistaUserId}::uuid
        ORDER BY started_at DESC LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT s.id AS submission_id,
          -- Instructor grading is visible only after the attempt's grading was released.
          CASE WHEN latest.grading_released_at IS NOT NULL THEN ass.overall_feedback END AS overall_feedback,
          CASE WHEN latest.grading_released_at IS NOT NULL
            THEN (SELECT SUM(sc.awarded_points)::float FROM public.learning_assessment_scores sc WHERE sc.assessment_id=ass.id) END AS assessment_score
        FROM public.learning_submissions s
        LEFT JOIN public.learning_assessments ass ON ass.submission_id=s.id
        WHERE s.assignment_id=ca.assignment_id AND s.learner_user_id=${user.vistaUserId}::uuid AND s.status<>'draft'
          AND (s.attempt_id=latest.id OR (s.attempt_id IS NULL AND (latest.program_id IS NULL OR s.program_id=latest.program_id)))
        ORDER BY s.submitted_at DESC NULLS LAST LIMIT 1
      ) sub ON true
      LEFT JOIN LATERAL (
        SELECT fb.content AS feedback_content
        FROM public.learning_feedback fb
        WHERE latest.grading_released_at IS NOT NULL
          AND (fb.attempt_id=latest.id OR (sub.submission_id IS NOT NULL AND fb.submission_id=sub.submission_id))
          AND fb.author_user_id != ${user.vistaUserId}::uuid
        ORDER BY fb.created_at DESC LIMIT 1
      ) tf ON true
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
          SELECT jsonb_agg(jsonb_build_object('id',ch.id,'title',ch.title,'description',ch.description,
            'conditions',COALESCE((SELECT jsonb_agg(jsonb_build_object('type',cc2.condition_type,'description',cc2.description,'ruleKey',cc2.rule_key) ORDER BY cc2.ordinal)
              FROM public.learning_challenge_conditions cc2 WHERE cc2.challenge_id=ch.id),'[]'::jsonb)) ORDER BY ch.title)
          FROM public.learning_challenges ch
          WHERE ch.status='published'
            AND (ch.organization_id IS NULL OR ch.organization_id=c.organization_id)
            AND 'blockly'=ANY(ch.permitted_modes)
            AND EXISTS (
              SELECT 1 FROM public.learning_challenge_conditions cc
              WHERE cc.challenge_id=ch.id AND cc.condition_type='success'
            )
        ),'[]'::jsonb) AS challenges,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('title',rc.title,'description',rc.description,'maxPoints',rc.max_points) ORDER BY rc.ordinal)
          FROM public.learning_rubric_criteria rc WHERE rc.assignment_id=rubric_source.id
        ),'[]'::jsonb) AS rubric
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
      LEFT JOIN LATERAL (
        SELECT a.id FROM public.learning_assignments a
        JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id
        JOIN public.learning_classrooms source ON source.id=ca.classroom_id
        WHERE a.lesson_id=l.id AND source.organization_id=c.organization_id
          AND EXISTS (SELECT 1 FROM public.learning_rubric_criteria rc0 WHERE rc0.assignment_id=a.id)
        ORDER BY ca.created_at DESC LIMIT 1
      ) rubric_source ON true
      WHERE c.id=${classroomId}::uuid ORDER BY l.ordinal`;
  }
  async publishedQuizzes(user: AuthenticatedUser, classroomId: string) {
    await this.scope.assertTeacherClassroomAccess(user, classroomId);
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT a.id AS canonical_assignment_id,a.title AS quiz_title,a.instructions,l.id AS lesson_id,l.title AS lesson_title,
        co.id AS course_id,co.title AS course_title,co.status AS course_status,
        COALESCE((a.constraints->>'passPercent')::int,80) AS pass_percent,
        (SELECT COUNT(*)::int FROM public.learning_assignment_question_versions aq WHERE aq.assignment_id=a.id) AS question_count,
        EXISTS (SELECT 1 FROM public.learning_classroom_assignments ca WHERE ca.classroom_id=c.id AND ca.assignment_id=a.id) AS already_assigned
      FROM public.learning_classrooms c
      JOIN public.learning_course_offerings o ON o.id=c.offering_id AND o.status='active'
      JOIN public.learning_courses co ON co.id=o.course_id AND co.status='published'
      JOIN public.learning_lessons l ON l.course_id=co.id
      JOIN public.learning_assignments a ON a.lesson_id=l.id AND a.challenge_id IS NULL AND a.constraints->>'kind'='knowledge_check'
      WHERE c.id=${classroomId}::uuid AND c.status='active' AND (co.organization_id IS NULL OR co.organization_id=c.organization_id)
        AND EXISTS (SELECT 1 FROM public.learning_sections s JOIN public.learning_activities act ON act.section_id=s.id
          WHERE s.lesson_id=l.id AND s.status='published' AND act.status='published' AND act.type='knowledge_check'
            AND act.content_ref->>'kind'='assignment' AND act.content_ref->>'id'=a.id::text)
        AND NOT EXISTS (SELECT 1 FROM public.learning_classroom_assignments ca WHERE ca.classroom_id=c.id AND ca.assignment_id=a.id)
        AND EXISTS (SELECT 1 FROM public.learning_assignment_question_versions aq JOIN public.learning_question_versions v ON v.id=aq.question_version_id WHERE aq.assignment_id=a.id AND v.status='published')
      ORDER BY co.title,l.ordinal,a.title`;
  }
  async createQuizDelivery(user: AuthenticatedUser, classroomId: string, dto: CreateQuizDeliveryDto) {
    await this.scope.assertTeacherClassroomAccess(user, classroomId);
    const availableFrom = dto.availableFrom ? new Date(dto.availableFrom) : null;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    const closeAt = dto.closeAt ? new Date(dto.closeAt) : null;
    if ((availableFrom && dueAt && dueAt < availableFrom) || (availableFrom && closeAt && closeAt <= availableFrom) || (dueAt && closeAt && closeAt < dueAt)) {
      throw new BadRequestException('Quiz delivery dates must be ordered: availability, due date, then close date.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const eligible = await tx.$queryRaw<Array<{ id: string; lesson_id: string }>>`
          SELECT a.id,a.lesson_id FROM public.learning_assignments a
          JOIN public.learning_lessons l ON l.id=a.lesson_id
          JOIN public.learning_courses co ON co.id=l.course_id AND co.status='published'
          JOIN public.learning_course_offerings o ON o.course_id=co.id AND o.status='active'
          JOIN public.learning_classrooms c ON c.offering_id=o.id AND c.id=${classroomId}::uuid AND c.status='active'
          WHERE a.id=${dto.canonicalAssignmentId}::uuid AND a.challenge_id IS NULL
            AND a.constraints->>'kind'='knowledge_check'
            AND (co.organization_id IS NULL OR co.organization_id=c.organization_id)
            AND EXISTS (SELECT 1 FROM public.learning_sections s JOIN public.learning_activities act ON act.section_id=s.id
              WHERE s.lesson_id=l.id AND s.status='published' AND act.status='published' AND act.type='knowledge_check'
                AND act.content_ref->>'kind'='assignment' AND act.content_ref->>'id'=a.id::text)
            AND EXISTS (SELECT 1 FROM public.learning_assignment_question_versions aq JOIN public.learning_question_versions v ON v.id=aq.question_version_id WHERE aq.assignment_id=a.id AND v.status='published')
          FOR UPDATE OF a`;
        if (!eligible[0]) throw new NotFoundException('Published quiz was not found for this classroom course.');
        const existing = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.learning_classroom_assignments WHERE classroom_id=${classroomId}::uuid AND assignment_id=${dto.canonicalAssignmentId}::uuid`;
        if (existing.length) throw new ConflictException('This quiz is already assigned to the classroom.');
        const rows = await tx.$queryRaw<Array<Record<string, unknown>>>
          `INSERT INTO public.learning_classroom_assignments(classroom_id,assignment_id,status,available_from,due_at,close_at,max_attempts)
           VALUES(${classroomId}::uuid,${dto.canonicalAssignmentId}::uuid,'draft',${availableFrom},${dueAt},${closeAt},${dto.maxAttempts ?? null})
           RETURNING id,classroom_id,assignment_id,status,available_from,due_at,close_at,max_attempts,published_by`;
        return rows[0];
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('This quiz is already assigned to the classroom.');
      throw error;
    }
  }
  async createAssignment(user:AuthenticatedUser,classroomId:string,dto:CreateAssignmentDto) {
    if (dto.quizPassPercent !== undefined && dto.challengeId !== undefined) throw new BadRequestException('A Question Bank quiz cannot use a robot challenge.');
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
      // The rubric is persisted per assignment and there is no authoring API for it: a new Blockly assignment inherits
      // the criteria of the most recent assignment of the same lesson in the same organization (the same template that
      // pre-fills the title/instructions). Quizzes are machine-graded and never inherit a rubric. One statement, so the
      // content, its rubric and (below) the delivery are created or rolled back together.
      const assignments=await tx.$queryRaw<{id:string}[]>`
        WITH created AS (
          INSERT INTO public.learning_assignments(lesson_id,challenge_id,title,instructions,constraints)
          VALUES(${dto.lessonId}::uuid,${dto.challengeId??null}::uuid,${dto.title},${dto.instructions??""},${JSON.stringify(dto.quizPassPercent === undefined ? {} : { kind: 'knowledge_check', passPercent: dto.quizPassPercent })}::jsonb) RETURNING id
        ), copied AS (
          INSERT INTO public.learning_rubric_criteria(assignment_id,ordinal,title,description,max_points)
          SELECT (SELECT id FROM created),rc.ordinal,rc.title,rc.description,rc.max_points
          FROM public.learning_rubric_criteria rc
          WHERE ${dto.quizPassPercent === undefined} AND rc.assignment_id=(
            SELECT a.id FROM public.learning_assignments a
            JOIN public.learning_classroom_assignments ca ON ca.assignment_id=a.id
            JOIN public.learning_classrooms source ON source.id=ca.classroom_id
            WHERE a.lesson_id=${dto.lessonId}::uuid AND source.organization_id=${lessons[0].organization_id}::uuid
              AND EXISTS (SELECT 1 FROM public.learning_rubric_criteria rc0 WHERE rc0.assignment_id=a.id)
            ORDER BY ca.created_at DESC LIMIT 1)
        ) SELECT id FROM created`;
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
      const deliveries=await tx.$queryRaw<{id:string;status:string;constraints:unknown;challenge_id:string|null;classroom_status:string}[]>`
        SELECT ca.id,ca.status,a.constraints,a.challenge_id,c.status AS classroom_status FROM public.learning_classroom_assignments ca
        JOIN public.learning_assignments a ON a.id=ca.assignment_id
        JOIN public.learning_classrooms c ON c.id=ca.classroom_id
        WHERE ca.classroom_id=${classroomId}::uuid AND ca.assignment_id=${assignmentId}::uuid
        FOR UPDATE OF ca`;
      const delivery=deliveries[0];
      if(!delivery) throw new NotFoundException("Assignment was not found.");
      if(delivery.classroom_status!=='active') throw new ConflictException("Assignments cannot be published to an inactive classroom.");
      if(delivery.status==='closed'||delivery.status==='archived'){
        throw new ConflictException("Assignment cannot be published from its current state.");
      }
      if ((delivery.constraints as { kind?: string } | null)?.kind === 'knowledge_check' && !delivery.challenge_id) {
        const questions = await tx.$queryRaw<Array<{ count: number; unavailable: number }>>`
          SELECT COUNT(*)::int AS count,COUNT(*) FILTER (WHERE v.status<>'published')::int AS unavailable
          FROM public.learning_assignment_question_versions aq JOIN public.learning_question_versions v ON v.id=aq.question_version_id
          WHERE aq.assignment_id=${assignmentId}::uuid`;
        if (!questions[0]?.count || questions[0].unavailable) throw new ConflictException('Quiz requires published QuestionVersions before delivery.');
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
    const assignment = await this.prisma.$queryRaw<{ classroom_id:string; lesson_id?: string; assignment_id?: string; challenge_id?: string|null; constraints?:unknown; course_organization_id?:string|null; max_attempts:number|null }[]>`
      SELECT ca.classroom_id,a.lesson_id,a.id AS assignment_id,a.challenge_id,a.constraints,course.organization_id AS course_organization_id,ca.max_attempts FROM public.learning_classroom_assignments ca
      JOIN public.learning_assignments a ON a.id=ca.assignment_id
      JOIN public.learning_lessons lesson ON lesson.id=a.lesson_id
      JOIN public.learning_courses course ON course.id=lesson.course_id
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
      const active=await tx.$queryRaw<{ id:string;classroom_assignment_id:string;learner_user_id:string;attempt_number:number;status:string;started_at:Date;workspace_snapshot?:unknown }[]>`SELECT id,classroom_assignment_id,learner_user_id,attempt_number,status,started_at,workspace_snapshot FROM public.learning_assignment_attempts WHERE classroom_assignment_id=${classroomAssignmentId}::uuid AND learner_user_id=${user.vistaUserId}::uuid AND status='in_progress' ORDER BY attempt_number DESC LIMIT 1`;
      if(active[0]) {
        const { workspace_snapshot, ...attempt } = active[0];
        return (workspace_snapshot as {kind?:string}|undefined)?.kind === 'question_bank_quiz' ? { ...attempt, quiz: workspace_snapshot } : attempt;
      }
      const rows = await tx.$queryRaw<{ n:number; existing:number }[]>`
        SELECT COALESCE(MAX(attempt_number),0)+1 AS n, COUNT(*)::int AS existing
        FROM public.learning_assignment_attempts
        WHERE classroom_assignment_id=${classroomAssignmentId}::uuid AND learner_user_id=${user.vistaUserId}::uuid`;
      const next = rows[0];
      if (!next || (assignment[0].max_attempts !== null && next.existing >= assignment[0].max_attempts)) {
        throw new NotFoundException("Assignment was not found.");
      }
      const config = assignment[0].constraints as { kind?: string; passPercent?: number } | undefined;
      if (config?.kind === 'knowledge_check' && !assignment[0].challenge_id) {
        if (!this.progression || !assignment[0].assignment_id || !assignment[0].lesson_id || assignment[0].course_organization_id === undefined) throw new ConflictException('Quiz assignment configuration is incomplete.');
        const snapshot = await this.progression.prepareQuestionBankQuiz(tx, assignment[0].assignment_id, assignment[0].lesson_id, assignment[0].course_organization_id, config.passPercent);
        const created = await tx.$queryRaw<{ id: string; classroom_assignment_id: string; learner_user_id: string; attempt_number: number; status: string; started_at: Date }[]>`INSERT INTO public.learning_assignment_attempts(classroom_assignment_id,learner_user_id,attempt_number,workspace_snapshot)
          VALUES(${classroomAssignmentId}::uuid,${user.vistaUserId}::uuid,${next.n},${JSON.stringify(snapshot.publicSnapshot)}::jsonb)
          RETURNING id,classroom_assignment_id,learner_user_id,attempt_number,status,started_at`;
        await tx.$queryRaw`
          INSERT INTO public.learning_quiz_attempt_grading(attempt_id,grading_snapshot)
          VALUES(${created[0].id}::uuid,${JSON.stringify(snapshot.privateSnapshot)}::jsonb) RETURNING attempt_id`;
        return { ...created[0], quiz: snapshot.publicSnapshot };
      }
      const created = await tx.$queryRaw<{ id: string; classroom_assignment_id: string; learner_user_id: string; attempt_number: number; status: string; started_at: Date }[]>`INSERT INTO public.learning_assignment_attempts(classroom_assignment_id,learner_user_id,attempt_number)
        VALUES(${classroomAssignmentId}::uuid,${user.vistaUserId}::uuid,${next.n})
        RETURNING id,classroom_assignment_id,learner_user_id,attempt_number,status,started_at`;
      return created[0];
    });
  }
  async myAttempts(user:AuthenticatedUser){return this.prisma.$queryRaw`SELECT id,classroom_assignment_id,attempt_number,status,score,(result_snapshot->>'passed')::boolean AS passed,started_at,submitted_at FROM public.learning_assignment_attempts WHERE learner_user_id=${user.vistaUserId}::uuid ORDER BY started_at DESC`;}
  /**
   * The learner's own attempts of one classroom assignment, newest first, each with ITS OWN submission, attachments
   * and release state (never the latest submission's). Instructor grading is not included here (see myGrading).
   * A quiz's auto-graded score is part of the attempt result and is returned as before.
   */
  async attemptHistory(user:AuthenticatedUser,classroomAssignmentId:string){
    const scope=await this.prisma.$queryRaw<{classroom_id:string}[]>`SELECT classroom_id FROM public.learning_classroom_assignments WHERE id=${classroomAssignmentId}::uuid`;
    if(!scope[0]) throw new NotFoundException("Assignment was not found.");
    await this.scope.assertStudentClassroomAccess(user,scope[0].classroom_id);
    return this.prisma.$queryRaw`
      SELECT a.id,a.classroom_assignment_id,a.attempt_number,a.status,a.started_at,a.submitted_at,a.score,
        (a.result_snapshot->>'passed')::boolean AS passed,(a.draft_response IS NOT NULL) AS has_draft,a.draft_saved_at,
        a.grading_released_at,(a.grading_released_at IS NOT NULL) AS grading_released,
        sub.id AS submission_id,sub.origin AS submission_origin,
        (SELECT count(*)::int FROM public.learning_submission_files f WHERE f.attempt_id=a.id AND f.status='ready') AS file_count
      FROM public.learning_assignment_attempts a
      LEFT JOIN LATERAL (
        SELECT s.id,s.origin FROM public.learning_submissions s
        WHERE s.status<>'draft' AND (s.attempt_id=a.id OR (s.attempt_id IS NULL AND s.program_id=a.program_id AND s.learner_user_id=a.learner_user_id))
        ORDER BY (s.attempt_id=a.id) DESC NULLS LAST LIMIT 1
      ) sub ON true
      WHERE a.classroom_assignment_id=${classroomAssignmentId}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid
      ORDER BY a.attempt_number DESC`;
  }
  async myAttempt(user:AuthenticatedUser,id:string){const r=await this.prisma.$queryRaw<Record<string,unknown>[]>`SELECT id,classroom_assignment_id,attempt_number,status,program_id,workspace_snapshot,program_snapshot,result_snapshot,started_at,submitted_at,draft_response,draft_saved_at,grading_released_at FROM public.learning_assignment_attempts WHERE id=${id}::uuid AND learner_user_id=${user.vistaUserId}::uuid`;if(!r[0])throw new NotFoundException("Attempt was not found.");return r[0];}
  /**
   * Write guard for attempt-bound student actions that have no classroom query of their own (VR and demonstration
   * sessions): the caller must own the attempt AND hold an active enrollment in its active classroom/offering.
   * Reading the attempt stays on `myAttempt`, so revocation never hides preserved history.
   */
  async assertAttemptWritable(user:AuthenticatedUser,id:string){const r=await this.prisma.$queryRaw<{classroom_id:string}[]>`SELECT ca.classroom_id FROM public.learning_assignment_attempts a JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id WHERE a.id=${id}::uuid AND a.learner_user_id=${user.vistaUserId}::uuid`;if(!r[0])throw new NotFoundException("Attempt was not found.");await this.scope.assertStudentClassroomAccess(user,r[0].classroom_id,{requireActiveEnrollment:true});}
  async assignmentTitleForAttempt(user:AuthenticatedUser,id:string){await this.myAttempt(user,id);const r=await this.prisma.$queryRaw<{title:string}[]>`SELECT a.title FROM public.learning_assignment_attempts at JOIN public.learning_classroom_assignments ca ON ca.id=at.classroom_assignment_id JOIN public.learning_assignments a ON a.id=ca.assignment_id WHERE at.id=${id}::uuid AND at.learner_user_id=${user.vistaUserId}::uuid`;return r[0]?.title??null;}
}
export interface CourseRow { id:string; title:string; description:string|null; status:string; created_at:Date; updated_at:Date; }
export interface ClassroomRow { id:string; organization_id:string; offering_id:string; name:string; code:string; description:string|null; capacity:number|null; status:string; created_at:Date; updated_at:Date; }
