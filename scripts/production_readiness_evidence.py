#!/usr/bin/env python3
"""Read-only hosted readiness evidence for release scope K-L (and the staged M): booleans and counts ONLY.

One SELECT-only statement runs inside BEGIN READ ONLY through the approved read-only Production reader (the same identity checks as the schema gate).
The result contains no role, schema, table or function names, no ACLs, no row data and no secrets: the repository is public and so are workflow logs.
It fails closed: any query error, any missing key or any non-boolean/non-integer value ends the run with status `incomplete` and a non-zero exit code.
`blocking` lists the check identifiers that must be resolved before a K-L release can even be planned; `informational` carries the risk facts (for
example how many roles would lose TEMP if M were released). It never changes anything and approves nothing.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

try:
    from scripts import verify_production_release_d_i as base
except ModuleNotFoundError:  # executed as a script from the repository root
    import verify_production_release_d_i as base  # type: ignore

APPLY_ROLE = "postgres"
READER_ROLE = "vista_backup_reader"
RUNTIME_ROLE = "vista_app_runtime"
M_PLATFORM_ALLOWLIST = ("postgres", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin", "authenticator", "anon", "authenticated", "service_role")


def evidence_sql() -> str:
    allow = ",".join(f"'{r}'" for r in M_PLATFORM_ALLOWLIST)
    return f"""SELECT json_build_object(
  'database_owner_is_apply_role', (SELECT d.datdba = (SELECT oid FROM pg_roles WHERE rolname = '{APPLY_ROLE}') FROM pg_database d WHERE d.datname = current_database()),
  'apply_role_exists_and_cannot_be_superuser', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APPLY_ROLE}' AND NOT rolsuper),
  'apply_role_can_create_roles', COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = '{APPLY_ROLE}'), false),
  'reader_role_exists', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{READER_ROLE}'),
  'ledger_rows', (SELECT count(*) FROM public.vista_schema_migrations),
  'ledger_versions', (SELECT COALESCE(json_agg(version ORDER BY version), '[]'::json) FROM public.vista_schema_migrations),
  'ledger_checksums', (SELECT COALESCE(json_object_agg(version, checksum), '{{}}'::json) FROM public.vista_schema_migrations),
  'catalog_tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p')),
  'catalog_rls_enabled', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND c.relrowsecurity),
  'catalog_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
  'catalog_triggers', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal),
  'catalog_functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')),
  'rbac_roles_present', (SELECT count(*) FROM public.roles WHERE code IN ('instructor','school_admin','student')),
  'authoring_permissions_present', (SELECT count(*) FROM public.permissions WHERE code IN ('learning.course.author','learning.course.publish')),
  'runtime_role_exists', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}'),
  'runtime_role_safe_if_present', NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit OR NOT rolcanlogin)),
  'runtime_role_memberships', (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='{RUNTIME_ROLE}'),
  'runtime_role_owned_objects', (SELECT count(*) FROM pg_shdepend sd WHERE sd.refobjid=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND sd.deptype='o'),
  'runtime_role_public_table_privilege_rows', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(c.relacl) a WHERE n.nspname='public' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND c.relkind IN ('r','p','v','m','f')),
  'runtime_role_public_sequence_privilege_rows', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(c.relacl) a WHERE n.nspname='public' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}') AND c.relkind='S'),
  'runtime_role_public_function_privilege_rows', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a WHERE n.nspname='public' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='{RUNTIME_ROLE}')),
  'runtime_role_public_table_effective_privilege_count', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE r.rolname='{RUNTIME_ROLE}' AND n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  'runtime_role_public_sequence_effective_privilege_count', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE r.rolname='{RUNTIME_ROLE}' AND n.nspname='public' AND c.relkind='S' AND has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE')),
  'runtime_role_inherited_access_outside_public', (SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='{RUNTIME_ROLE}'),
  'runtime_role_function_execute_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(p.proacl) a CROSS JOIN pg_roles r WHERE r.rolname='{RUNTIME_ROLE}' AND a.grantee=r.oid AND a.privilege_type='EXECUTE' AND n.nspname='public'),
  'runtime_role_holds_explicit_privileges_outside_public', (SELECT count(*) FROM (
      SELECT 1 FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') AND n.nspname <> 'public'
      UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(c.relacl) a WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') AND n.nspname <> 'public'
      UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace, LATERAL aclexplode(p.proacl) a WHERE a.grantee = (SELECT oid FROM pg_roles WHERE rolname = '{RUNTIME_ROLE}') AND n.nspname <> 'public') x),
  'apply_role_schemas_without_usage', (SELECT count(*) FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp)' AND NOT has_schema_privilege('{APPLY_ROLE}', n.nspname, 'USAGE')),
  'apply_role_public_objects_without_privilege', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
      AND CASE WHEN c.relkind IN ('r','p','v','m','f') THEN NOT has_table_privilege('{APPLY_ROLE}', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
               WHEN c.relkind = 'S' THEN NOT has_sequence_privilege('{APPLY_ROLE}', c.oid, 'USAGE,SELECT,UPDATE') ELSE false END),
  'apply_role_platform_objects_without_privilege', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema','public') AND n.nspname !~ '^pg_(toast|temp)' AND NOT has_function_privilege('{APPLY_ROLE}', p.oid, 'EXECUTE')),
  'public_has_temp', has_database_privilege('public', current_database(), 'TEMP'),
  'public_schema_public_create', EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(n.nspacl) a WHERE n.nspname = 'public' AND a.grantee = 0 AND a.privilege_type = 'CREATE'),
  'database_owner_has_temp', (SELECT has_database_privilege(d.datdba, current_database(), 'TEMP') FROM pg_database d WHERE d.datname = current_database()),
  'roles_relying_on_public_temp_not_in_m_allowlist', (SELECT count(*) FROM pg_roles r WHERE r.rolname !~ '^pg_' AND r.rolname <> ALL (ARRAY[{allow}])
      AND has_database_privilege(r.rolname, current_database(), 'TEMP')
      AND NOT EXISTS (SELECT 1 FROM pg_database d, LATERAL aclexplode(d.datacl) a WHERE d.datname = current_database() AND a.grantee = r.oid AND a.privilege_type = 'TEMPORARY')),
  'reader_role_relies_on_public_temp', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{READER_ROLE}') THEN
      (has_database_privilege('{READER_ROLE}', current_database(), 'TEMP') AND NOT EXISTS (SELECT 1 FROM pg_database d, LATERAL aclexplode(d.datacl) a WHERE d.datname = current_database() AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = '{READER_ROLE}') AND a.privilege_type = 'TEMPORARY'))
      ELSE false END,
  'm_allowlist_roles_missing', (SELECT count(*) FROM unnest(ARRAY[{allow}]) AS allowlisted(role) WHERE NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = allowlisted.role)),
  'sessions_using_temporary_relations', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname ~ '^pg_temp_')
)::text"""


INTEGER_KEYS = {"ledger_rows", "catalog_tables", "catalog_rls_enabled", "catalog_policies", "catalog_triggers", "catalog_functions", "rbac_roles_present", "authoring_permissions_present",
                "runtime_role_holds_explicit_privileges_outside_public", "runtime_role_memberships", "runtime_role_owned_objects", "runtime_role_public_table_privilege_rows",
                "runtime_role_public_sequence_privilege_rows", "runtime_role_public_function_privilege_rows", "runtime_role_public_table_effective_privilege_count", "runtime_role_public_sequence_effective_privilege_count",
                "runtime_role_inherited_access_outside_public", "runtime_role_function_execute_count", "apply_role_schemas_without_usage", "apply_role_public_objects_without_privilege",
                "apply_role_platform_objects_without_privilege", "roles_relying_on_public_temp_not_in_m_allowlist", "m_allowlist_roles_missing", "sessions_using_temporary_relations"}
BOOLEAN_KEYS = {"database_owner_is_apply_role", "apply_role_exists_and_cannot_be_superuser", "apply_role_can_create_roles", "reader_role_exists", "runtime_role_exists", "runtime_role_safe_if_present",
                "public_has_temp", "public_schema_public_create", "database_owner_has_temp", "reader_role_relies_on_public_temp"}
RAW_KEYS = {"ledger_versions", "ledger_checksums"}  # reduced to booleans below; never emitted


class EvidenceIncomplete(Exception):
    pass


def collect(url: str) -> dict:
    """Runs the single read-only statement; raises EvidenceIncomplete on anything unexpected."""
    try:
        raw = base.query(url, evidence_sql())
    except SystemExit as exc:  # base.query exits with a scrubbed message
        # The public log must not carry psql stderr (host, address or role names): a fixed sentence only.
        raise EvidenceIncomplete("the evidence query failed (connection, authentication or permission error; details are withheld from the public log)") from None
    if not isinstance(raw, dict):
        raise EvidenceIncomplete("the evidence query returned no result")
    expected = INTEGER_KEYS | BOOLEAN_KEYS | RAW_KEYS
    if set(raw) != expected:
        raise EvidenceIncomplete("the evidence result does not have exactly the expected keys")
    for key in INTEGER_KEYS:
        if not isinstance(raw[key], int) or isinstance(raw[key], bool):
            raise EvidenceIncomplete(f"{key} is not an integer")
    for key in BOOLEAN_KEYS:
        if not isinstance(raw[key], bool):
            raise EvidenceIncomplete(f"{key} is not a boolean (missing prerequisite object?)")
    return raw


def evaluate(raw: dict, root: Path) -> dict:
    """Turns the raw facts into redacted booleans/counts and a verdict. Pure: unit-testable without a database."""
    manifest = json.loads((root / "database/migrations/manifest.json").read_text())["migrations"]
    scopes = json.loads((root / "database/release-scopes.json").read_text())["scopes"]
    kl, m = scopes["K-L"], scopes["M"]
    pinned = {e["version"]: e["sha256"] for e in manifest}
    versions = set(raw["ledger_versions"])
    required = list(kl["requiresApplied"])
    k_l = list(kl["versions"])
    before = kl["expectedCatalogBefore"]
    checks = {
        "ledger_is_exactly_d_to_j": versions == set(required),
        "d_to_j_checksums_match_manifest": all(raw["ledger_checksums"].get(v) == pinned.get(v) for v in required),
        "k_and_l_not_yet_applied": not (versions & set(k_l)),
        "m_not_applied": not (versions & set(m["versions"])),
        "catalog_matches_the_scope_before_state": all(raw[f"catalog_{k}"] == before[k] for k in ("tables", "rls_enabled", "policies", "triggers", "functions")),
        "database_owner_is_apply_role": raw["database_owner_is_apply_role"],
        "apply_role_is_not_superuser": raw["apply_role_exists_and_cannot_be_superuser"],
        "apply_role_can_create_the_runtime_role": raw["apply_role_can_create_roles"] or raw["runtime_role_exists"],
        "reader_role_exists": raw["reader_role_exists"],
        "canonical_rbac_roles_present": raw["rbac_roles_present"] == 3,
        "authoring_permissions_not_yet_present": raw["authoring_permissions_present"] == 0,
        "runtime_role_absent_or_safe": (not raw["runtime_role_exists"]) or raw["runtime_role_safe_if_present"],
        "runtime_role_has_no_privileges_outside_public": raw["runtime_role_holds_explicit_privileges_outside_public"] == 0,
        "runtime_role_has_no_memberships": raw["runtime_role_memberships"] == 0,
        "runtime_role_owns_no_objects": raw["runtime_role_owned_objects"] == 0,
        "runtime_role_has_no_inherited_role_access": raw["runtime_role_inherited_access_outside_public"] == 0,
        "runtime_role_has_no_function_execute_grants": raw["runtime_role_function_execute_count"] == 0,
        "runtime_role_has_no_public_object_access_before_release": raw["runtime_role_public_table_effective_privilege_count"] == 0 and raw["runtime_role_public_sequence_effective_privilege_count"] == 0 and raw["runtime_role_function_execute_count"] == 0,
        "public_schema_has_no_create_for_public": not raw["public_schema_public_create"],  # K-L verifier fails the postflight otherwise
        "apply_role_can_use_every_schema": raw["apply_role_schemas_without_usage"] == 0,
        "apply_role_holds_a_privilege_on_every_public_object": raw["apply_role_public_objects_without_privilege"] == 0,
    }
    # L (revised) changes privileges only in `public`, so platform-object gaps no longer block K-L; they are reported because the earlier L draft failed on them.
    informational = {
        "apply_role_platform_function_gaps": raw["apply_role_platform_objects_without_privilege"],
        "public_has_temp_residual_risk_if_m_deferred": raw["public_has_temp"],
        "database_owner_has_temp": raw["database_owner_has_temp"],
        "roles_that_would_lose_temp_if_m_were_released": raw["roles_relying_on_public_temp_not_in_m_allowlist"],
        "reader_role_would_lose_temp_if_m_were_released": raw["reader_role_relies_on_public_temp"],
        "m_allowlisted_platform_roles_missing": raw["m_allowlist_roles_missing"],
        "sessions_using_temporary_relations": raw["sessions_using_temporary_relations"],
    }
    blocking = sorted(name for name, ok in checks.items() if not ok)
    return {"status": "complete", "scope": "K-L", "checks": checks, "informational": informational, "blocking": blocking,
            "verdict": "no blocking finding in the hosted read-only evidence" if not blocking else "BLOCKING findings: the K-L release cannot be planned",
            "note": "booleans and counts only; this evidence approves nothing and changes nothing"}


def run(url: str, root: Path) -> dict:
    return evaluate(collect(url), root)


def assert_redacted(result: dict) -> None:
    """Defence in depth for a public log: every value is a bool, an int, a list of known identifiers or a fixed sentence; no free-form server text."""
    def walk(value, path=""):
        if isinstance(value, dict):
            for k, v in value.items():
                if not re.fullmatch(r"[a-z0-9_]+", k):
                    raise EvidenceIncomplete("unexpected key in the redacted result")
                walk(v, f"{path}.{k}")
        elif isinstance(value, list):
            for v in value:
                if not isinstance(v, str) or not re.fullmatch(r"[a-z0-9_]+", v):
                    raise EvidenceIncomplete("unexpected list item in the redacted result")
        elif not isinstance(value, (bool, int, str)):
            raise EvidenceIncomplete("unexpected value type in the redacted result")
    walk(result)
