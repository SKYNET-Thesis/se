#!/usr/bin/env python3
"""Local upgrade-path check on a DISPOSABLE loopback PostgreSQL 17 database named vista_test_* (never Supabase or Production).

Steps: baseline + migrations D..J (temporary, git-pinned manifest copy) -> seed rows -> apply the full manifest (K..L) with the
repository runner -> verify data preserved, idempotent re-run, least-privilege runtime role and a schema fingerprint equal to a
fresh bootstrap. It does not approve K..L (or M) for Production.

Optional two-identity mode (Supabase-image rehearsal): UPG_SETUP_URL is a disposable SUPERUSER used only for stages 1-2 (baseline + D..J + seed rows);
UPG_AFTER_SETUP_SQL (a file) is then run as that user (for example REASSIGN OWNED BY <setup role> TO postgres), and stage 3 applies the rest as UPG_DATABASE_URL,
the non-superuser apply role. Without UPG_SETUP_URL a single identity does everything. UPG_PRE_APPLY_CMD / UPG_POST_APPLY_CMD (shell commands, run from the repository root with
DATABASE_URL set to the apply identity) let a rehearsal run the release tooling (plan, evidence, snapshot, verifier) around stage 3. In two-identity mode the schema
fingerprint is only reported: owners and platform roles differ from the vista_test pin.

Usage: UPG_DATABASE_URL=postgresql://vista_test:...@127.0.0.1:<port>/vista_test_<name>?sslmode=disable \
       VISTA_DATABASE_PROJECT_REF=local-<label> python3 scripts/check_local_upgrade_path.py
"""
import json, os, shutil, sys, tempfile, subprocess
from pathlib import Path
REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO)); sys.path.insert(0, str(REPO / "scripts"))
from scripts.bootstrap_dev_database import bootstrap, verify_database, validate_dev_target
from scripts.sql_migration_runner import MigrationRunner

url = os.environ["UPG_DATABASE_URL"]
setup_url = os.environ.get("UPG_SETUP_URL", url)
env = {**os.environ}
tmp = Path(tempfile.mkdtemp(prefix="vista-upgrade-root-"))
shutil.copytree(REPO / "database", tmp / "database")
(tmp / "database/baselines/dev-schema-expectation.json").unlink(missing_ok=True)
manifest = json.loads((tmp / "database/migrations/manifest.json").read_text())
full = [m["version"] for m in manifest["migrations"]]
manifest["migrations"] = [m for m in manifest["migrations"] if m["version"] <= "20261114_j_one_submission_per_attempt"]
g = lambda *a: subprocess.run(["git", *a], cwd=tmp, check=True, capture_output=True, text=True).stdout.strip()
g("init", "-q"); g("config", "user.email", "x@example.invalid"); g("config", "user.name", "upgrade-check"); g("add", "database"); g("commit", "-qm", "snapshot")
manifest["sourceCommit"] = g("rev-parse", "HEAD")
(tmp / "database/migrations/manifest.json").write_text(json.dumps(manifest, indent=2))
print("stage 1: baseline + D..J ->", [m["version"] for m in manifest["migrations"]][-1])
r = bootstrap(tmp, setup_url, env=env, confirmed=True)
print("  applied:", len(r["applied"]), "ledger rows:", r["ledger_rows"])

def psql(sql, target=None):
    return subprocess.run(["psql", target or setup_url, "-v", "ON_ERROR_STOP=1", "-Atc", sql], capture_output=True, text=True, check=True).stdout.strip().splitlines()[0]
org = psql("INSERT INTO public.organizations(name,type,segment) VALUES('upgrade-school','institution','education') RETURNING id")
usr = psql("INSERT INTO public.users(full_name,signup_method,status) VALUES('Upgrade Teacher','admin_created','active') RETURNING id")
course = psql(f"INSERT INTO public.learning_courses(title,status,organization_id) VALUES('Upgrade course','draft','{org}') RETURNING id")
lesson = psql(f"INSERT INTO public.learning_lessons(course_id,title,ordinal) VALUES('{course}','L1',1) RETURNING id")
before = psql("SELECT (SELECT count(*) FROM public.learning_courses)||','||(SELECT count(*) FROM public.learning_lessons)||','||(SELECT count(*) FROM public.users)")
print("stage 2: seeded rows (courses,lessons,users):", before)
if os.environ.get("UPG_AFTER_SETUP_SQL"):
    subprocess.run(["psql", setup_url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", os.environ["UPG_AFTER_SETUP_SQL"]], check=True, capture_output=True)
    print("  ran UPG_AFTER_SETUP_SQL as the setup identity")

def hook(name):
    command = os.environ.get(name)
    if command:
        done = subprocess.run(command, shell=True, cwd=REPO, env={**os.environ, "DATABASE_URL": url}, capture_output=True, text=True)
        print(f"  {name}: exit {done.returncode}")
        print("    " + "\n    ".join((done.stdout + done.stderr).strip().splitlines()[-40:]))
        if done.returncode:
            raise SystemExit(f"{name} failed")

hook("UPG_PRE_APPLY_CMD")
print("stage 3: apply the full manifest (K..L) to the same database")
connection, ref = validate_dev_target(url, env)
runner = MigrationRunner(REPO, REPO / "database/migrations/manifest.json", env={**env, "DATABASE_URL": url}, psql_binary="psql")
res = runner.apply(ref, operator_id="local-upgrade-check", approval_reference="LOCAL-UPGRADE-CHECK")
print("  newly applied:", [getattr(p, 'version', p) for p in res.pending])
try:
    summary = verify_database(runner, connection)
except Exception as exc:  # noqa: BLE001
    if "UPG_SETUP_URL" not in os.environ or "schema drift" not in str(exc):
        raise
    from scripts.bootstrap_dev_database import verify_database as _v  # two-identity mode: report, do not pin
    print("  (two-identity mode) fingerprint differs from the vista_test pin as expected:", str(exc).split("differs")[0].strip()[-20:])
    summary = {"ledger": [{"version": v} for v in psql("SELECT string_agg(version, ',' ORDER BY version) FROM public.vista_schema_migrations", url).split(",")], "schema_fingerprint": "not-pinned-in-two-identity-mode"}
rerun = runner.apply(ref, operator_id="local-upgrade-check", approval_reference="LOCAL-UPGRADE-CHECK")
after = psql("SELECT (SELECT count(*) FROM public.learning_courses)||','||(SELECT count(*) FROM public.learning_lessons)||','||(SELECT count(*) FROM public.users)", url)
roles = psql("SELECT rolname||':'||rolsuper||rolbypassrls||rolcreatedb||rolcreaterole FROM pg_roles WHERE rolname='vista_app_runtime'", url)
print("  rerun pending:", rerun.pending, "| data preserved:", before == after, "| runtime role flags:", roles)
print("  ledger versions:", [x["version"] for x in summary["ledger"]] == full, "| fingerprint:", summary["schema_fingerprint"])
hook("UPG_POST_APPLY_CMD")
