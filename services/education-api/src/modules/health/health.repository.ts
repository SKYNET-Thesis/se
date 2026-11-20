import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";

@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async canConnect(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Schema the running code needs. The API reads the academic metadata columns of migration P unconditionally, so an API deployed BEFORE
   * that migration must not receive traffic. No secrets or row data are returned.
   */
  async schemaReadiness(): Promise<{ database: boolean; academicMetadataColumns: boolean; mediaArchiveColumns: boolean; runtimeRole: string | null }> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ columns: number; archive_columns: number; role: string }>>`
        SELECT (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND (
                  (table_name='learning_courses' AND column_name IN ('tags','prerequisite_course_ids'))
               OR (table_name='learning_assignments' AND column_name IN ('difficulty','assignment_type','pass_score','grading_method','learning_objectives'))
               OR (table_name='learning_classrooms' AND column_name='self_enrollment_open'))) AS columns,
               (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_media_assets' AND column_name IN ('archived_at','archived_by_user_id','archive_reason')) AS archive_columns,
               current_user::text AS role`;
      return { database: true, academicMetadataColumns: (rows[0]?.columns ?? 0) === 8, mediaArchiveColumns: (rows[0]?.archive_columns ?? 0) === 3, runtimeRole: rows[0]?.role ?? null };
    } catch {
      return { database: false, academicMetadataColumns: false, mediaArchiveColumns: false, runtimeRole: null };
    }
  }
}
