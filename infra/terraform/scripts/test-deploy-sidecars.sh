#!/bin/bash
# Offline test of the sidecar logic in deploy-api.sh with a stub `docker`, `curl` and `sleep`: nothing real is started.
#   infra/terraform/scripts/test-deploy-sidecars.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/opt"
cat > "$WORK/bin/docker" <<'STUB'
#!/bin/bash
echo "docker $*" >> "$STUB_LOG"
case "$1" in inspect) echo true ;; pull) [ "${STUB_PULL_FAIL:-0}" = 1 ] && exit 1 || exit 0 ;; esac
exit 0
STUB
printf '#!/bin/bash\nexit 0\n' > "$WORK/bin/curl"; printf '#!/bin/bash\nexit 0\n' > "$WORK/bin/sleep"; chmod +x "$WORK/bin/"*
# the helper block of deploy-api.sh, with /opt/vista redirected into the sandbox
sed -n '/^env_flag()/,/^start_sidecars()/p' "$HERE/deploy-api.sh" | sed '$d' > "$WORK/helpers.sh"
sed -n '/^start_sidecars()/,/^}/p' "$HERE/deploy-api.sh" >> "$WORK/helpers.sh"
sed -i "s#/opt/vista#$WORK/opt#g" "$WORK/helpers.sh"
run() { # $1 = api.env content, $2 = image
  : > "$WORK/log"; printf '%b' "$1" > "$WORK/opt/api.env"
  ( export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log" AWS_REGION=ap-southeast-1 LOG_GROUP=lg; source "$WORK/helpers.sh"; start_sidecars "$2" ) 2>"$WORK/err" || true
}
IMG=157098813811.dkr.ecr.ap-southeast-1.amazonaws.com/vista/demo/education-api:abc123
fail() { echo "FAIL: $1" >&2; cat "$WORK/log" >&2; exit 1; }

run 'X=1\n' "$IMG"
grep -q 'docker run' "$WORK/log" && fail "default (flags off) must start nothing"
[ "$(grep -c 'docker rm -f' "$WORK/log")" = 2 ] || fail "old sidecars must be removed when the flags are off"

run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=s3cret-value\n' "$IMG"
grep -q "docker pull ${IMG%:*}:twin-abc123" "$WORK/log" || fail "twin image tag must be twin-<commit> in the same repository"
grep -qE 'docker run .*--read-only .*--cap-drop ALL .*--memory 768m' "$WORK/log" || fail "twin must run read-only, without capabilities, with a memory cap"
grep -q -- '-p 127.0.0.1:8767:8767' "$WORK/log" || fail "twin port must be loopback only"
grep -q 'iot-feedback-worker' "$WORK/log" && grep -q 'docker run.*iot-feedback' "$WORK/log" && fail "worker must stay off"
[ ! -e "$WORK/opt/twin.env" ] || fail "twin.env (it holds the secret) must be removed after start"
grep -q 's3cret-value' "$WORK/log" && fail "the secret must never appear on a command line"

run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\n' "$IMG"; : > "$WORK/log"
( export STUB_PULL_FAIL=1; run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\n' "$IMG" ); 
grep -q 'docker run.*digital-twin' "$WORK/log" && fail "a missing twin image must not start a container"
grep -q 'not available' "$WORK/err" || fail "a missing twin image must be reported"

run 'VISTA_IOT_FEEDBACK_WORKER_ENABLED=true\n' "$IMG"
grep -qE 'docker run .*--memory 384m .*node dist/scripts/iot-feedback-worker.js' "$WORK/log" || fail "worker command"
echo "sidecar tests passed"
