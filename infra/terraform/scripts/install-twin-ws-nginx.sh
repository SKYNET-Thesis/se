#!/bin/bash
# Adds the Digital Twin WebSocket location to the EXISTING Production nginx over SSM. Reversible, nothing else is touched.
#
#   ./install-twin-ws-nginx.sh            dry run: validates the snippet and prints what would be done (no AWS call)
#   ./install-twin-ws-nginx.sh --execute  sends ONE SSM RunShellScript command (needs explicit Production approval)
#
# On the host: the include file is written, ONE include line is added after the Certbot ssl include of vista-api-public.conf, `nginx -t` must pass, then
# nginx is reloaded (a reload keeps existing connections). If `nginx -t` fails the previous config is restored and nothing is reloaded.
# Rollback: remove the include line and /etc/nginx/vista-twin-ws.inc (or restore the *.prev-<timestamp> copy), `nginx -t`, reload.
set -euo pipefail
INSTANCE_ID="${INSTANCE_ID:-i-0fa8cb318ce21afa5}"
REGION="${AWS_REGION:-ap-southeast-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INC="$HERE/nginx-twin-ws.inc"
grep -q 'proxy_pass http://127.0.0.1:8767;' "$INC" && ! grep -v '^#' "$INC" | grep -qE '0\.0\.0\.0|listen' || { echo 'snippet does not look right; refusing' >&2; exit 1; }
B64="$(base64 -w0 "$INC")"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
CONF=/etc/nginx/conf.d/vista-api-public.conf
CMDS=(
  "set -euo pipefail"
  "grep -q 'options-ssl-nginx.conf' $CONF"
  "if grep -q 'vista-twin-ws.inc' $CONF; then echo already-installed; exit 0; fi"
  "cp -p $CONF $CONF.prev-$TS"
  "printf '%s' '$B64' | base64 -d > /etc/nginx/vista-twin-ws.inc"
  "sed -i '/include \\/etc\\/letsencrypt\\/options-ssl-nginx.conf;/a\\    include /etc/nginx/vista-twin-ws.inc;' $CONF"
  "if nginx -t; then systemctl reload nginx; echo reloaded; else cp -p $CONF.prev-$TS $CONF; rm -f /etc/nginx/vista-twin-ws.inc; echo 'nginx -t failed; previous config restored' >&2; exit 1; fi"
)
echo "Would run on $INSTANCE_ID: ${#CMDS[@]} commands (snippet sha256 $(sha256sum "$INC" | cut -c1-16)); backup suffix .prev-$TS"
if [ "${1:-}" != "--execute" ]; then echo "dry run only; pass --execute with explicit approval"; exit 0; fi
PARAMS="$(python3 -c 'import json,sys; print(json.dumps({"commands": sys.argv[1:]}))' "${CMDS[@]}")"
aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript --parameters "$PARAMS" --query Command.CommandId --output text
