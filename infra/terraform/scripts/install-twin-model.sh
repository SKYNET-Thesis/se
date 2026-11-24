#!/bin/bash
# Installs the SO-101 MuJoCo model on the EXISTING Production EC2 instance (read-only mount for the Digital Twin container).
# The model is Apache-2.0 (The Robot Studio SO101 via MuJoCo Menagerie; LICENSE and README travel with it) and is not in the image or the repository.
#
#   ./install-twin-model.sh <model-dir>                       dry run: verifies the directory against MODEL_MANIFEST.sha256, prints the plan (no AWS call)
#   RECORDINGS_BUCKET=<bucket> ./install-twin-model.sh <model-dir> --execute
#                                                              stages one tarball in the private recordings bucket under ops/twin-model/, sends ONE
#                                                              SSM command (the host downloads it over a 15-minute presigned URL, verifies every checksum,
#                                                              swaps /opt/vista/twin-model atomically), then deletes the staged object. Needs explicit approval.
# Rollback: mv /opt/vista/twin-model.prev /opt/vista/twin-model (the previous copy is kept).
set -euo pipefail
DIR="${1:?model directory}"; MODE="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$HERE/../../../services/digital-twin/MODEL_MANIFEST.sha256"
INSTANCE_ID="${INSTANCE_ID:-i-0fa8cb318ce21afa5}"; REGION="${AWS_REGION:-ap-southeast-1}"
(cd "$DIR" && sha256sum --check --quiet "$MANIFEST") || { echo 'model directory does not match MODEL_MANIFEST.sha256; refusing' >&2; exit 1; }
test -f "$DIR/so101.xml" && test -f "$DIR/LICENSE" || { echo 'so101.xml or LICENSE missing; refusing' >&2; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
tar -C "$DIR" -czf "$TMP/model.tgz" .
SHA="$(sha256sum "$TMP/model.tgz" | cut -d' ' -f1)"; SIZE="$(stat -c %s "$TMP/model.tgz")"
echo "verified $(wc -l < "$MANIFEST") files against the manifest; tarball $SIZE bytes sha256 ${SHA:0:16}"
if [ "$MODE" != "--execute" ]; then echo "dry run only; pass --execute (and RECORDINGS_BUCKET) with explicit approval"; exit 0; fi
BUCKET="${RECORDINGS_BUCKET:?set RECORDINGS_BUCKET}"; KEY="ops/twin-model/$SHA.tgz"
aws s3 cp --region "$REGION" "$TMP/model.tgz" "s3://$BUCKET/$KEY" --only-show-errors
URL="$(aws s3 presign --region "$REGION" "s3://$BUCKET/$KEY" --expires-in 900)"
MANIFEST_B64="$(base64 -w0 "$MANIFEST")"
CMDS=(
  "set -euo pipefail" "umask 077"
  "rm -rf /tmp/twin-model.new /tmp/twin-model.tgz; mkdir -p /tmp/twin-model.new"
  "curl -fsS --max-time 120 -o /tmp/twin-model.tgz '$URL'"
  "test \"\$(sha256sum /tmp/twin-model.tgz | cut -d' ' -f1)\" = '$SHA'"
  "tar -xzf /tmp/twin-model.tgz -C /tmp/twin-model.new"
  "rm -f /tmp/twin-model.b64"
)
# the manifest travels in short pieces, like refresh-host-deploy-script.sh
for ((i = 0; i < ${#MANIFEST_B64}; i += 1500)); do CMDS+=("printf '%s' '${MANIFEST_B64:i:1500}' >> /tmp/twin-model.b64"); done
CMDS+=("base64 -d /tmp/twin-model.b64 > /tmp/twin-model.manifest")
CMDS+=("(cd /tmp/twin-model.new && sha256sum --check --quiet /tmp/twin-model.manifest)" "chmod -R a+rX /tmp/twin-model.new"
  "rm -rf /opt/vista/twin-model.prev; if [ -d /opt/vista/twin-model ]; then mv /opt/vista/twin-model /opt/vista/twin-model.prev; fi"
  "mv /tmp/twin-model.new /opt/vista/twin-model; rm -f /tmp/twin-model.tgz /tmp/twin-model.manifest /tmp/twin-model.b64"
  "test -f /opt/vista/twin-model/so101.xml && echo installed")
PARAMS="$(python3 -c 'import json,sys; print(json.dumps({"commands": sys.argv[1:]}))' "${CMDS[@]}")"
CID="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript --parameters "$PARAMS" --query Command.CommandId --output text)"
for _ in $(seq 1 40); do
  STATUS="$(aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || true)"
  [ "$STATUS" = Success ] || [ "$STATUS" = Failed ] || [ "$STATUS" = TimedOut ] && break; sleep 3
done
aws s3 rm --region "$REGION" "s3://$BUCKET/$KEY" --only-show-errors
echo "host install status: $STATUS"; [ "$STATUS" = Success ]
