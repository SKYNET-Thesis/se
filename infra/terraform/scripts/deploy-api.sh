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
aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --region "$AWS_REGION" --query SecretString --output text > /opt/vista/env.json
python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path('/opt/vista/env.json').read_text())
if not isinstance(data, dict):
    raise SystemExit('Secret must be a JSON object')
required = {'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WEB_ORIGIN'}
if not required.issubset(data):
    raise SystemExit('Required secret keys are missing')
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
if start_container "$IMAGE"; then
  printf '%s\n' "$IMAGE" > /opt/vista/current-image
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$IMAGE" ]; then printf '%s\n' "$PREVIOUS" > /opt/vista/previous-image; fi
  echo "Deployment healthy: $IMAGE"
else
  echo "Health check failed for $IMAGE" >&2
  if [ -n "$PREVIOUS" ] && start_container "$PREVIOUS"; then
    printf '%s\n' "$PREVIOUS" > /opt/vista/current-image
    echo "Rolled back to $PREVIOUS" >&2
  fi
  exit 1
fi
