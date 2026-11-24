#!/bin/bash
set -euo pipefail
source /etc/vista-deploy.conf
IMAGE="${1:?Pass exact ECR image URI with SHA tag}"
case "$IMAGE" in
  *".dkr.ecr.${AWS_REGION}.amazonaws.com/"*:*) ;;
  *) echo 'Rejected image URI outside configured ECR region' >&2; exit 2 ;;
esac
REGISTRY="${IMAGE%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
docker pull "$IMAGE" >/dev/null
umask 077
trap 'rm -f /opt/vista/env.json' EXIT
aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --region "$AWS_REGION" --query SecretString --output text > /opt/vista/env.json
python3 - <<'PY'
import json
import os
from pathlib import Path
data = json.loads(Path('/opt/vista/env.json').read_text())
if not isinstance(data, dict):
    raise SystemExit('Secret must be a JSON object')
required = {'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WEB_ORIGIN'}
if not required.issubset(data):
    raise SystemExit('Required secret keys are missing')
# The API must connect as the restricted runtime role (plain or Supabase pooler form `vista_app_runtime.<project_ref>`), never as the owner/migration role
# or the backup reader. The message never echoes the URL.
import re
from urllib.parse import unquote, urlsplit
database_url = data.get('DATABASE_URL')
user = unquote(urlsplit(database_url).username or '') if isinstance(database_url, str) else ''
# Rollback (vista-rollback-api sets VISTA_ROLLBACK=1) must always be possible, also to an image that predates the runtime role.
if os.environ.get('VISTA_ROLLBACK') != '1' and not re.fullmatch(r'vista_app_runtime(\.[a-z0-9]{20})?', user):
    raise SystemExit('DATABASE_URL must connect as the restricted runtime role vista_app_runtime (pooler form vista_app_runtime.<project_ref>); refusing to deploy')
if os.environ.get('VISTA_ROLLBACK') != '1':
    # The Education API refuses to start in production without these (production-config.ts, learning-media.storage.ts); fail before the image is started.
    if data.get('DATABASE_RUNTIME_ROLE') != 'vista_app_runtime':
        raise SystemExit('Secret key DATABASE_RUNTIME_ROLE must be vista_app_runtime; refusing to deploy')
    if not str(data.get('LEARNING_MEDIA_BUCKET', '')).strip() or not str(data.get('AWS_REGION', '')).strip():
        raise SystemExit('Secret keys LEARNING_MEDIA_BUCKET and AWS_REGION are required for Learning Media uploads; refusing to deploy')
    if 'skynex.best' not in str(data.get('WEB_ORIGIN', '')):
        raise SystemExit('WEB_ORIGIN must include the production web origin https://skynex.best; refusing to deploy')
lines = []
for key, value in data.items():
    if not key.replace('_', '').isalnum() or not key[0].isalpha() or not isinstance(value, str) or '\n' in value or '\r' in value:
        raise SystemExit('Invalid environment entry')
    lines.append(f'{key}={value}')
lines.append('NODE_ENV=production')
lines.append('PORT=3000')
Path('/opt/vista/api.env').write_text('\n'.join(lines) + '\n')
PY
rm -f /opt/vista/env.json
PREVIOUS="$(docker inspect --format '{{.Config.Image}}' vista-education-api 2>/dev/null || true)"
start_container() {
  docker stop --time 30 vista-education-api >/dev/null 2>&1 || true
  docker rm vista-education-api >/dev/null 2>&1 || true
  docker run -d --name vista-education-api --restart unless-stopped \
    --env-file /opt/vista/api.env --log-driver awslogs \
    --log-opt "awslogs-region=$AWS_REGION" --log-opt "awslogs-group=$LOG_GROUP" \
    -p 127.0.0.1:3000:3000 "$1" >/dev/null
  for attempt in $(seq 1 30); do
    if curl --silent --show-error --fail --max-time 3 http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
# Optional sidecars, selected by flags in the secret-derived /opt/vista/api.env. Both default to OFF, in which case any old sidecar
# container is simply removed. A sidecar problem is reported but never fails or rolls back the API deployment.
env_flag() { grep -qE "^$1=true\$" /opt/vista/api.env 2>/dev/null; }
start_iot_worker() {
  docker rm -f vista-iot-feedback-worker >/dev/null 2>&1 || true
  env_flag VISTA_IOT_FEEDBACK_WORKER_ENABLED || return 0
  docker run -d --name vista-iot-feedback-worker --restart unless-stopped --memory 384m \
    --env-file /opt/vista/api.env --log-driver awslogs \
    --log-opt "awslogs-region=$AWS_REGION" --log-opt "awslogs-group=$LOG_GROUP" --log-opt awslogs-stream=iot-feedback-worker \
    "$1" node dist/scripts/iot-feedback-worker.js >/dev/null || return 1
  sleep 5
  [ "$(docker inspect --format '{{.State.Running}}' vista-iot-feedback-worker 2>/dev/null)" = true ]
}
# The Digital Twin image lives in the same ECR repository under the tag twin-<commit>; its host port is loopback only (nginx upgrades /ws/).
start_twin() {
  docker rm -f vista-digital-twin >/dev/null 2>&1 || true
  env_flag VISTA_TWIN_ENABLED || return 0
  local twin_image="${1%:*}:twin-${1##*:}" secret
  docker pull "$twin_image" >/dev/null 2>&1 || { echo "Digital Twin image $twin_image is not available; Twin not started" >&2; return 1; }
  secret="$(grep -m1 '^DIGITAL_TWIN_SCOPE_SECRET=' /opt/vista/api.env | cut -d= -f2-)"
  [ -n "$secret" ] || { echo 'DIGITAL_TWIN_SCOPE_SECRET is missing; Twin not started' >&2; return 1; }
  # The API only sends telemetry to `http://vista-digital-twin:8767` (see digital-twin-endpoint.ts): both containers join one private network.
  docker network inspect vista-net >/dev/null 2>&1 || docker network create vista-net >/dev/null
  docker network connect vista-net vista-education-api >/dev/null 2>&1 || true
  mkdir -p /opt/vista/twin-model
  (umask 077; printf 'VISTA_TWIN_AUTH_SECRET=%s\n' "$secret" > /opt/vista/twin.env)
  docker run -d --name vista-digital-twin --network vista-net --restart unless-stopped --read-only --tmpfs /tmp --cap-drop ALL \
    --security-opt no-new-privileges --memory 768m --env-file /opt/vista/twin.env -v /opt/vista/twin-model:/model:ro \
    --log-driver awslogs --log-opt "awslogs-region=$AWS_REGION" --log-opt "awslogs-group=$LOG_GROUP" --log-opt awslogs-stream=digital-twin \
    -p 127.0.0.1:8767:8767 "$twin_image" >/dev/null
  rm -f /opt/vista/twin.env
  for attempt in $(seq 1 20); do
    if curl --silent --fail --max-time 3 http://127.0.0.1:8767/health >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}
start_sidecars() {
  start_iot_worker "$1" || echo 'IoT feedback worker did not start; the API deployment is unaffected' >&2
  start_twin "$1" || echo 'Digital Twin did not start; the API deployment is unaffected' >&2
}

if start_container "$IMAGE"; then
  printf '%s\n' "$IMAGE" > /opt/vista/current-image
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$IMAGE" ]; then printf '%s\n' "$PREVIOUS" > /opt/vista/previous-image; fi
  start_sidecars "$IMAGE"
  echo "Deployment healthy: $IMAGE"
else
  echo "Health check failed for $IMAGE" >&2
  if [ -n "$PREVIOUS" ] && start_container "$PREVIOUS"; then
    printf '%s\n' "$PREVIOUS" > /opt/vista/current-image
    start_sidecars "$PREVIOUS"
    echo "Rolled back to $PREVIOUS" >&2
  fi
  exit 1
fi
