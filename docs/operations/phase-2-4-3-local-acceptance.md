# Phase 2.4.3 isolated LMS acceptance

Use only the approved, disposable `vista_test_course_builder` database in Compose project `vista-course-builder-test`. Port `55432` belongs to unrelated container `vista-qbm-test-pg`; it is prohibited for this runbook. The LMS container maps PostgreSQL to **127.0.0.1:55433** with `/var/lib/postgresql/data` on tmpfs. Verify the project label, tmpfs mount, loopback port, `current_database()`, and `current_user` before any write. Acceptance fixture and integration-test guards must require port 55433 only. Do not copy these steps to a shared, staging, or Production target.

## Database recipe

1. Start `docker-compose.education-test.yml` with an override that changes only its published PostgreSQL port to `127.0.0.1:55433:5432`; use project `vista-course-builder-test`. Confirm the container's Compose labels and tmpfs mount. Never connect to, stop, or alter the service on port 55432.
2. Restore verified `database/baselines/production-public-schema.sql` into a separate baseline database in this same disposable container. The 2026-11-15 source was 225119 bytes with SHA-256 `5b140ce7…694c2ef962`; verify the complete digest before restore. It is schema only: 88 tables, 46 RLS-enabled tables, no migration ledger entries, and **zero roles/permissions**. Keep this baseline untouched for target recreation.
3. Clone the baseline to `vista_test_course_builder`. Set `DATABASE_URL` to the loopback `vista_test` URL and `VISTA_DATABASE_PROJECT_REF=vista-course-builder-test`, unset hosted `SUPABASE_URL`, then run `python3 scripts/sql_migration_runner.py --apply --expected-project-ref vista-course-builder-test --operator-id <operator> --approval-reference <local-approval>`. Only active manifest migrations D/E are applied.
4. For the **separately approved local draft experiment only**, preflight `database/migration-drafts/20261111_global_quiz_runtime_role.sql` and execute it as one transaction against this target. The draft requires the baseline plus D/E tables, functions, and RLS objects. It makes global Question Bank `organization_id` nullable, adds a global-course uniqueness index and scope checks, and provisions `vista_app_runtime` as a restricted PostgreSQL role. The role's local password is set out of band. This draft is not registered in the manifest or promoted to Production. The API must connect as `vista_app_runtime`, never the fixture writer.
4a. With the separate user approval recorded for 2026-11-15, `database/migration-drafts/20261115_learning_grade_publication.sql` was applied only to `vista_test_course_builder` as one transaction. It adds nullable `learning_assessments.published_at` so saved grading and student-visible publication are distinct. It is not in the migration manifest or Production migration chain. Reapply it only to a freshly recreated approved 55433 target; seek owner review before registering or releasing it.
5. Build the Education API, then run `dist/scripts/phase243-e2e-fixtures.js seed` with `VISTA_E2E_ADMIN_DATABASE_URL` set to the verified `vista_test` target, `VISTA_DATABASE_PROJECT_REF=vista-course-builder-test`, local `SUPABASE_URL=http://127.0.0.1:54323`, and `VISTA_E2E_FIXTURE_FILE` under `/tmp`. The fixture guards require 55433 only. It adds only API capability codes found in current service guards, and provisions system admin, two school admins, instructor, two same-classroom students, and the course/quiz/assignment/two-school acceptance data. No authoritative role/permission seed exists in this checkout; this is local test bootstrap, not Production RBAC data.
6. To repeat from a clean state, drop and recreate **only** `vista_test_course_builder` from the baseline clone, reapply D/E and the separately approved local drafts, and reseed. The fixture `clean` command intentionally refuses to delete immutable published Question Bank mappings. Dispose of the entire tmpfs Compose project after acceptance. Remove only the fixture JSON and test key in `/tmp` if desired.

The database integration tests additionally require `RUN_POSTGRES_INTEGRATION=1`, `VISTA_INTEGRATION_DATABASE_URL` set to the `vista_test` writer URL for this target (API requests still use `vista_app_runtime`), `VISTA_DATABASE_PROJECT_REF=vista-course-builder-test`, and `SUPABASE_URL=''`. Their guards require loopback port 55433 and reject 55432 before connecting. An inherited nonempty `SUPABASE_URL` makes their isolation guard fail before tests run.

## Real browser stack

Run the Education API on an unused private local port (the 2026-11-15 run used **127.0.0.1:3001**) with local JWT issuer/JWKS at `http://127.0.0.1:54323/auth/v1`, the verified runtime-role database URL, and `WEB_ORIGIN=http://127.0.0.1:4173`. Then run from `web/robot-edu`:

```sh
VISTA_E2E_JWKS_PORT=54323 \
VISTA_E2E_API_BASE_URL=http://127.0.0.1:3001/api/v1 \
VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-lms.json \
npm run test:e2e
```

Playwright starts its local JWKS signer and Vite on 4173. The signer keeps a test-only private key in `/tmp/vista-phase243-jwks-private.pem` (mode 0600) so API JWKS caching survives Playwright server restarts. The tests send real requests to the Education API; the retry scenario interrupts client traffic to demonstrate recovery and does not mock an LMS response.

## Local S3-compatible storage

The MinIO Quay pull returned `401 UNAUTHORIZED`. A previously cached `rustfs/rustfs` digest was available locally; a separate `vista-lms-s3-acceptance` container runs with tmpfs data/logs on **127.0.0.1:59000**. The unrelated S3 container on port 9100 was untouched. Set `RUN_LOCAL_S3_INTEGRATION=1`, `LEARNING_MEDIA_S3_ENDPOINT=http://127.0.0.1:59000`, `LEARNING_MEDIA_S3_HEALTH_PATH=/minio/health/ready`, and the local RustFS credentials in both `LEARNING_MEDIA_S3_ACCESS_KEY`/`LEARNING_MEDIA_S3_SECRET_KEY` and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`; then run `npm test -- --silent src/modules/learning/learning-media.storage.s3.int.spec.ts` from `services/education-api`. Both credential pairs are loaded privately from the local container, not printed. The test passed 1/1 on 2026-11-15. It validates storage behavior, not a browser media-upload journey.

The runtime-role privilege probe is opt-in with `RUN_RUNTIME_ROLE_SECURITY=1`, `VISTA_RUNTIME_SECURITY_DATABASE_URL` set to the same loopback runtime-role URL, and fixture IDs. Database policies in the draft are permissive for the trusted API role; tenant isolation remains enforced in Education API services and must be checked at the HTTP boundary.
