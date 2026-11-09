#!/usr/bin/env bash
set -euo pipefail

mode=${1:-execute}
if [[ "$mode" != execute && "$mode" != --preflight-only ]]; then
  printf 'usage: %s [--preflight-only]\n' "$0" >&2
  exit 2
fi

if [[ "$mode" == execute ]]; then
  if [[ "${VISTA_RELEASE_EXECUTE:-}" != approved ]]; then
    echo 'Refusing to execute: set VISTA_RELEASE_EXECUTE=approved after explicit release approval.' >&2
    exit 64
  fi
  : "${VISTA_RELEASE_OPERATOR:?Set the approved operator identifier.}"
  if [[ ! "$VISTA_RELEASE_OPERATOR" =~ ^[A-Za-z0-9._@-]+$ ]]; then
    echo 'VISTA_RELEASE_OPERATOR contains unsupported characters.' >&2
    exit 64
  fi
fi
: "${VISTA_RELEASE_DATABASE_URL:?Set the TLS-verified Production direct URL.}"

release_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
repo_root=$(cd "$release_root/../../.." && pwd -P)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/vista-main-schema.XXXXXX")
chmod 700 "$scratch"
trap 'rm -rf "$scratch"' EXIT

# Validate the exact project endpoint and move the password out of psql argv.
python3 - "$scratch" <<'PY'
import os
import shlex
import sys
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

scratch = Path(sys.argv[1])
raw = os.environ["VISTA_RELEASE_DATABASE_URL"]
try:
    url = urlsplit(raw)
    query = parse_qs(url.query, keep_blank_values=True)
    host = url.hostname or ""
    port = url.port or 5432
    database = unquote(url.path.lstrip("/"))
    username = unquote(url.username or "")
    password = unquote(url.password or "")
    sslmode = query.get("sslmode", [""])[-1]
    rootcert = unquote(query.get("sslrootcert", [""])[-1])
except ValueError:
    url = None
    host = ""
    port = 0
    database = username = password = sslmode = rootcert = ""

direct_endpoint = (
    host == "db.ovijutkvaaxohauvuxbj.supabase.co"
    and port == 5432
    and username == "postgres"
)
session_pooler_endpoint = (
    host == "aws-1-ap-south-1.pooler.supabase.com"
    and port == 5432
    and username == "postgres.ovijutkvaaxohauvuxbj"
)

if (url is None or url.scheme not in ("postgres", "postgresql")
        or not (direct_endpoint or session_pooler_endpoint)
        or database != "postgres"
        or sslmode != "verify-full"
        or not rootcert or not Path(rootcert).is_absolute()
        or not Path(rootcert).is_file() or not password):
    print("Refusing to connect: URL must target the verified Production direct or approved Session Pooler endpoint with verify-full and its CA file.", file=sys.stderr)
    raise SystemExit(64)

def pgpass_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(":", "\\:")

passfile = scratch / "pgpass"
passfile.write_text(":".join(map(pgpass_escape, [host, str(port), database, username, password])) + "\n")
passfile.chmod(0o600)
envfile = scratch / "pg-env.sh"
env = {
    "PGHOST": host,
    "PGPORT": str(port),
    "PGDATABASE": database,
    "PGUSER": username,
    "PGPASSFILE": str(passfile),
    "PGSSLMODE": sslmode,
    "PGSSLROOTCERT": rootcert,
    "PGAPPNAME": "vista-main-schema-release",
}
envfile.write_text("\n".join(f"export {key}={shlex.quote(value)}" for key, value in env.items()) + "\n")
envfile.chmod(0o600)
PY
source "$scratch/pg-env.sh"
unset VISTA_RELEASE_DATABASE_URL

identity=$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -At -v ON_ERROR_STOP=1 -c \
  "SELECT current_database() || '|' || current_user || '|' || current_setting('server_version_num');")
IFS='|' read -r actual_database actual_user server_version <<<"$identity"
if [[ "$actual_database" != postgres || "$actual_user" != postgres || "$server_version" -lt 170000 || "$server_version" -ge 180000 ]]; then
  echo 'Refusing to proceed: Production identity or PostgreSQL major version differs from the verified target.' >&2
  exit 65
fi

run_preflight() {
  PGOPTIONS='-c default_transaction_read_only=on' psql -X -v ON_ERROR_STOP=1 -P pager=off -f "$release_root/preflight.sql"
  local actual_fingerprint
  actual_fingerprint=$(PGOPTIONS='-c default_transaction_read_only=on' psql -X -At -v ON_ERROR_STOP=1 -f "$release_root/fingerprint.sql" | tr -d '\r\n')
  [[ "$actual_fingerprint" == f210cef96b01b1956ce2bbf459f98ff9 ]] || {
    echo 'Refusing to proceed: Production baseline fingerprint mismatch.' >&2
    return 65
  }
}

declare -a versions=(
  20261104_curriculum_foundation
  20261105_question_bank_foundation
  20261106_question_bank_quiz_attempt
  20261106_classroom_enrollment_lifecycle
  20261106_iot_lifecycle_foundation
  20261106_iot_publish_intent
  20261108_iot_lifecycle_access_restrictions
)
declare -a checksums=(
  57cb9b29751f3392214c54ac0291a696fbdb03f5ab252ab9f9e836822f305359
  cfad4d384a5ff551d68c5ac57d7c9b1981c2d2e52a37a2060ee1f936a3516056
  e9c2c214dc836d32c7031a4e185c77063a1b4e84ca3c6ff86109f0663b13f825
  fc776052d91b80d5b5aef35d3bf2e9cadb2b9896e0adbce36a5e66a5b5a3cd7e
  d5d1ebee0812dfb4388d8deb3188b8c8df9e6815f6a73839b3c8dd88f5883eed
  fad0cfbbca5680e9825841a529c9a09b4e0d6457af043b95a5d07f60d7009833
  4e2ac74232b536d0193be32c61fd5922017644721e893423e553362109b01f98
)

for index in "${!versions[@]}"; do
  printf '%s\t%s\n' "${versions[$index]}" "${checksums[$index]}" >> "$scratch/runner-manifest.tsv"
done
python3 - "$release_root/manifest.json" "$scratch/runner-manifest.tsv" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text())
expected = [tuple(line.rstrip("\n").split("\t")) for line in Path(sys.argv[2]).read_text().splitlines()]
actual = [(row["version"], row["sha256"]) for row in manifest["migrations"]]
if (manifest.get("release") != "20261108-main-schema"
        or manifest.get("sourceCommit") != "c23f3366ef78d20d17979b712af5d9f16aa27512"
        or manifest.get("productionBaselineFingerprint") != "f210cef96b01b1956ce2bbf459f98ff9"
        or actual != expected):
    print("Refusing to proceed: release manifest does not match runner inputs.", file=sys.stderr)
    raise SystemExit(65)
PY

for index in "${!versions[@]}"; do
  source_sql="$repo_root/services/education-api/prisma/migrations/${versions[$index]}/migration.sql"
  actual=$(sha256sum "$source_sql" | awk '{print $1}')
  [[ "$actual" == "${checksums[$index]}" ]] || { echo "Checksum mismatch: ${versions[$index]}" >&2; exit 65; }
  sed -E '/^[[:space:]]*BEGIN;[[:space:]]*$/d; /^[[:space:]]*COMMIT;[[:space:]]*$/d' "$source_sql" > "$scratch/${versions[$index]}.sql"
done

if [[ "$mode" == --preflight-only ]]; then
  run_preflight
  echo 'Read-only Production preflight passed; no migration SQL or ledger writes were run.'
  exit 0
fi

cat > "$scratch/driver.sql" <<SQL
\\set ON_ERROR_STOP on
SELECT pg_advisory_lock(hashtext('vista:20261108-main-schema'));
\\i $release_root/preflight.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
CREATE TABLE IF NOT EXISTS public.vista_schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL,
  release_id text NOT NULL,
  source_commit text NOT NULL,
  operator_id text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  provenance text NOT NULL DEFAULT 'executed' CHECK (provenance IN ('executed','baseline_verified'))
);
DO \$\$ DECLARE missing_count integer; BEGIN
  SELECT count(*) INTO missing_count FROM (VALUES
    ('version','text'),('checksum','text'),('release_id','text'),('source_commit','text'),
    ('operator_id','text'),('applied_at','timestamptz'),('provenance','text')
  ) AS expected(column_name,udt_name)
  LEFT JOIN information_schema.columns c ON c.table_schema='public' AND c.table_name='vista_schema_migrations' AND c.column_name=expected.column_name
  WHERE c.column_name IS NULL OR c.udt_name IS DISTINCT FROM expected.udt_name OR c.is_nullable <> 'NO';
  IF missing_count > 0 THEN RAISE EXCEPTION 'release ledger exists with incompatible columns'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.vista_schema_migrations'::regclass AND contype='p' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.vista_schema_migrations'::regclass AND attname='version')]::smallint[]) THEN
    RAISE EXCEPTION 'release ledger version primary key is incompatible';
  END IF;
END \$\$;
SQL

for index in "${!versions[@]}"; do
  version=${versions[$index]}
  checksum=${checksums[$index]}
  cat >> "$scratch/driver.sql" <<SQL
DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM public.vista_schema_migrations WHERE version='${version}') THEN
    RAISE EXCEPTION 'release version ${version} is already recorded';
  END IF;
END \$\$;
\\i $scratch/${versions[$index]}.sql
INSERT INTO public.vista_schema_migrations(version,checksum,release_id,source_commit,operator_id,provenance)
VALUES ('${version}','${checksum}','20261108-main-schema','c23f3366ef78d20d17979b712af5d9f16aa27512','${VISTA_RELEASE_OPERATOR}','executed');
SQL
done

cat >> "$scratch/driver.sql" <<'SQL'
COMMIT;
SELECT pg_advisory_unlock(hashtext('vista:20261108-main-schema'));
SELECT version,provenance,checksum FROM public.vista_schema_migrations
WHERE version IN ('20261104_curriculum_foundation','20261105_question_bank_foundation','20261106_question_bank_quiz_attempt','20261106_classroom_enrollment_lifecycle','20261106_iot_lifecycle_foundation','20261106_iot_publish_intent','20261108_iot_lifecycle_access_restrictions')
ORDER BY version;
SQL

run_preflight
psql -X -v ON_ERROR_STOP=1 -P pager=off -f "$scratch/driver.sql"
