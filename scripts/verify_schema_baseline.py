#!/usr/bin/env python3
"""Read-only integrity and schema-only inspection for a plain pg_dump file."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


def _mask_non_sql_code(sql: str) -> str:
    """Mask comments, string literals, and dollar-quoted bodies, preserving lines."""
    out = list(sql)
    i, n = 0, len(sql)
    state = "normal"
    dollar_end = ""
    block_depth = 0

    def mask(start: int, end: int) -> None:
        for position in range(start, end):
            if out[position] not in "\r\n":
                out[position] = " "

    while i < n:
        if state == "normal":
            if sql.startswith("--", i):
                j = sql.find("\n", i)
                j = n if j < 0 else j
                mask(i, j)
                i = j
                continue
            if sql.startswith("/*", i):
                state, block_depth = "block", 1
                mask(i, i + 2)
                i += 2
                continue
            if sql[i] == "'":
                state = "single"
                mask(i, i + 1)
                i += 1
                continue
            if sql[i] == "$":
                match = re.match(r"\$[A-Za-z_0-9]*\$", sql[i:])
                if match:
                    dollar_end = match.group(0)
                    state = "dollar"
                    mask(i, i + len(dollar_end))
                    i += len(dollar_end)
                    continue
            i += 1
        elif state == "single":
            mask(i, i + 1)
            if sql[i] == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    mask(i + 1, i + 2)
                    i += 2
                    continue
                state = "normal"
            elif sql[i] == "\\" and i + 1 < n:
                mask(i + 1, i + 2)
                i += 2
                continue
            i += 1
        elif state == "dollar":
            end = sql.find(dollar_end, i)
            if end < 0:
                mask(i, n)
                break
            mask(i, end + len(dollar_end))
            i = end + len(dollar_end)
            state = "normal"
        else:
            if sql.startswith("/*", i):
                mask(i, i + 2)
                block_depth += 1
                i += 2
            elif sql.startswith("*/", i):
                mask(i, i + 2)
                block_depth -= 1
                i += 2
                if block_depth == 0:
                    state = "normal"
            else:
                mask(i, i + 1)
                i += 1
    return "".join(out)


def _table_bodies(sql: str) -> list[str]:
    bodies: list[str] = []
    pattern = re.compile(r"(?m)^CREATE TABLE(?: IF NOT EXISTS)?\s+[\w.\"$]+\s*\(")
    for match in pattern.finditer(sql):
        start = match.end() - 1
        depth, i, n = 1, start + 1, len(sql)
        quote = ""
        dollar_end = ""
        while i < n and depth:
            char = sql[i]
            if dollar_end:
                if sql.startswith(dollar_end, i):
                    i += len(dollar_end)
                    dollar_end = ""
                    continue
            elif quote:
                if char == quote:
                    if i + 1 < n and sql[i + 1] == quote:
                        i += 2
                        continue
                    quote = ""
                elif char == "\\" and quote == "'":
                    i += 2
                    continue
            elif char in "'\"":
                quote = char
            elif char == "$":
                dollar = re.match(r"\$[A-Za-z_0-9]*\$", sql[i:])
                if dollar:
                    dollar_end = dollar.group(0)
                    i += len(dollar_end)
                    continue
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    bodies.append(sql[start + 1:i])
                    break
            i += 1
    return bodies


def _top_level_parts(body: str) -> list[str]:
    parts: list[str] = []
    start, depth, i = 0, 0, 0
    quote = ""
    dollar_end = ""
    while i < len(body):
        char = body[i]
        if dollar_end:
            if body.startswith(dollar_end, i):
                i += len(dollar_end)
                dollar_end = ""
                continue
        elif quote:
            if char == quote:
                if i + 1 < len(body) and body[i + 1] == quote:
                    i += 2
                    continue
                quote = ""
            elif char == "\\" and quote == "'":
                i += 2
                continue
        elif char in "'\"":
            quote = char
        elif char == "$":
            dollar = re.match(r"\$[A-Za-z_0-9]*\$", body[i:])
            if dollar:
                dollar_end = dollar.group(0)
                i += len(dollar_end)
                continue
        elif char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif char == "," and depth == 0:
            parts.append(body[start:i].strip())
            start = i + 1
        i += 1
    if body[start:].strip():
        parts.append(body[start:].strip())
    return parts


def _count_schema_objects(sql: str) -> dict[str, int]:
    bodies = _table_bodies(sql)
    column_count = 0
    indexed_constraints = 0
    identity_sequences = len(re.findall(
        r"(?im)^ALTER\s+TABLE\b[^;]*\bADD\s+GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b",
        sql,
    ))
    for body in bodies:
        for part in _top_level_parts(body):
            if not re.match(r"(?is)^(?:CONSTRAINT\b|PRIMARY\s+KEY\b|UNIQUE\b|CHECK\b|FOREIGN\s+KEY\b|EXCLUDE\b)", part):
                column_count += 1
            if re.match(r"(?is)^(?:CONSTRAINT\s+[^\s]+\s+)?(?:PRIMARY\s+KEY|UNIQUE|EXCLUDE)\b", part):
                indexed_constraints += 1
            if re.search(r"(?is)\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b", part):
                identity_sequences += 1
    indexed_constraints += len(re.findall(r"(?im)^\s*ADD\s+CONSTRAINT\s+[^\s]+\s+(?:PRIMARY\s+KEY|UNIQUE|EXCLUDE)\b", sql))
    create_index_statements = len(re.findall(r"(?im)^CREATE\s+(?:UNIQUE\s+)?INDEX\s+", sql))
    return {
        "tables": len(bodies),
        "types": len(re.findall(r"(?im)^CREATE\s+TYPE\s+", sql)),
        "views": len(re.findall(r"(?im)^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+", sql)),
        "materialized_views": len(re.findall(r"(?im)^CREATE\s+MATERIALIZED\s+VIEW\s+", sql)),
        "foreign_tables": len(re.findall(r"(?im)^CREATE\s+FOREIGN\s+TABLE\s+", sql)),
        "columns": column_count,
        "constraints": len(re.findall(r"(?im)^\s*(?:ADD\s+)?CONSTRAINT\s+", sql)),
        "indexed_constraints": indexed_constraints,
        "create_index_statements": create_index_statements,
        "indexes": create_index_statements + indexed_constraints,
        "explicit_sequence_statements": len(re.findall(r"(?im)^CREATE\s+SEQUENCE\s+", sql)),
        "identity_sequences": identity_sequences,
        "sequences": len(re.findall(r"(?im)^CREATE\s+SEQUENCE\s+", sql)) + identity_sequences,
        "functions": len(re.findall(r"(?im)^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+", sql)),
        "triggers": len(re.findall(r"(?im)^CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+", sql)),
        "rls_enabled": len(re.findall(r"(?im)^ALTER\s+TABLE\b[^;]*\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;", sql)),
        "rls_forced": len(re.findall(r"(?im)^ALTER\s+TABLE\b[^;]*\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;", sql)),
        "policies": len(re.findall(r"(?im)^CREATE\s+POLICY\s+", sql)),
        "grants_and_revokes": len(re.findall(r"(?im)^(?:GRANT|REVOKE)\s+", sql)),
        "default_privileges": len(re.findall(r"(?im)^ALTER\s+DEFAULT\s+PRIVILEGES\b", sql)),
        "extensions": len(re.findall(r"(?im)^CREATE\s+EXTENSION\b", sql)),
    }


def verify_baseline(
    path: Path, *, expected_sha256: str, expected_size: int
) -> dict[str, object]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        raw = path.read_bytes()
    except OSError as exc:
        return {"errors": [f"Cannot read baseline file ({type(exc).__name__})"], "warnings": []}
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected_sha256:
        errors.append(f"SHA-256 mismatch: expected {expected_sha256}, got {digest}")
    if len(raw) != expected_size:
        errors.append(f"File size mismatch: expected {expected_size}, got {len(raw)} bytes")
    try:
        sql = raw.decode("utf-8")
    except UnicodeDecodeError:
        return {"sha256": digest, "size": len(raw), "errors": errors + ["Baseline is not UTF-8 SQL text"], "warnings": warnings}

    masked = _mask_non_sql_code(sql)
    if re.search(r"(?im)^\s*COPY\s+[^\n]+\s+FROM\s+stdin\s*;", masked):
        errors.append("Dump contains a COPY data block")
    if re.search(r"(?im)^\s*INSERT\s+INTO\s+", masked):
        errors.append("Dump contains a top-level INSERT data statement")
    credential_patterns = {
        "credential database URI": re.compile(r"(?i)\b(?:postgres(?:ql)?|https?)://[^\s/:@]+:[^\s@]+@"),
        "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
        "secret assignment": re.compile(r"(?i)\b(?:DATABASE_URL|DIRECT_URL|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|JWT_SECRET|SECRET_ACCESS_KEY)\b\s*[:=]\s*['\"][^'\"]{8,}['\"]"),
        "role password": re.compile(r"(?im)^\s*(?:CREATE|ALTER)\s+ROLE\b[^;]*\bPASSWORD\s+['\"]"),
        "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    }
    for label, pattern in credential_patterns.items():
        if pattern.search(sql):
            errors.append(f"Possible {label} found; value omitted")

    counts = _count_schema_objects(sql)
    if counts["tables"] == 0 or counts["columns"] == 0:
        errors.append("Dump contains no parseable public table/column definitions")
    if counts["constraints"] == 0 or counts["indexes"] == 0:
        errors.append("Dump contains no constraint or index definitions")
    if counts["functions"] == 0 or counts["triggers"] == 0:
        warnings.append("No function or trigger definitions found; compare against the capture catalog inventory")
    zero_scopes = [name for name in ("sequences", "policies", "extensions", "default_privileges") if counts[name] == 0]
    if zero_scopes:
        warnings.append("No dump statements for these scopes; verify their captured catalog inventory: " + ", ".join(zero_scopes))
    if counts["rls_enabled"] == 0 and counts["rls_forced"] == 0:
        warnings.append("No RLS enable/force statements found; compare against the capture catalog inventory")

    managed = {}
    for schema in ("auth", "storage", "realtime", "extensions", "vault", "graphql", "graphql_public"):
        amount = len(re.findall(rf"(?i)\b{schema}\s*\.", sql))
        if amount:
            managed[schema] = amount
    return {
        "sha256": digest,
        "size": len(raw),
        "counts": counts,
        "managed_schema_references": managed,
        "errors": errors,
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--expected-size", required=True, type=int)
    args = parser.parse_args()
    result = verify_baseline(args.baseline, expected_sha256=args.expected_sha256, expected_size=args.expected_size)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
