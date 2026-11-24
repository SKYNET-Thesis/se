#!/bin/bash
# Offline test of the real deploy-api.sh flow (stub docker/aws/curl): a new secret that an older image rejects must not break rollback.
#   infra/terraform/scripts/test-deploy-rollback.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/opt"
REG=157098813811.dkr.ecr.ap-southeast-1.amazonaws.com/vista/demo/education-api
printf 'AWS_REGION=ap-southeast-1\nSECRET_ID=s\nLOG_GROUP=lg\n' > "$WORK/conf"
# Image `bad` never becomes healthy; image `old` is healthy unless its environment contains INCOMPAT=1 (a setting it rejects, as in the incident).
cat > "$WORK/bin/docker" <<'STUB'
#!/bin/bash
case "$1" in
  login) cat > /dev/null ;;
  inspect) if [[ "$*" == *Config.Image* ]]; then cat "$W/running" 2>/dev/null || exit 1; else echo true; fi ;;
  rm) [ "$2" = vista-education-api ] && rm -f "$W/running" "$W/ok"; true ;;
  run)
    name=""; envf=""; prev=""
    for a in "$@"; do [ "$prev" = --name ] && name="$a"; [ "$prev" = --env-file ] && envf="$a"; prev="$a"; done
    if [ "$name" = vista-education-api ]; then
      image="${@: -1}"; echo "$image" > "$W/running"; echo "$(basename "$envf") $(grep -c '^INCOMPAT=1$' "$envf" || true)" >> "$W/starts"
      case "$image" in *:bad) echo 0 > "$W/ok" ;; *:old) if grep -q '^INCOMPAT=1$' "$envf"; then echo 0 > "$W/ok"; else echo 1 > "$W/ok"; fi ;; *) echo 1 > "$W/ok" ;; esac
    fi ;;
esac
exit 0
STUB
cat > "$WORK/bin/aws" <<'STUB'
#!/bin/bash
case "$*" in *get-login-password*) echo x ;; *get-secret-value*) cat "$W/secret.json" ;; esac
STUB
printf '#!/bin/bash\n[ "$(cat "$W/ok" 2>/dev/null)" = 1 ]\n' > "$WORK/bin/curl"; printf '#!/bin/bash\nexit 0\n' > "$WORK/bin/sleep"; chmod +x "$WORK/bin/"*
sed -e "s#/opt/vista#$WORK/opt#g" -e "s#/etc/vista-deploy.conf#$WORK/conf#" "$HERE/deploy-api.sh" > "$WORK/deploy.sh"
deploy() { ( export PATH="$WORK/bin:$PATH" W="$WORK" "$@"; bash "$WORK/deploy.sh" "$IMAGE" ) 2>"$WORK/err" >"$WORK/out"; }
fail() { echo "FAIL: $1" >&2; cat "$WORK/err" "$WORK/out" "$WORK/starts" >&2; exit 1; }
secret() { printf '{"DATABASE_URL":"postgresql://vista_app_runtime:p@h:5432/d","DATABASE_RUNTIME_ROLE":"vista_app_runtime","LEARNING_MEDIA_BUCKET":"b","AWS_REGION":"ap-southeast-1","SUPABASE_URL":"s","SUPABASE_SERVICE_ROLE_KEY":"k","WEB_ORIGIN":"https://skynex.best"%s}' "$1" > "$WORK/secret.json"; }
state_old() { echo "$REG:old" > "$WORK/running"; echo 1 > "$WORK/ok"; printf 'GOOD=1\n' > "$WORK/opt/api.env"; : > "$WORK/starts"; rm -rf "$WORK/opt/env-snapshots"; }

# 1) a new image fails its health check while the new secret is also incompatible with the previous image: the rollback must succeed.
state_old; secret ',"INCOMPAT":"1"'; IMAGE="$REG:bad"
deploy && fail "a failed deployment must exit non-zero"
[ "$(cat "$WORK/ok")" = 1 ] || fail "the rolled-back API must be healthy"
[ "$(cat "$WORK/running")" = "$REG:old" ] || fail "the previous image must be running again"
grep -q '^INCOMPAT=1$' "$WORK/opt/api.env" && fail "the rollback must restore the previous image's configuration, not the new secret"
grep -q 'Rolled back to' "$WORK/err" || fail "rollback must be reported"

# 2) the manual rollback (VISTA_ROLLBACK=1) of an image restores that image's last healthy configuration even though the secret is now incompatible.
state_old; secret ''; IMAGE="$REG:old"; deploy                       # healthy deploy records the snapshot
[ -f "$WORK/opt/env-snapshots/old" ] || fail "a healthy deployment must record its configuration"
secret ',"INCOMPAT":"1"'; echo "$REG:new" > "$WORK/running"; echo 1 > "$WORK/ok"
deploy VISTA_ROLLBACK=1 || fail "manual rollback must succeed with a newer, incompatible secret"
[ "$(cat "$WORK/ok")" = 1 ] && [ "$(cat "$WORK/running")" = "$REG:old" ] || fail "manual rollback must leave the old image healthy"

# 3) a normal deployment of a compatible new image is unchanged and records its snapshot (at most 5 are kept).
state_old; secret ',"EXTRA":"1"'; IMAGE="$REG:new1"; deploy || fail "a healthy deployment must succeed"
[ "$(cat "$WORK/running")" = "$REG:new1" ] && [ -f "$WORK/opt/env-snapshots/new1" ] && [ -f "$WORK/opt/env-snapshots/old" ] || fail "snapshots of the new and the previously running image"
for i in 2 3 4 5 6 7; do IMAGE="$REG:new$i"; deploy; done
[ "$(ls "$WORK/opt/env-snapshots" | wc -l)" -le 5 ] || fail "snapshots must be pruned"
echo "rollback tests passed"
