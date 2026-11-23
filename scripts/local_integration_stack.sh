#!/usr/bin/env bash
# Disposable, loopback-only VISTA integration stack: PostgreSQL 17 (tmpfs) + RustFS S3 + Education API.
# Never contacts or mutates Production, AWS or hosted Supabase. Auth is the repo's local JWKS signer (Playwright starts it);
# for the real-GoTrue student-auth harness see docs/operations/student-temp-password.md.
#   scripts/local_integration_stack.sh up      # containers + bootstrap + runtime role + fixtures + API on :3001
#   scripts/local_integration_stack.sh down
set -euo pipefail
cd "$(dirname "$0")/.."
PG=vista-int-pg; S3=vista-int-s3; PGPORT=55497; DB=vista_test_int
ENV_FILE=/tmp/vista-int-api.env
case "${1:-}" in
down)
  for p in $(pgrep -f '^node dist/main' || true); do kill "$p" 2>/dev/null || true; done
  rm -f /tmp/vista-*-fixture-int.json
  docker rm -f "$PG" "$S3" >/dev/null 2>&1 || true; exit 0;;
up) ;;
*) echo "usage: $0 up|down" >&2; exit 2;;
esac
for p in $(pgrep -f '^node dist/main' || true); do kill "$p" 2>/dev/null || true; done
rm -f /tmp/vista-phase243-fixture-int.json /tmp/vista-wf03-e2e-fixture-int.json
docker rm -f "$PG" "$S3" >/dev/null 2>&1 || true
docker run -d --name "$PG" --tmpfs /var/lib/postgresql/data -e POSTGRES_USER=vista_test -e POSTGRES_PASSWORD=intpw -e POSTGRES_DB=$DB -p 127.0.0.1:$PGPORT:5432 postgres:17 >/dev/null
docker run -d --name "$S3" --tmpfs /data:size=1g,uid=10001,gid=10001,mode=700 --tmpfs /logs:uid=10001,gid=10001,mode=700 \
  -e RUSTFS_ACCESS_KEY=vista_media_test -e RUSTFS_SECRET_KEY=vista_media_test_only_password -p 127.0.0.1:59000:9000 rustfs/rustfs:latest >/dev/null
sleep 8
export VISTA_DATABASE_PROJECT_REF=local-int VISTA_DEV_DATABASE_URL="postgresql://vista_test:intpw@127.0.0.1:$PGPORT/$DB"
python3 scripts/bootstrap_dev_database.py --confirm-local-bootstrap >/dev/null
# Staged hardening M (revoke PUBLIC TEMP): not part of the release manifest and not approved for Production. Like the CI bootstrap workflow,
# apply it to this disposable database only (the script refuses anything but a loopback vista_test_* database) so local runs match the hardened schema.
for staged in 20261116_m_revoke_public_temp_privilege 20261120_r_device_provisioning; do
  [ -f "database/staged-migrations/$staged.sql" ] && python3 scripts/apply_staged_migration_to_test_database.py --database-url "postgresql://vista_test:intpw@127.0.0.1:$PGPORT/$DB" "database/staged-migrations/$staged.sql" >/dev/null
done
docker exec "$PG" psql -U vista_test -d $DB -c "ALTER ROLE vista_app_runtime WITH LOGIN PASSWORD 'rtpw_local'" >/dev/null
export AWS_ACCESS_KEY_ID=vista_media_test AWS_SECRET_ACCESS_KEY=vista_media_test_only_password AWS_DEFAULT_REGION=us-east-1; unset AWS_PROFILE
aws --endpoint-url http://127.0.0.1:59000 s3 mb s3://vista-wf03-e2e-int >/dev/null
aws --endpoint-url http://127.0.0.1:59000 s3api put-bucket-cors --bucket vista-wf03-e2e-int --cors-configuration '{"CORSRules":[{"AllowedOrigins":["*"],"AllowedMethods":["GET","POST","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"]}]}'
cat > "$ENV_FILE" <<EOT
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://vista_app_runtime:rtpw_local@127.0.0.1:$PGPORT/$DB?sslmode=disable
VISTA_DATABASE_PROJECT_REF=local-int
SUPABASE_URL=http://127.0.0.1:54323
SUPABASE_SERVICE_ROLE_KEY=local-int-service-role-not-a-secret
SUPABASE_ANON_KEY=local-int-anon-key-not-a-secret
DEVICE_PROVISIONING_ENABLED=true
DEVICE_AUTH_LIMIT_PER_MINUTE=40
DEVICE_TOKEN_SECRET=local-int-device-token-secret-not-a-secret-0123456789
STUDENT_TEMP_PASSWORD_ENABLED=true
SUPABASE_JWT_ISSUER=http://127.0.0.1:54323/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
WEB_ORIGIN=http://127.0.0.1:4173
LEARNING_MEDIA_BUCKET=vista-wf03-e2e-int
LEARNING_MEDIA_S3_ENDPOINT=http://127.0.0.1:59000
LEARNING_MEDIA_S3_ACCESS_KEY=vista_media_test
LEARNING_MEDIA_S3_SECRET_KEY=vista_media_test_only_password
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=vista_media_test
AWS_SECRET_ACCESS_KEY=vista_media_test_only_password
DIGITAL_TWIN_SCOPE_SECRET=twsecret_local
DIGITAL_TWIN_TELEMETRY_URL=http://127.0.0.1:8767
# The test runner talks to the API directly over reused connections; Node's 5 s idle timeout would reset a request that lands as the socket closes.
HTTP_KEEP_ALIVE_TIMEOUT_MS=65000
# Course prerequisites: enforced for enrolments created from this instant (fixture enrolments are created later, so they are enforced; E2E backdates enrolled_at to exercise grandfathering).
COURSE_PREREQUISITES_ENFORCED_FROM=2026-01-01T00:00:00Z
EOT
(cd services/education-api && npm run build >/dev/null && \
  export VISTA_E2E_ADMIN_DATABASE_URL="postgresql://vista_test:intpw@127.0.0.1:$PGPORT/$DB?sslmode=disable" VISTA_TEST_DATABASE_NAME=$DB VISTA_TEST_DATABASE_PORT=$PGPORT VISTA_DATABASE_PROJECT_REF=local-int SUPABASE_URL=http://127.0.0.1:54323 \
         LEARNING_MEDIA_S3_ENDPOINT=http://127.0.0.1:59000 LEARNING_MEDIA_BUCKET=vista-wf03-e2e-int AWS_REGION=us-east-1 && \
  VISTA_E2E_FIXTURE_FILE=/tmp/vista-phase243-fixture-int.json node dist/scripts/phase243-e2e-fixtures.js seed >/dev/null && \
  VISTA_E2E_FIXTURE_FILE=/tmp/vista-wf03-e2e-fixture-int.json node dist/scripts/wf03-local-e2e-fixtures.js seed >/dev/null && \
  VISTA_SEED_ADMIN_USER_ID=f2430000-0000-4000-8000-000000000001 node dist/scripts/seed-so101-curriculum.js >/dev/null && \
  (set -a; . "$ENV_FILE"; set +a; nohup node dist/main.js >/tmp/vista-int-api.log 2>&1 &) )
# fresh stack per full acceptance run: several specs enroll fixture students, and the WF-03 fixture is single-use
sleep 7; curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null && echo "stack up: API http://127.0.0.1:3001/api/v1, fixtures /tmp/vista-{phase243,wf03-e2e}-fixture-int.json, env $ENV_FILE"
