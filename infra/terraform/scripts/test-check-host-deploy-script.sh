#!/bin/bash
# Offline test of check-host-deploy-script.sh with a stub `aws` and `sleep`.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT; mkdir -p "$WORK/bin"
cat > "$WORK/bin/aws" <<'STUB'
#!/bin/bash
case "$*" in
  *send-command*) echo cmd-1 ;;
  *Status*) echo "${STUB_STATUS:-Success}" ;;
  *StandardOutputContent*) echo "${STUB_HASH:-x}  /usr/local/bin/vista-deploy-api" ;;
esac
STUB
printf '#!/bin/bash\nexit 0\n' > "$WORK/bin/sleep"; chmod +x "$WORK/bin/"*
HASH="$(sha256sum "$HERE/deploy-api.sh" | cut -d' ' -f1)"
fail() { echo "FAIL: $1" >&2; exit 1; }
run() { ( export PATH="$WORK/bin:$PATH"; "$@" "$HERE/check-host-deploy-script.sh" i-1 ) >"$WORK/out" 2>&1; }
run env STUB_HASH="$HASH" || fail "a matching host script must pass"
run env STUB_HASH="deadbeef" && fail "a stale host script must fail"
grep -q 'refresh-host-deploy-script.sh' "$WORK/out" || fail "the failure must say how to fix it"
run env STUB_HASH="$HASH" STUB_STATUS=Failed && fail "an unreadable host script hash must fail"
echo "host script drift check tests passed"
