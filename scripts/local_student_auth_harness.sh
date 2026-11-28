#!/usr/bin/env bash
# Local-only harness for the student-auth acceptance suites: REAL GoTrue (pinned image) + the Education API twice (temporary-password flag
# ON :3012 / OFF :3013) on top of the disposable stack from scripts/local_integration_stack.sh. Never contacts a hosted service.
# All keys are generated per run into a private directory under /tmp and are never written into the repository.
# Usage: scripts/local_student_auth_harness.sh up|down   (run local_integration_stack.sh up first)
set -euo pipefail
cd "$(dirname "$0")/.."
H=/tmp/vista-sa-harness; GOTRUE_IMAGE=public.ecr.aws/supabase/gotrue:v2.197.0; NAME=vista-sa-gotrue
DB_URL="postgresql://vista_test:intpw@127.0.0.1:55497/vista_test_int?sslmode=disable"
down() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  for pat in "[l]ocal-gotrue-proxy.mjs" "[P]ORT=3012" ; do pkill -f "$pat" 2>/dev/null || true; done
  for port in 3012 3013 54323 9999; do pid=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2 || true); [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true; done
  rm -rf "$H"
}
[ "${1:-}" = down ] && { down; echo "harness down"; exit 0; }
[ "${1:-}" = up ] || { echo "usage: $0 up|down" >&2; exit 2; }
down; umask 077; mkdir -p "$H"
node -e '
const c=require("crypto"),fs=require("fs");const dir=process.argv[1];
const {privateKey}=c.generateKeyPairSync("ec",{namedCurve:"P-256"});
const es=privateKey.export({format:"jwk"});Object.assign(es,{kid:"vista-sa-es256",alg:"ES256",use:"sig",key_ops:["sign","verify"]});
const secret=c.randomBytes(32).toString("base64url");
const oct={kty:"oct",k:Buffer.from(secret).toString("base64url"),kid:"vista-sa-hs256",alg:"HS256",key_ops:["verify"]};
const sign=(payload)=>{const h=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT",kid:"vista-sa-hs256"})).toString("base64url");const p=Buffer.from(JSON.stringify(payload)).toString("base64url");return h+"."+p+"."+c.createHmac("sha256",Buffer.from(secret)).update(h+"."+p).digest("base64url");};
const far=Math.floor(Date.now()/1000)+86400*30;
fs.writeFileSync(dir+"/jwt-keys.json",JSON.stringify([es,oct]));fs.writeFileSync(dir+"/jwt-secret",secret);
fs.writeFileSync(dir+"/anon.json",JSON.stringify({anon:sign({role:"anon",iss:"vista-sa",exp:far})}));
fs.writeFileSync(dir+"/service.txt",sign({role:"service_role",iss:"vista-sa",exp:far}));
' "$H"
psql "$DB_URL" -qc "CREATE SCHEMA IF NOT EXISTS auth" >/dev/null
docker run -d --name "$NAME" --network host \
  -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54323/auth/v1 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="${DB_URL}&search_path=auth" -e GOTRUE_DB_NAMESPACE=auth \
  -e GOTRUE_SITE_URL=http://127.0.0.1:4173 -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  -e GOTRUE_JWT_ISSUER=http://127.0.0.1:54323/auth/v1 -e GOTRUE_JWT_SECRET="$(cat "$H/jwt-secret")" -e GOTRUE_JWT_KEYS="$(cat "$H/jwt-keys.json")" \
  -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true \
  -e GOTRUE_RATE_LIMIT_HEADER=X-Forwarded-For -e GOTRUE_RATE_LIMIT_TOKEN_REFRESH=1000 -e GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  "$GOTRUE_IMAGE" >/dev/null
for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:9999/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:9999/health >/dev/null || { docker logs --tail 20 "$NAME"; echo "GoTrue did not start" >&2; exit 1; }
# The proxy also serves /__test/users (fixture identities) and token minting for the specs that need them (platform-system-admin, platform-invite-security):
# it needs the service-role key, a fixture password and the ES256 signing key generated above (private files under $H, never in the repository).
node -e 'const c=require("crypto"),fs=require("fs");const k=JSON.parse(fs.readFileSync(process.argv[1]+"/jwt-keys.json","utf8"))[0];fs.writeFileSync(process.argv[1]+"/signing.pem",c.createPrivateKey({key:k,format:"jwk"}).export({type:"pkcs8",format:"pem"}),{mode:0o600})' "$H"
VISTA_E2E_GOTRUE_SERVICE_ROLE_KEY="$(cat "$H/service.txt")" VISTA_E2E_GOTRUE_FIXTURE_PASSWORD='LocalFixturePass-spec1!' VISTA_E2E_GOTRUE_SIGNING_KID=vista-sa-es256 VISTA_E2E_GOTRUE_SIGNING_KEY="$H/signing.pem" \
  nohup node web/robot-edu/tests/e2e/local-gotrue-proxy.mjs 54323 9999 >"$H/proxy.log" 2>&1 &
sleep 1
# GoTrue users with the fixture auth UUIDs, so the fixture accounts can sign in with a password.
SERVICE=$(cat "$H/service.txt")
node -e '
const fs=require("fs");const fx=JSON.parse(fs.readFileSync("/tmp/vista-phase243-fixture-int.json","utf8"));const service=fs.readFileSync(process.argv[1]+"/service.txt","utf8");
const emails={admin:"phase243-admin@vista.test",schoolAdmin:"phase243-school-admin@vista.test",instructor:"phase243-instructor@vista.test",student:"phase243-student@vista.test",otherSchoolAdmin:"phase243-other-school-admin@vista.test",otherStudent:"phase243-other-student@vista.test"};
(async()=>{for(const [who,email] of Object.entries(emails)){const u=fx.users[who];if(!u)continue;
const r=await fetch("http://127.0.0.1:54323/auth/v1/admin/users",{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},body:JSON.stringify({id:u.authUserId,email,password:"LocalFixturePass-"+who+"!",email_confirm:true})});
if(!r.ok)throw new Error("create "+who+" "+r.status+" "+(await r.text()).slice(0,160));}console.log("fixture identities created");})().catch(e=>{console.error(e.message);process.exit(1)});
' "$H"
start_api() { # port flag
  ( set -a; . /tmp/vista-int-api.env; set +a
    export PORT=$1 STUDENT_TEMP_PASSWORD_ENABLED=$2 TRUST_PROXY=1 SUPABASE_URL=http://127.0.0.1:54323 SUPABASE_JWT_ISSUER=http://127.0.0.1:54323/auth/v1 \
      SUPABASE_SERVICE_ROLE_KEY="$SERVICE" SUPABASE_ANON_KEY="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).anon' "$H/anon.json")"
    cd services/education-api && nohup node dist/main.js >"$H/api-$1.log" 2>&1 & )
}
start_api 3012 true; start_api 3013 false
for port in 3012 3013; do for _ in $(seq 1 40); do curl -fsS "http://127.0.0.1:$port/api/v1/health" >/dev/null 2>&1 && break; sleep 1; done; curl -fsS "http://127.0.0.1:$port/api/v1/health" >/dev/null || { echo "API :$port did not start" >&2; exit 1; }; done
: >"$H/secrets.tsv"; chmod 600 "$H/secrets.tsv"
echo "harness up: GoTrue via http://127.0.0.1:54323/auth/v1, APIs :3012 (flag on) :3013 (flag off); private files in $H"
