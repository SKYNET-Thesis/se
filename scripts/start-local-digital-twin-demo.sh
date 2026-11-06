#!/usr/bin/env sh
# Starts VISTA software services only. It never starts LeLab or hardware drivers.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CONFIG_FILE=${VISTA_LOCAL_DEMO_ENV_FILE:-$HOME/.config/vista/digital-twin-demo.env}
RUNTIME_DIR=${XDG_RUNTIME_DIR:-/tmp}/vista-digital-twin-demo
mkdir -p "$RUNTIME_DIR"
PIDS=""

if [ -f "$CONFIG_FILE" ]; then
  config_mode=$(stat -c %a "$CONFIG_FILE")
  [ "$(stat -c %U "$CONFIG_FILE")" = "$(id -un)" ] && [ $(( 0$config_mode & 077 )) -eq 0 ] || { echo "Refusing insecure local config file." >&2; exit 1; }
  while IFS='=' read -r key value; do
    [ -z "$key" ] && continue
    case "$key" in VISTA_TWIN_AUTH_SECRET_FILE|VISTA_TWIN_PHYSICAL_OWNER_ID|VISTA_TWIN_PHYSICAL_ORGANIZATION_ID|VISTA_TWIN_PHYSICAL_ROBOT_ID|VISTA_TWIN_ENDPOINT|VISTA_TWIN_PUBLISHER_SCOPE_FILE) export "$key=$value";; *) echo "Unsupported local config key: $key" >&2; exit 1;; esac
  done < "$CONFIG_FILE"
  if [ -n "${VISTA_TWIN_AUTH_SECRET_FILE:-}" ]; then
    secret_mode=$(stat -c %a "$VISTA_TWIN_AUTH_SECRET_FILE")
    [ "$(stat -c %U "$VISTA_TWIN_AUTH_SECRET_FILE")" = "$(id -un)" ] && [ $(( 0$secret_mode & 077 )) -eq 0 ] || { echo "Refusing insecure secret file." >&2; exit 1; }
    VISTA_TWIN_AUTH_SECRET=$(cat "$VISTA_TWIN_AUTH_SECRET_FILE")
    [ -n "$VISTA_TWIN_AUTH_SECRET" ] || { echo "Local secret file is empty." >&2; exit 1; }
    export VISTA_TWIN_AUTH_SECRET DIGITAL_TWIN_SCOPE_SECRET="$VISTA_TWIN_AUTH_SECRET"
  fi
fi

stop() {
  for pid in $PIDS; do kill "$pid" 2>/dev/null || true; done
}
trap stop INT TERM EXIT

port_free() {
  ! ss -ltn "sport = :$1" 2>/dev/null | grep -q ":$1"
}
for port in 3001 5173 8767; do
  if ! port_free "$port"; then echo "Port $port is already in use; refusing to start." >&2; exit 1; fi
done

start() {
  name=$1; shift
  "$@" >"$RUNTIME_DIR/$name.log" 2>&1 &
  PIDS="$PIDS $!"
}
wait_for() {
  url=$1
  i=0
  while [ "$i" -lt 30 ]; do
    if curl -fsS --connect-timeout 1 "$url" >/dev/null 2>&1; then return 0; fi
    i=$((i + 1)); sleep 1
  done
  echo "Service did not become reachable: $url" >&2
  return 1
}

start education-api sh -c "cd '$ROOT/services/education-api' && exec npm run dev"
start digital-twin sh -c "cd '$ROOT/services/digital-twin' && exec env PYTHONPATH=src .venv/bin/uvicorn vista_digital_twin.app:app --host 127.0.0.1 --port 8767"
start frontend sh -c "cd '$ROOT/web/robot-edu' && exec npm run dev -- --host 127.0.0.1 --port 5173"

wait_for http://127.0.0.1:8767/health
wait_for http://127.0.0.1:5173/
wait_for http://127.0.0.1:3001/api/v1/health
echo "VISTA local services are running. Logs: $RUNTIME_DIR"
echo "Open http://127.0.0.1:5173/lab. Press Ctrl-C for clean software shutdown."
wait
