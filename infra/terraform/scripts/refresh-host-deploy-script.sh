#!/bin/bash
# Refreshes /usr/local/bin/vista-deploy-api and /usr/local/bin/vista-rollback-api on the EXISTING Production EC2 instance over SSM.
# Why: the deploy workflow only RUNS the host scripts; Terraform ignores user_data changes (the instance must never be replaced), so a change to
# deploy-api.sh reaches the running host only through this explicitly approved operator action.
#
#   ./refresh-host-deploy-script.sh            dry run: validates the repository script and prints what would be done (no AWS call)
#   ./refresh-host-deploy-script.sh --execute  sends ONE SSM RunShellScript command (needs explicit Production approval)
#
# Safety: the previous scripts are kept as *.prev-<timestamp>; the new script is written to a temp file, syntax-checked on the host (bash -n) and only then
# moved into place; nothing is restarted and the running API container is not touched. Rollback: mv the *.prev-<timestamp> files back.
set -euo pipefail
INSTANCE_ID="${INSTANCE_ID:-i-0fa8cb318ce21afa5}"
REGION="${AWS_REGION:-ap-southeast-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/deploy-api.sh"
bash -n "$SCRIPT"
grep -q "vista_app_runtime" "$SCRIPT" && grep -q "VISTA_ROLLBACK" "$SCRIPT" || { echo 'deploy-api.sh does not contain the expected guards; refusing' >&2; exit 1; }
SHA="$(sha256sum "$SCRIPT" | cut -d' ' -f1)"
B64="$(base64 -w0 "$SCRIPT")"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
CMDS=("set -euo pipefail" "umask 077" "rm -f /tmp/vista-deploy-api.b64 /tmp/vista-deploy-api.new")
for ((i = 0; i < ${#B64}; i += 1500)); do CMDS+=("printf '%s' '${B64:i:1500}' >> /tmp/vista-deploy-api.b64"); done
CMDS+=(
  "base64 -d /tmp/vista-deploy-api.b64 > /tmp/vista-deploy-api.new"
  "test \"\$(sha256sum /tmp/vista-deploy-api.new | cut -d' ' -f1)\" = '$SHA'"
  "bash -n /tmp/vista-deploy-api.new"
  "cp -p /usr/local/bin/vista-deploy-api /usr/local/bin/vista-deploy-api.prev-$TS"
  "cp -p /usr/local/bin/vista-rollback-api /usr/local/bin/vista-rollback-api.prev-$TS"
  "install -m 700 -o root -g root /tmp/vista-deploy-api.new /usr/local/bin/vista-deploy-api"
  "printf '%s\n' '#!/bin/bash' 'set -euo pipefail' 'IMAGE=\"\$(cat /opt/vista/previous-image)\"' 'VISTA_ROLLBACK=1 exec /usr/local/bin/vista-deploy-api \"\$IMAGE\"' > /tmp/vista-rollback-api.new"
  "install -m 700 -o root -g root /tmp/vista-rollback-api.new /usr/local/bin/vista-rollback-api"
  "rm -f /tmp/vista-deploy-api.b64 /tmp/vista-deploy-api.new /tmp/vista-rollback-api.new"
  "sha256sum /usr/local/bin/vista-deploy-api"
  "grep -c VISTA_ROLLBACK /usr/local/bin/vista-rollback-api"
)
if [ "${1:-}" = "--print" ]; then printf '%s\n' "${CMDS[@]}"; exit 0; fi
if [ "${1:-}" != "--execute" ]; then
  echo "DRY RUN (no AWS call). Instance $INSTANCE_ID region $REGION; new deploy-api.sh sha256 $SHA; ${#CMDS[@]} shell commands; backups suffix .prev-$TS"
  exit 0
fi
PARAMS="$(python3 -c 'import json,sys; print(json.dumps({"commands": sys.argv[1:]}))' "${CMDS[@]}")"
CID="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript --comment 'refresh VISTA host deploy scripts (approved operator action)' --parameters "$PARAMS" --query Command.CommandId --output text)"
echo "SSM command $CID sent; waiting"
aws ssm wait command-executed --region "$REGION" --command-id "$CID" --instance-id "$INSTANCE_ID" || true
aws ssm get-command-invocation --region "$REGION" --command-id "$CID" --instance-id "$INSTANCE_ID" --query '[Status,StandardOutputContent,StandardErrorContent]' --output text
