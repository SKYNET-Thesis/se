import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

/**
 * The D03 API only runs against a database that has the D03 migrations it needs; it never silently degrades.
 *
 *   Stage 1 (20261113_i_attempt_submission_foundation): REQUIRED to start. Missing columns would fail ordinary
 *     attempt reads, so the API refuses to boot instead.
 *   Stage 2 (staged 20261114_j_one_submission_per_attempt): required by the endpoints that write per-attempt
 *     submissions (final submit, and the draft submission a simulation run is bound to). Without it those endpoints
 *     answer 503 before changing anything. Everything else works on Stage 1.
 */
export type SchemaCapabilities = { stage1: boolean; stage2: boolean };
const STAGE2_RECHECK_MS = 30_000;

@Injectable()
export class SchemaCompatibilityService implements OnModuleInit {
  private readonly log = new Logger(SchemaCompatibilityService.name);
  private stage2Known = false;
  private checkedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<SchemaCapabilities> {
    const rows = await this.prisma.$queryRaw<Array<{ stage1: boolean; stage2: boolean }>>`
      SELECT
        EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.learning_submissions') AND attname = 'attempt_id' AND NOT attisdropped)
          AND to_regclass('public.learning_submission_files') IS NOT NULL
          AND (SELECT count(*) FROM pg_attribute WHERE attrelid = to_regclass('public.learning_assignment_attempts')
                 AND attname IN ('draft_response','draft_saved_at','grading_released_at','grading_released_by','grading_release_origin') AND NOT attisdropped) = 5 AS stage1,
        NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.learning_submissions')
                      AND conname = 'learning_submissions_assignment_id_learner_user_id_key')
          AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.learning_submissions') AND tgname = 'guard_learning_submission_attempt') AS stage2`;
    return { stage1: rows[0]?.stage1 === true, stage2: rows[0]?.stage2 === true };
  }

  /** Fails the application start when Stage 1 is missing; logs which D03 features Stage 2 unlocks. */
  async onModuleInit(): Promise<void> {
    const capabilities = await this.read();
    if (!capabilities.stage1) {
      throw new Error('D03 database schema is incompatible: migration 20261113_i_attempt_submission_foundation (Stage 1) is not applied. Apply it before starting this API version.');
    }
    this.stage2Known = capabilities.stage2;
    this.checkedAt = Date.now();
    if (!capabilities.stage2) this.log.warn('D03 Stage 2 (one submission per attempt) is not applied: final submission and simulation runs answer 503 until it is.');
  }

  /** Guards the endpoints that need one submission per attempt. A positive answer is cached; a negative one is re-read every 30 s. */
  async requireStage2(): Promise<void> {
    if (this.stage2Known) return;
    if (Date.now() - this.checkedAt > STAGE2_RECHECK_MS || this.checkedAt === 0) {
      const capabilities = await this.read();
      this.checkedAt = Date.now();
      this.stage2Known = capabilities.stage2;
    }
    if (!this.stage2Known) {
      throw new ServiceUnavailableException('Attempt-based submissions are not enabled in this environment yet: the D03 Stage 2 database migration has not been applied.');
    }
  }
}
