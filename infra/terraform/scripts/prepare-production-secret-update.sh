#!/bin/bash
# Adds the robotics settings to the EXISTING Production API secret (vista/demo/education-api/env). Names come from the source code;
# values come from AWS (IoT endpoint, queue URL) or are generated here. NOTHING is printed except key names. Production MQTT command dispatch stays OFF.
#
#   ROBOT_ID=<robots.id uuid> ./prepare-production-secret-update.sh             dry run: key names and where each value comes from
#   ROBOT_ID=<uuid> ./prepare-production-secret-update.sh --execute             writes a NEW secret version (the previous one stays as AWSPREVIOUS) - needs explicit approval
# Existing keys are never overwritten (an existing DIGITAL_TWIN_SCOPE_SECRET is kept). Rollback:
#   aws secretsmanager update-secret-version-stage --secret-id vista/demo/education-api/env --version-stage AWSCURRENT \
#     --move-to-version-id <the AWSPREVIOUS version id> --remove-from-version-id <the new version id>
set -euo pipefail
SECRET_ID="vista/demo/education-api/env"; REGION="${AWS_REGION:-ap-southeast-1}"; ACCOUNT="${AWS_ACCOUNT_ID:-157098813811}"
ROBOT_ID="${ROBOT_ID:?set ROBOT_ID to the robots.id UUID the IoT root was applied with}"
[[ "$ROBOT_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] || { echo 'ROBOT_ID must be a lowercase UUID' >&2; exit 1; }
ENDPOINT="$(aws iot describe-endpoint --region "$REGION" --endpoint-type iot:Data-ATS --query endpointAddress --output text)"
QUEUE_URL="https://sqs.$REGION.amazonaws.com/$ACCOUNT/vista-demo-$ROBOT_ID-feedback"
CURRENT="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET_ID" --query SecretString --output text)"
PLAN="$(CURRENT="$CURRENT" ENDPOINT="$ENDPOINT" QUEUE_URL="$QUEUE_URL" RECORDINGS_BUCKET="vista-demo-robot-recordings-$ACCOUNT-sg" RECORDINGS_QUEUE_URL="https://sqs.$REGION.amazonaws.com/$ACCOUNT/vista-demo-$ROBOT_ID-recordings-events" EXECUTE="${1:-}" python3 - <<'PY'
import json, os, secrets
cur = json.loads(os.environ["CURRENT"])
wanted = {
  # Production MQTT command dispatch and publish recovery stay OFF until the runtime is accepted and the owner approves.
  "VISTA_IOT_ENABLED": ("false", "fixed: dispatch OFF"),
  "VISTA_IOT_PUBLISH_RECOVERY_ENABLED": ("false", "fixed: OFF"),
  "VISTA_IOT_DATA_ENDPOINT": (os.environ["ENDPOINT"], "aws iot describe-endpoint (iot:Data-ATS)"),
  "VISTA_IOT_TOPIC_PREFIX": ("vista/demo/robots", "IoT root topic prefix"),
  "VISTA_IOT_COMMAND_TTL_MS": ("10000", "default"),
  "VISTA_IOT_FEEDBACK_WORKER_ENABLED": ("true", "starts the worker sidecar; idle while no device publishes"),
  "VISTA_IOT_FEEDBACK_QUEUE_URL": (os.environ["QUEUE_URL"], "SQS queue of the IoT root"),
  "VISTA_IOT_FEEDBACK_WORKER_CONCURRENCY": ("2", "default"),
  "VISTA_IOT_FEEDBACK_VISIBILITY_SECONDS": ("90", "matches the queue visibility timeout"),
  "ROBOT_RECORDINGS_BUCKET": (os.environ["RECORDINGS_BUCKET"], "Robot Recordings bucket of the IoT root"),
  "ROBOT_RECORDINGS_EVENTS_QUEUE_URL": (os.environ["RECORDINGS_QUEUE_URL"], "episode-events queue of the IoT root"),
  "VISTA_RECORDINGS_WORKER_ENABLED": ("true", "starts the recordings worker sidecar; idle until an episode manifest arrives"),
  "VISTA_TWIN_ENABLED": ("true", "deploy flag: starts the Digital Twin sidecar"),
  "DIGITAL_TWIN_TELEMETRY_URL": ("http://vista-digital-twin:8767", "private Docker network name (digital-twin-endpoint.ts)"),
  "DIGITAL_TWIN_SCOPE_SECRET": (secrets.token_urlsafe(48) if os.environ["EXECUTE"] == "--execute" else "<generated, 48 random bytes>", "generated here, never printed"),
}
added, kept = [], []
for key, (value, source) in wanted.items():
    (kept if key in cur else added).append((key, value, source))
    if key not in cur: cur[key] = value
print(json.dumps({"added": [(k, s) for k, _v, s in added], "kept_existing": [k for k, _v, _s in kept], "new": json.dumps(cur) if os.environ["EXECUTE"] == "--execute" else None}))
PY
)"
echo "$PLAN" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("secret keys that would be ADDED:"); [print("  +", k, "<-", s) for k, s in d["added"]]; print("kept (already present):", d["kept_existing"] or "none")'
if [ "${1:-}" != "--execute" ]; then echo "dry run only; pass --execute with explicit approval"; exit 0; fi
echo "$PLAN" | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin)["new"])' > /dev/shm/vista-secret-new.json
trap 'shred -u /dev/shm/vista-secret-new.json 2>/dev/null || rm -f /dev/shm/vista-secret-new.json' EXIT
aws secretsmanager put-secret-value --region "$REGION" --secret-id "$SECRET_ID" --secret-string "file:///dev/shm/vista-secret-new.json" --query VersionId --output text | sed 's/^/new secret version: /'
