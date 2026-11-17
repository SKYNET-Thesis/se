# Local Education API and Web development

This guide starts the Education API and Robot Education Web using a disposable PostgreSQL 17 database. It
does not connect to Production or require Production database credentials. Authenticated journeys need a
dedicated local or non-Production Supabase Auth endpoint; the application database remains local.

## Requirements

- Node.js 22 or newer and npm.
- Docker Engine with the Compose plugin.
- Python 3 and `psql` 18 or newer (the checked-in schema baseline uses `\restrict`).

From a clean clone:

```sh
git clone https://github.com/SKYNET-Thesis/se.git
cd se
sh scripts/setup-dev.sh
```

The setup script runs `npm ci` in the Education API and Web directories, using their checked-in lockfiles.

## Start an isolated local database

Choose a fresh project name, database name, and free loopback port. This example selects a free port and
generates disposable passwords. The Compose service has no persistent volume and stores data in tmpfs.

```sh
export VISTA_LOCAL_SUFFIX="$(date -u +%Y%m%d%H%M%S)"
export VISTA_LOCAL_DB_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
export VISTA_LOCAL_DB_NAME="vista_test_local_${VISTA_LOCAL_SUFFIX}"
export VISTA_LOCAL_DB_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
export VISTA_LOCAL_RUNTIME_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
export VISTA_DATABASE_PROJECT_REF="local-${VISTA_LOCAL_SUFFIX}"
export VISTA_LOCAL_COMPOSE_PROJECT="vista-education-${VISTA_LOCAL_SUFFIX}"

docker compose -p "$VISTA_LOCAL_COMPOSE_PROJECT" -f docker-compose.education-local.yml up -d --wait
```

Before bootstrap, verify the target is the just-created container, bound only to `127.0.0.1`, running
PostgreSQL 17, with tmpfs storage and no mounts. Confirm the database/user identity before writing:

```sh
docker compose -p "$VISTA_LOCAL_COMPOSE_PROJECT" -f docker-compose.education-local.yml ps
docker compose -p "$VISTA_LOCAL_COMPOSE_PROJECT" -f docker-compose.education-local.yml exec -T education-local-postgres \
  psql -U vista_test -d "$VISTA_LOCAL_DB_NAME" -Atc 'select current_database(), current_user, version()'
```

Bootstrap the checked-in schema using the repository runner. It restores the schema-only historical baseline,
applies the manifest migrations D–M to this disposable database, verifies the ledger and schema fingerprint,
and confirms there is no pending migration:

```sh
export VISTA_DEV_DATABASE_URL="postgresql://vista_test:${VISTA_LOCAL_DB_PASSWORD}@127.0.0.1:${VISTA_LOCAL_DB_PORT}/${VISTA_LOCAL_DB_NAME}?sslmode=disable"
unset SUPABASE_URL
python3 scripts/bootstrap_dev_database.py --confirm-local-bootstrap
python3 scripts/bootstrap_dev_database.py --verify-only
```

The expected fresh PostgreSQL 17 inventory is pinned in `database/baselines/dev-schema-expectation.json`.
The local bootstrap does not establish that K–M are approved or compatible with hosted Supabase.

Migration L creates `vista_app_runtime` without a password. Set a random local password only inside this
disposable database; this command changes no shared or hosted role:

```sh
export VISTA_LOCAL_RUNTIME_PASSWORD
psql "$VISTA_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\getenv runtime_password VISTA_LOCAL_RUNTIME_PASSWORD
ALTER ROLE vista_app_runtime PASSWORD :'runtime_password';
SQL
```

## Configure and start the Education API

Create the ignored API `.env` file with the verified local database URLs. Keep the `vista_app_runtime` URL
for normal API execution; use the local `vista_test` writer URL only for Prisma tooling and local seed scripts.

```sh
cat > services/education-api/.env <<EOF
NODE_ENV=development
PORT=3001
WEB_ORIGIN=http://127.0.0.1:5173
DATABASE_RUNTIME_ROLE=vista_app_runtime
DATABASE_URL=postgresql://vista_app_runtime:${VISTA_LOCAL_RUNTIME_PASSWORD}@127.0.0.1:${VISTA_LOCAL_DB_PORT}/${VISTA_LOCAL_DB_NAME}?sslmode=disable
DIRECT_URL=${VISTA_DEV_DATABASE_URL}
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1
SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json
SUPABASE_JWT_AUDIENCE=authenticated
MQTT_ENABLED=false
VISTA_IOT_ENABLED=false
VISTA_IOT_PUBLISH_RECOVERY_ENABLED=false
VISTA_IOT_FEEDBACK_WORKER_ENABLED=false
EOF
unset VISTA_LOCAL_RUNTIME_PASSWORD

cd services/education-api
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npm run build
npm run start:dev
```

In another terminal, verify the API health check:

```sh
curl --fail --show-error http://127.0.0.1:3001/api/v1/health
```

The health route checks PostgreSQL connectivity. It does not prove Supabase Auth connectivity or an
authenticated user journey.

## Start the Web

Create `web/robot-edu/.env.local` with browser-safe values only. Do not put database URLs or service-role keys
in Vite variables:

```sh
cat > web/robot-edu/.env.local <<'EOF'
VITE_API_BASE_URL=http://127.0.0.1:3001/api/v1
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=replace-with-local-or-non-production-anon-key
EOF

cd web/robot-edu
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Verify the Vite page responds at <http://127.0.0.1:5173/>. Sign-in requires a running local Supabase Auth
stack or credentials for a dedicated non-Production Supabase Auth project. The Education API's
`DATABASE_URL` must continue to point to the disposable local PostgreSQL database.

## Demo data and fixtures

The empty bootstrap contains schema and baseline role rows, not demo users or Course 1 content. The seed
scripts have prerequisites:

- `npm run seed:demo-identities` calls the Supabase Auth Admin API. It requires a dedicated non-Production
  Auth endpoint, its service-role key, and four `VISTA_DEMO_*_PASSWORD` values. It also expects the auth
  provisioning trigger to create matching `public.users` rows. Do not use Production Auth credentials.
- `npm run seed:demo-delivery` expects the demo admin, instructor, and student rows and creates demo
  school/classroom/assignment data in the configured database.
- `npm run seed:demo-school-admin` expects the demo school-admin identity and the `VISTA Academy`
  organization created by demo delivery.
- `npm run seed:course1` requires `COURSE1_ORGANIZATION_ID` and `COURSE1_CREATED_BY_USER_ID` for rows that
  already exist in the local database.
- E2E fixtures require a separately configured `.env.test.local` and verified disposable test database;
  see `docs/operations/course-builder-database-testing.md`.

## Stop and discard the local database

Stop the API and Web with Ctrl-C. Remove only the Compose project created above; its database files are
ephemeral tmpfs data:

```sh
docker compose -p "$VISTA_LOCAL_COMPOSE_PROJECT" -f docker-compose.education-local.yml down
```

Do not use the root `docker-compose.yml` as the Education quickstart. It starts a separate legacy stack with
PostgreSQL 16 and a persistent volume.
