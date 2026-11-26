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
if [ "$1" = run ]; then prev=""; for a in "$@"; do [ "$prev" = "--env-file" ] && cp "$a" "${STUB_LOG}.env.$(basename "$a")" 2>/dev/null; prev="$a"; done; fi
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
[ "$(grep -c 'docker rm -f' "$WORK/log")" = 3 ] || fail "old sidecars must be removed when the flags are off"

run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=s3cret-value\n' "$IMG"
grep -q "docker pull ${IMG%:*}:twin-abc123" "$WORK/log" || fail "twin image tag must be twin-<commit> in the same repository"
grep -qE 'docker run .*--read-only .*--cap-drop ALL .*--memory 768m' "$WORK/log" || fail "twin must run read-only, without capabilities, with a memory cap"
grep -q -- '-p 127.0.0.1:8767:8767' "$WORK/log" || fail "twin port must be loopback only"
grep -q 'docker network connect vista-net vista-education-api' "$WORK/log" || fail "the API must join the private twin network"
grep -q -- '--name vista-digital-twin --network vista-net' "$WORK/log" || fail "the twin must run on the private network"
grep -q 'iot-feedback-worker' "$WORK/log" && grep -q 'docker run.*iot-feedback' "$WORK/log" && fail "worker must stay off"
[ ! -e "$WORK/opt/twin.env" ] || fail "twin.env (it holds the secret) must be removed after start"
grep -q 's3cret-value' "$WORK/log" && fail "the secret must never appear on a command line"

run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\n' "$IMG"; : > "$WORK/log"
( export STUB_PULL_FAIL=1; run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\n' "$IMG" ); 
grep -q 'docker run.*digital-twin' "$WORK/log" && fail "a missing twin image must not start a container"
grep -q 'not available' "$WORK/err" || fail "a missing twin image must be reported"

run 'VISTA_IOT_FEEDBACK_WORKER_ENABLED=true\n' "$IMG"
grep -qE 'docker run .*--memory 384m .*--no-healthcheck --entrypoint node .*dist/scripts/iot-feedback-worker.js' "$WORK/log" || fail "worker command"
run 'VISTA_RECORDINGS_WORKER_ENABLED=true\n' "$IMG"
grep -qE 'docker run .*--memory 384m .*--no-healthcheck --entrypoint node .*dist/scripts/robot-recordings-worker.js' "$WORK/log" || fail "recordings worker command"
run 'X=1\n' "$IMG"; grep -q 'docker rm -f vista-recordings-worker' "$WORK/log" || fail "an old recordings worker must be removed when the flag is off"
# The telemetry relay (feedback worker) must be on the private twin network.
run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\nVISTA_IOT_FEEDBACK_WORKER_ENABLED=true\n' "$IMG"
grep -q 'docker network connect vista-net vista-iot-feedback-worker' "$WORK/log" || fail "the feedback worker (telemetry relay) must join the private twin network"
run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\n' "$IMG"
grep -q 'docker run.*iot-feedback' "$WORK/log" && fail "no worker may start when its flag is off"
# Twin settings pass-through: only the whitelisted VISTA_TWIN_* keys with plain values reach twin.env, never anything else from api.env.
run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=s3cret-value\nDATABASE_URL=postgres://u:p@h/db\nVISTA_TWIN_PHYSICAL_OWNER_ID=owner-1\nVISTA_TWIN_PHYSICAL_ORGANIZATION_ID=597cd591-ba63-4a27-af5d-12fede921fad\nVISTA_TWIN_PHYSICAL_ROBOT_ID=f1c066c4-b5f2-45c4-b933-f034f3824dd9\nVISTA_TWIN_RELAY_STALE_AFTER_SECONDS=3.0\nVISTA_TWIN_MAX_MEASUREMENT_AGE_SECONDS=5.0\nVISTA_TWIN_PHYSICAL_FOLLOWER_ID=bad value;rm -rf\n' "$IMG"
CAP="$WORK/log.env.twin.env"; [ -f "$CAP" ] || fail "the twin env file must have been passed to docker run"
grep -q '^VISTA_TWIN_AUTH_SECRET=s3cret-value$' "$CAP" || fail "twin auth secret"
for kv in VISTA_TWIN_PHYSICAL_OWNER_ID=owner-1 VISTA_TWIN_PHYSICAL_ORGANIZATION_ID=597cd591-ba63-4a27-af5d-12fede921fad VISTA_TWIN_PHYSICAL_ROBOT_ID=f1c066c4-b5f2-45c4-b933-f034f3824dd9 VISTA_TWIN_RELAY_STALE_AFTER_SECONDS=3.0 VISTA_TWIN_MAX_MEASUREMENT_AGE_SECONDS=5.0; do grep -q "^$kv\$" "$CAP" || fail "twin env must contain $kv"; done
grep -q 'DATABASE_URL' "$CAP" && fail "twin.env must never receive unrelated secrets"
grep -q 'VISTA_TWIN_PHYSICAL_FOLLOWER_ID' "$CAP" && fail "a value with spaces or shell metacharacters must be ignored"
run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\n' "$IMG"; rm -f "$WORK/log.env.twin.env"; run 'VISTA_TWIN_ENABLED=true\nDIGITAL_TWIN_SCOPE_SECRET=x\n' "$IMG"
[ "$(wc -l < "$WORK/log.env.twin.env")" = 1 ] || fail "without Twin settings only the auth secret is passed (physical route stays disabled)"
echo "sidecar tests passed"
