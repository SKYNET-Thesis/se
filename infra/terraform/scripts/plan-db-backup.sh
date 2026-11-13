#!/usr/bin/env bash
# READ-ONLY plan of the Production database backup resources (db-backup.tf). Never applies anything.
#
#  * Works in a throw-away COPY of this module, so no .terraform directory, lock file or plan file is left in the repository.
#  * Uses -lock=false and -target for the db_backup resources only: it neither takes the state lock nor writes state.
#  * Asserts the saved plan JSON: every changed resource is a *create* of a db_backup resource, nothing else is created, updated, replaced
#    or destroyed, and no aws_instance appears. Exits non-zero otherwise.
#
# Usage: AWS_PROFILE=vista plan-db-backup.sh <tfstate-bucket> <tfvars-file>
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <tfstate-bucket> <tfvars-file>" >&2; exit 2; }
STATE_BUCKET="$1"; TFVARS="$(realpath "$2")"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
cp "$SRC"/*.tf "$SRC"/*.tftpl "$SRC"/*.js "$SRC/.terraform.lock.hcl" "$WORK/" 2>/dev/null || true
cp -r "$SRC/scripts" "$WORK/scripts"
cd "$WORK"
terraform init -reconfigure -input=false -no-color \
  -backend-config="bucket=$STATE_BUCKET" -backend-config="key=vista/demo/terraform.tfstate" \
  -backend-config="region=${AWS_REGION:-ap-southeast-1}" -backend-config="use_lockfile=false" >/dev/null
TARGETS=()
while read -r address; do TARGETS+=("-target=$address"); done < <(grep -hoE '^resource "[a-z0-9_]+" "db_backup[a-z_]*"' "$SRC/db-backup.tf" | sed -E 's/resource "([^"]+)" "([^"]+)"/\1.\2/')
terraform plan -lock=false -input=false -no-color -var-file="$TFVARS" "${TARGETS[@]}" -out=backup.tfplan | grep -E '^(Plan:|No changes)' || true
terraform show -json backup.tfplan | python3 -c '
import json, sys
plan = json.load(sys.stdin)
bad = []
creates = []
for r in plan["resource_changes"]:
    actions, addr = r["change"]["actions"], r["address"]
    if actions in (["no-op"], ["read"]):
        continue
    if actions != ["create"] or ".db_backup" not in addr or "aws_instance" in addr:
        bad.append((addr, actions))
    else:
        creates.append(addr)
print("creates:", len(creates))
for a in sorted(creates):
    print("  +", a)
if bad or not creates:
    sys.exit("UNSAFE OR EMPTY PLAN: %s" % (bad or "nothing to create"))
print("OK: only creations of db_backup resources; no update, replacement, destroy or aws_instance")
'
