# VISTA — Database Migration Status

> Last updated: 2026-11-07. This file records status only; it grants no
> authorization to run anything against production.

## Production gate: NO-GO

Supabase PostgreSQL is the **primary production database**. Existing data must
remain untouched. Until a schema-only authoritative baseline is reconciled and
explicitly approved:

- Do **not** run `prisma migrate`, `prisma db push`, `prisma migrate reset`, or any
  schema change against production.
- Do **not** modify `_prisma_migrations`.
- Do **not** use production credentials for tests.

## Known state

- The Git migration chain does not match the historical Supabase
  `_prisma_migrations` records. The original baseline was never captured in the repo.
- Provisioning the **current** Prisma schema into a disposable PostgreSQL 16
  proves the schema is valid; it does **not** prove historical migration reproducibility.
- Migration directory currently present under `services/education-api/prisma/migrations/`:

  ```
  20261025_add_blockly_control_mode
  20261103_activity_progress
  20261104120000_remove_student_auth_identifier
  20261104_curriculum_foundation
  20261105_question_bank_foundation
  20261106_classroom_enrollment_lifecycle        (uncommitted, feature branch)
  20261106_question_bank_quiz_attempt
  ```

## Safe test procedure

Use an isolated disposable PostgreSQL 16 instance with independent credentials.
Stop and remove the container afterwards. Never point test configuration at Supabase.

## Outstanding work before GO

1. Capture a schema-only authoritative baseline from a known-good environment.
2. Reconcile the baseline against the Git migration chain and document the delta.
3. Review backup/restore procedure for production.
4. Obtain explicit user approval before any production schema operation.
