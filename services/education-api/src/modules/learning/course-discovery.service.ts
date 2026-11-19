import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { assertLevel, LEVEL_LABEL_BY_CODE } from "./course-academic";
import { EnrollmentDeliveryService } from "./enrollment-delivery.service";

type Tx = Prisma.TransactionClient;
interface CatalogRow {
  classroom_id: string; classroom_name: string; capacity: number | null; students: bigint; organization_id: string; school_name: string;
  course_id: string; title: string; description: string | null; level: string | null; tags: string[]; prerequisite_course_ids: string[]; enrolled_elsewhere: boolean;
}

/**
 * School-scoped course discovery and student self-enrollment. A student only ever sees classrooms of schools where they hold an active
 * student membership, and only classrooms their school explicitly opened (self_enrollment_open). Enrollment re-checks everything under the
 * classroom lock and reuses the existing classroom-member + enrollment synchronization, so every normal access policy still applies.
 */
@Injectable()
export class CourseDiscoveryService {
  constructor(private readonly prisma: PrismaService, private readonly enrollments: EnrollmentDeliveryService) {}

  private async candidates(db: PrismaService | Tx, user: AuthenticatedUser, filters: { level?: string | null; tag?: string | null; q?: string | null; classroomId?: string | null }) {
    const level = filters.level ? assertLevel(filters.level) : null; const tag = filters.tag?.trim() || null; const q = filters.q?.trim() || null; const classroomId = filters.classroomId ?? null;
    return db.$queryRaw<CatalogRow[]>`
      SELECT cl.id AS classroom_id, cl.name AS classroom_name, cl.capacity,
        (SELECT count(*) FROM public.learning_classroom_members x WHERE x.classroom_id=cl.id AND x.classroom_role='student' AND x.status='active') AS students,
        cl.organization_id, org.name AS school_name, c.id AS course_id, c.title, c.description, lv.code AS level, c.tags, c.prerequisite_course_ids,
        EXISTS (SELECT 1 FROM public.learning_enrollments e WHERE e.course_id=c.id AND e.learner_user_id=${user.vistaUserId}::uuid AND e.status='active') AS enrolled_elsewhere
      FROM public.learning_classrooms cl
      JOIN public.learning_course_offerings o ON o.id=cl.offering_id AND o.status='active'
      JOIN public.learning_courses c ON c.id=o.course_id AND c.status='published'
      JOIN public.organizations org ON org.id=cl.organization_id AND org.status='active'
      JOIN public.memberships ms ON ms.organization_id=cl.organization_id AND ms.user_id=${user.vistaUserId}::uuid AND ms.status='active'
      JOIN public.roles r ON r.id=ms.role_id AND r.code='student'
      LEFT JOIN public.learning_levels lv ON lv.id=c.level_id
      WHERE cl.status='active' AND cl.self_enrollment_open
        AND (${classroomId}::uuid IS NULL OR cl.id=${classroomId}::uuid)
        AND NOT EXISTS (SELECT 1 FROM public.learning_classroom_members mm WHERE mm.classroom_id=cl.id AND mm.user_id=${user.vistaUserId}::uuid AND mm.status='active')
        AND (${level}::text IS NULL OR lv.code=${level})
        AND (${tag}::text IS NULL OR EXISTS (SELECT 1 FROM unnest(c.tags) AS t WHERE lower(t)=lower(${tag})))
        AND (${q}::text IS NULL OR c.title ILIKE '%'||${q}||'%' OR COALESCE(c.description,'') ILIKE '%'||${q}||'%')
      ORDER BY COALESCE(lv.ordinal,99), c.title, cl.name`;
  }

  /** Course ids (of the candidates' prerequisites) the student has fully completed: every lesson of the course completed. */
  private async completedCourses(db: PrismaService | Tx, user: AuthenticatedUser, ids: string[]) {
    if (!ids.length) return new Set<string>();
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM public.learning_courses c
      WHERE c.id = ANY(${ids}::uuid[]) AND EXISTS (SELECT 1 FROM public.learning_lessons l WHERE l.course_id=c.id)
        AND NOT EXISTS (SELECT 1 FROM public.learning_lessons l WHERE l.course_id=c.id AND NOT EXISTS (
          SELECT 1 FROM public.learning_lesson_progress p WHERE p.lesson_id=l.id AND p.learner_user_id=${user.vistaUserId}::uuid AND p.status='completed'))`;
    return new Set(rows.map((row) => row.id));
  }

  private async decorate(db: PrismaService | Tx, user: AuthenticatedUser, rows: CatalogRow[]) {
    const prereqIds = [...new Set(rows.flatMap((row) => row.prerequisite_course_ids))];
    const done = await this.completedCourses(db, user, prereqIds);
    const titles = prereqIds.length ? await db.$queryRaw<{ id: string; title: string }[]>`SELECT id,title FROM public.learning_courses WHERE id=ANY(${prereqIds}::uuid[])` : [];
    const titleOf = new Map(titles.map((row) => [row.id, row.title]));
    return rows.map((row) => {
      const unmet = row.prerequisite_course_ids.filter((id) => !done.has(id)).map((id) => ({ id, title: titleOf.get(id) ?? "Another course" }));
      const full = row.capacity !== null && Number(row.students) >= row.capacity;
      const reasons: string[] = [];
      if (row.enrolled_elsewhere) reasons.push("You are already enrolled in this course.");
      if (full) reasons.push("This classroom is full.");
      if (unmet.length) reasons.push(`Complete ${unmet.map((item) => item.title).join(" and ")} first.`);
      return { classroomId: row.classroom_id, classroomName: row.classroom_name, schoolId: row.organization_id, schoolName: row.school_name, courseId: row.course_id, title: row.title, description: row.description,
        level: row.level, levelLabel: row.level ? LEVEL_LABEL_BY_CODE[row.level] ?? row.level : null, tags: row.tags, prerequisites: row.prerequisite_course_ids.map((id) => ({ id, title: titleOf.get(id) ?? "Another course", completed: done.has(id) })),
        capacity: row.capacity, seatsLeft: row.capacity === null ? null : Math.max(0, row.capacity - Number(row.students)), eligible: reasons.length === 0, reasons };
    });
  }

  async catalog(user: AuthenticatedUser, filters: { level?: string; tag?: string; q?: string }) {
    const rows = await this.candidates(this.prisma, user, filters);
    return { items: await this.decorate(this.prisma, user, rows) };
  }

  async enroll(user: AuthenticatedUser, classroomId: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.enrollments.lockClassroomIn(tx, classroomId);
      // Another school's, closed, unopened or unknown classrooms are indistinguishable from missing ones.
      const rows = locked ? await this.candidates(tx, user, { classroomId }) : [];
      if (!locked || !rows[0]) throw new NotFoundException("This course is not open for enrollment.");
      const [item] = await this.decorate(tx, user, rows);
      if (!item.eligible) throw new ConflictException({ code: "ENROLLMENT_NOT_ELIGIBLE", message: item.reasons.join(" "), reasons: item.reasons });
      const membership = await tx.memberships.findFirst({ where: { user_id: user.vistaUserId, organization_id: item.schoolId, status: "active", roles: { code: "student" } }, select: { id: true } });
      if (!membership) throw new NotFoundException("This course is not open for enrollment.");
      await tx.learning_classroom_members.upsert({
        where: { classroom_id_user_id: { classroom_id: classroomId, user_id: user.vistaUserId } },
        update: { membership_id: membership.id, classroom_role: "student", status: "active", left_at: null },
        create: { classroom_id: classroomId, user_id: user.vistaUserId, membership_id: membership.id, classroom_role: "student", status: "active", joined_at: new Date() },
      });
      await this.enrollments.synchronizeIfDeliverableIn(tx, classroomId);
      return { status: "enrolled" as const, classroomId, courseId: item.courseId, title: item.title };
    });
  }
}
