#!/usr/bin/env python3
"""Local upgrade-path check on a DISPOSABLE loopback PostgreSQL 17 database named vista_test_* (never Supabase or Production).

Steps: baseline + migrations D..J (temporary, git-pinned manifest copy) -> seed rows -> apply the full manifest (K..M) with the
repository runner -> verify data preserved, idempotent re-run, least-privilege runtime role and a schema fingerprint equal to a
fresh bootstrap. It does not approve K..M for Production.

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
r = bootstrap(tmp, url, env=env, confirmed=True)
print("  applied:", len(r["applied"]), "ledger rows:", r["ledger_rows"])

def psql(sql):
    return subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-Atc", sql], capture_output=True, text=True, check=True).stdout.strip().splitlines()[0]
org = psql("INSERT INTO public.organizations(name,type,segment) VALUES('upgrade-school','institution','education') RETURNING id")
usr = psql("INSERT INTO public.users(full_name,signup_method,status) VALUES('Upgrade Teacher','admin_created','active') RETURNING id")
course = psql(f"INSERT INTO public.learning_courses(title,status,organization_id) VALUES('Upgrade course','draft','{org}') RETURNING id")
lesson = psql(f"INSERT INTO public.learning_lessons(course_id,title,ordinal) VALUES('{course}','L1',1) RETURNING id")
before = psql("SELECT (SELECT count(*) FROM public.learning_courses)||','||(SELECT count(*) FROM public.learning_lessons)||','||(SELECT count(*) FROM public.users)")
print("stage 2: seeded rows (courses,lessons,users):", before)

print("stage 3: apply the full manifest (K..M) to the same database")
connection, ref = validate_dev_target(url, env)
runner = MigrationRunner(REPO, REPO / "database/migrations/manifest.json", env={**env, "DATABASE_URL": url}, psql_binary="psql")
res = runner.apply(ref, operator_id="local-upgrade-check", approval_reference="LOCAL-UPGRADE-CHECK")
print("  newly applied:", [getattr(p, 'version', p) for p in res.pending])
summary = verify_database(runner, connection)
rerun = runner.apply(ref, operator_id="local-upgrade-check", approval_reference="LOCAL-UPGRADE-CHECK")
after = psql("SELECT (SELECT count(*) FROM public.learning_courses)||','||(SELECT count(*) FROM public.learning_lessons)||','||(SELECT count(*) FROM public.users)")
roles = psql("SELECT rolname||':'||rolsuper||rolbypassrls||rolcreatedb||rolcreaterole FROM pg_roles WHERE rolname='vista_app_runtime'")
print("  rerun pending:", rerun.pending, "| data preserved:", before == after, "| runtime role flags:", roles)
print("  ledger versions:", [x["version"] for x in summary["ledger"]] == full, "| fingerprint:", summary["schema_fingerprint"])
