#!/usr/bin/env python3
"""Which database role may connect to a hosted Supabase project, for which operation. Pure functions, no I/O, no secrets.

Two roles are kept strictly apart:

  apply  -> `postgres`              migration apply and its postflight verification (privileged owner role)
  read   -> `vista_backup_reader`   preflight plan/snapshot, the deployment schema gate and the logical backup (BYPASSRLS, read only)

A role permitted for one operation is rejected for the other: the read-only credential can never apply a migration and the owner
credential can never be used for the backup/preflight path.

Supabase connection forms accepted (everything else is rejected, fail closed):

  pooler  user `<role>.<project_ref>` on host `<label>.pooler.supabase.com`   (the user carries the project reference)
  direct  user `<role>`               on host `db.<project_ref>.supabase.co`  (the host carries the project reference)

Error messages never contain the supplied user name, host or any other part of the URL.

The user name in a URL only selects a credential. Whoever runs a read operation must also ask the SERVER what the connection really is
(READER_ACCESS_SQL + reader_access_gaps): the reader must be `vista_backup_reader` with BYPASSRLS and without any write path, otherwise
RLS-protected tables read as empty and the preflight, the schema gate and the backup would silently work on wrong data.
"""

from __future__ import annotations

import re

PRODUCTION_REF = "ovijutkvaaxohauvuxbj"
ROLE_APPLY = "postgres"
ROLE_READ = "vista_backup_reader"
OPERATION_ROLES: dict[str, frozenset[str]] = {
    "apply": frozenset({ROLE_APPLY}),
    "read": frozenset({ROLE_READ}),
}

_ROLE = r"[a-z_][a-z0-9_]{0,62}"
_REF = r"[a-z0-9-]{3,64}"
POOLER_HOST = re.compile(r"[a-z0-9-]+\.pooler\.supabase\.com")
DIRECT_HOST = re.compile(rf"(?:db\.)?({_REF})\.supabase\.co")
POOLER_USER = re.compile(rf"({_ROLE})\.({_REF})")
BARE_ROLE = re.compile(_ROLE)


class IdentityError(Exception):
    """The connection does not identify the expected project with a role permitted for the operation."""


def split_pooler_username(username: str) -> tuple[str, str]:
    """`role.project_ref` -> (role, project_ref); anything else (no reference, extra parts, upper case, whitespace) is rejected."""
    match = POOLER_USER.fullmatch(username or "")
    if not match:
        raise IdentityError("pooler user must be exactly <role>.<project_ref> (lower case)")
    return match.group(1), match.group(2)


def validate_hosted_role(host: str, username: str, expected_ref: str, operation: str) -> str:
    """Return the role when host + user name identify `expected_ref` and the role is permitted for `operation`; raise IdentityError otherwise.

    `username` must already be percent-decoded. The caller is responsible for the password and for rejecting loopback targets.
    """
    permitted = OPERATION_ROLES.get(operation)
    if permitted is None:
        raise IdentityError("unknown database operation")
    if not re.fullmatch(_REF, expected_ref or ""):
        raise IdentityError("expected project reference has an invalid format")
    host = (host or "").lower()
    if POOLER_HOST.fullmatch(host):
        role, ref = split_pooler_username(username)
    else:
        direct = DIRECT_HOST.fullmatch(host)
        if not direct:
            raise IdentityError("host is not a Supabase pooler or project database host")
        ref = direct.group(1)
        if not BARE_ROLE.fullmatch(username or ""):
            raise IdentityError("database user name is not a valid role name")
        role = username
    if ref != expected_ref:
        raise IdentityError("connection identifies a different project than the expected one")
    if role not in permitted:
        raise IdentityError(f"database role is not permitted for the '{operation}' operation (permitted: {', '.join(sorted(permitted))})")
    return role


# ----------------------------------------------------------------------------------------------- what the server says about the connection
# Run inside `BEGIN READ ONLY`. Names and flags only, never data.
READER_ACCESS_SQL = """WITH me AS (SELECT r.oid, r.rolname, r.rolsuper, r.rolbypassrls OR r.rolsuper AS bypass FROM pg_roles r WHERE r.rolname = current_user),
rel AS (SELECT c.oid, c.relname, c.relkind, c.relowner, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S'))
SELECT json_build_object(
  'currentUser', current_user,
  'superuser', (SELECT rolsuper FROM me),
  'bypassRls', (SELECT bypass FROM me),
  'schemaUsage', has_schema_privilege(current_user, 'public', 'USAGE'),
  'createInPublic', has_schema_privilege(current_user, 'public', 'CREATE'),
  'memberOfOwnerRole', COALESCE((SELECT pg_has_role(current_user, o.oid, 'MEMBER') FROM pg_roles o WHERE o.rolname = 'postgres'), false),
  'noSelect', COALESCE((SELECT json_agg(relname ORDER BY relname) FROM rel WHERE CASE WHEN relkind IN ('r','p') THEN NOT has_table_privilege(oid, 'SELECT') ELSE false END), '[]'::json),
  'noSequenceRead', COALESCE((SELECT json_agg(relname ORDER BY relname) FROM rel WHERE CASE WHEN relkind = 'S' THEN NOT has_sequence_privilege(oid, 'SELECT') ELSE false END), '[]'::json),
  'writable', COALESCE((SELECT json_agg(relname ORDER BY relname) FROM rel WHERE CASE WHEN relkind IN ('r','p') THEN
        has_table_privilege(oid, 'INSERT') OR has_table_privilege(oid, 'UPDATE') OR has_table_privilege(oid, 'DELETE') OR has_table_privilege(oid, 'TRUNCATE') ELSE false END), '[]'::json),
  'rlsBlocked', COALESCE((SELECT json_agg(relname ORDER BY relname) FROM rel WHERE relkind IN ('r','p') AND relrowsecurity AND NOT (SELECT bypass FROM me)
        AND (relforcerowsecurity OR NOT pg_has_role(current_user, relowner, 'MEMBER'))), '[]'::json))::text"""


def reader_access_gaps(info: dict, *, strict: bool) -> list[str]:
    """What is missing (empty = the connection can read every public table, sequence and row).

    strict=False (disposable test databases): completeness only. strict=True (hosted Production): additionally the server-side role must BE the
    reader role, hold BYPASSRLS, and have no way to write: not superuser, no CREATE on `public`, no INSERT/UPDATE/DELETE/TRUNCATE on any table,
    not a member of the owner role. The server-reported role name is a configuration fact, but it is still not echoed.
    """
    gaps: list[str] = []
    if not info.get("schemaUsage"):
        gaps.append("role lacks USAGE on schema public")
    if info.get("noSelect"):
        gaps.append("role lacks SELECT on tables: " + ", ".join(info["noSelect"][:10]))
    if info.get("noSequenceRead"):
        gaps.append("role lacks SELECT on sequences: " + ", ".join(info["noSequenceRead"][:10]))
    if info.get("rlsBlocked"):
        gaps.append(f"role is neither BYPASSRLS nor the owner of {len(info['rlsBlocked'])} row-level-security table(s) (e.g. {info['rlsBlocked'][0]}); "
                    "a SELECT grant alone yields an incomplete or failed dump")
    if strict:
        if info.get("currentUser") != ROLE_READ:
            gaps.append(f"the server-side role of this connection is not {ROLE_READ}")
        if not info.get("bypassRls"):
            gaps.append("the reader role does not have BYPASSRLS")
        if info.get("superuser"):
            gaps.append("the reader role is a superuser")
        if info.get("createInPublic"):
            gaps.append("the reader role can CREATE objects in schema public")
        if info.get("memberOfOwnerRole"):
            gaps.append("the reader role is a member of the owner role postgres")
        if info.get("writable"):
            gaps.append(f"the reader role can modify {len(info['writable'])} table(s) (e.g. {info['writable'][0]}); it must be read-only")
    return gaps
