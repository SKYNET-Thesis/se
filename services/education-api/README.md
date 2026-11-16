# VISTA Business API

NestJS API for the VISTA educational workflow and its boundary to the robot control plane.

## Layout

```text
src/
  common/       Shared infrastructure: Prisma and HTTP error handling
  modules/      Business modules, grouped by capability
    health/      Service health checks
    status/      MQTT/control-plane availability
prisma/         PostgreSQL schema and migrations
```

The current extracted implementation provides health and MQTT-status endpoints.
VISTA modules own their controller, service, DTOs, tests and local helpers.
Prisma database models live once in `prisma/schema.prisma`; this API does not
duplicate them as TypeORM-style entities.

## Run locally

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run start:dev
```

The application listens on container port 3000. The repository Compose stack
publishes it at `http://localhost:3001`; its API prefix is `/api/v1`. Do not
commit `.env` or Supabase credentials.

## Learning Media (Phase 2.3)

The API uses the existing private S3 Learning Media bucket. Set the server-only
`LEARNING_MEDIA_BUCKET` and `AWS_REGION` values in the local API `.env`; provide
AWS credentials through the AWS SDK default credential chain (for example, a
named local AWS profile), never through the web app or committed environment
files. The API role requires `s3:PutObject` and `s3:GetObject` only under
`learning-media/courses/*`; Terraform contains this scoped policy and the
browser CORS origins, but no AWS changes are applied by this repository task.

Uploads use a five-minute presigned S3 POST policy, limited to the announced
file size and an allow-listed extension/MIME pair (maximum 250 MiB). The record
stays `pending` until the API verifies S3 HEAD size, content type, and media ID.
Student/author playback and document access use backend-authorized S3 URLs that
expire after 15 minutes, allowing browser video range requests while keeping
delivery short-lived. The server never returns permanent public URLs.

The canonical Production DDL owner is the repository SQL release runner under
`database/migrations/`; Prisma schema remains the generated-client data model.
The prepared SQL sequence is `20261110_a_curriculum_foundation`,
`20261110_b_question_bank_foundation`, `20261110_c_question_bank_quiz_attempt`,
`20261110_d_activity_content`, then `20261110_e_learning_media`. Each source is
review-only and remains unregistered because release manifest provenance
requires committed source bytes. See `database/migrations/README.md` and
`docs/operations/production-migration-ownership.md`. Do not use `prisma migrate`
to apply these changes or apply them to Production.
Pending or failed records are never listed or delivered; no automatic object
deletion is performed. Operations must monitor pending rows and use an approved
orphan cleanup process after verifying object references.

For local browser testing, configure the existing private bucket and AWS profile,
ensure the bucket CORS configuration permits `http://localhost:5173` and the
deployed VISTA web origin, then run:

```bash
# Terminal 1: Education API (after setting its existing DB/Auth variables and
# LEARNING_MEDIA_BUCKET/AWS_REGION in services/education-api/.env)
cd services/education-api
npm run start:dev
```

```bash
# Terminal 2: VISTA web (after configuring web/robot-edu/.env)
cd web/robot-edu
npm run dev -- --host 0.0.0.0
```

```bash
# Backend checks (run from the repository root)
cd services/education-api
npx jest src/modules/learning/learning-media.service.spec.ts src/modules/learning/activity-content.schema.spec.ts --runInBand
npx prisma validate --schema prisma/schema.prisma
npm run build
```

```bash
# Frontend checks (run from the repository root)
cd web/robot-edu
npx vitest run src/components/authoring/ActivityEditorPanel.spec.tsx src/components/authoring/LearningMediaPreviewModal.spec.tsx
npm run build
```

Real upload testing requires a non-Production bucket, an AWS identity with the
scoped S3 actions, an isolated DB with the approved curriculum and media SQL
migrations applied, and the web origin in bucket CORS. The optional
`docker-compose.education-test.yml` definition uses tmpfs and binds only to
loopback; `.env.test.example` contains local-only credentials and no Production
secrets. See `docs/operations/course-builder-database-testing.md`. The pending
release manifest means database migration readiness is **not verified** by the
application build.

## Student login and first setup

Students sign in with a school code, student code, and password. The API resolves
those codes to the stable VISTA user and authenticates against Supabase Auth.
Supabase owns passwords and sessions; VISTA stores neither. `users.email` is
optional contact/recovery information and is never the student-facing login ID.
The Supabase login alias is derived directly from the stable VISTA `users.id`;
the alias is never returned as contact data.

Student imports return a school code and newly issued one-time setup codes to
the authorized school administrator. Setup codes are generated from CSPRNG
bytes, stored only as SHA-256 hashes, expire after seven days, and are consumed
atomically when the student sets a password. Re-imports do not rotate a live
code; re-import after expiration issues a replacement. The plaintext is held
only in the import response/UI until the dialog closes. Students must set a
password of at least 12 characters.

The Prisma changes are in `prisma/schema.prisma`, with an existing-database
migration in `prisma/migrations/20261104000000_student_code_auth/migration.sql`:

- `organizations.school_code` is unique and nullable until the first student
  import allocates one.
- Student aliases derive from `users.id`; there is no separate login identifier
  column and no local password hash.
- Student codes are unique within an organization.
- `auth_tokens.purpose` now permits `student_setup`.

The follow-up migration drops the previously introduced `auth_identifier`
column. After applying all migrations, run `npm run migrate:student-login-aliases`
once with server-only `SUPABASE_SERVICE_ROLE_KEY` configuration. It updates
linked student identities to aliases derived from `users.id`, preserving their
Supabase passwords and VISTA contact email values. The script is safe to rerun.
Existing pending, unlinked students receive setup codes when their student rows
are re-imported.

Student login/setup endpoints are rate-limited to 10 attempts per IP per minute
per API process and require HTTPS in production. Production deployments must
terminate TLS at the API or one trusted reverse proxy, set `TRUST_PROXY=1` for
that proxy, and restrict direct API access. For horizontally scaled deployments, replace the in-memory limiter
with a shared store. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; only
`SUPABASE_ANON_KEY` is used for the password grant.
