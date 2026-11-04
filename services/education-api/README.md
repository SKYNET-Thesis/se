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

## Student login and first setup

Students sign in with a school code, student code, and password. The API resolves
those codes to the stable VISTA user and authenticates against Supabase Auth.
Supabase owns passwords and sessions; VISTA stores neither. `users.email` is
optional contact/recovery information and is never the student-facing login ID.
`users.auth_identifier` is a stable opaque UUID used to form an internal,
non-routable Supabase login alias; the alias is never returned as contact data.

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
- `users.auth_identifier` is a stable, unique provider-login key, separate from
  contact email; the obsolete local `password_hash` field is removed.
- Student codes are unique within an organization.
- `auth_tokens.purpose` now permits `student_setup`.

After applying that migration, run `npm run migrate:student-auth-identifiers`
once with server-only `SUPABASE_SERVICE_ROLE_KEY` configuration. It assigns
opaque aliases to already-linked student identities while preserving their
Supabase passwords and VISTA contact email values. Existing pending, unlinked
students receive setup codes when their student rows are re-imported.

Student login/setup endpoints are rate-limited to 10 attempts per IP per minute
per API process and require HTTPS in production. Production deployments must
terminate TLS at the API or one trusted reverse proxy, set `TRUST_PROXY=1` for
that proxy, and restrict direct API access. For horizontally scaled deployments, replace the in-memory limiter
with a shared store. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; only
`SUPABASE_ANON_KEY` is used for the password grant.
