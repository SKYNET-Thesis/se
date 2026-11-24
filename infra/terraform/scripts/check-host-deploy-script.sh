#!/bin/bash
# Fails (before anything is replaced) when /usr/local/bin/vista-deploy-api on the instance is not the repository's deploy-api.sh.
# The host script runs as root and is changed only by the approved operator action refresh-host-deploy-script.sh, so CI never overwrites it;
# this check makes a stale host script a clear, early failure instead of a silent one.
#   check-host-deploy-script.sh <instance-id>
set -euo pipefail
INSTANCE_ID="${1:?instance id}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPECTED="$(sha256sum "$HERE/deploy-api.sh" | cut -d' ' -f1)"
CID="$(aws ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript --parameters 'commands=sha256sum /usr/local/bin/vista-deploy-api' --query Command.CommandId --output text)"
STATUS=""
for _attempt in $(seq 1 30); do
  STATUS="$(aws ssm get-command-invocation --command-id "$CID" --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || true)"
  case "$STATUS" in
    Success) break ;;
    Failed|Cancelled|TimedOut|DeliveryTimedOut|ExecutionTimedOut) echo "Could not read the host deploy script hash ($STATUS); nothing was deployed." >&2; exit 1 ;;
  esac
  sleep 5
done
[ "$STATUS" = Success ] || { echo 'Could not read the host deploy script hash in time; nothing was deployed.' >&2; exit 1; }
ACTUAL="$(aws ssm get-command-invocation --command-id "$CID" --instance-id "$INSTANCE_ID" --query StandardOutputContent --output text | cut -d' ' -f1)"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "The deploy script on the host (${ACTUAL:0:12}) differs from the repository (${EXPECTED:0:12}). Nothing was deployed." >&2
  echo "Run infra/terraform/scripts/refresh-host-deploy-script.sh --execute (needs owner approval), then re-run the deployment." >&2
  exit 1
fi
echo "Host deploy script matches the repository (${EXPECTED:0:12})."
