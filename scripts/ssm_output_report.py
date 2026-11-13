#!/usr/bin/env python3
"""Print the output of a failed SSM command with secrets redacted.

Reads the JSON of `aws ssm get-command-invocation` on stdin (fields Status,
ResponseCode, StandardOutputContent, StandardErrorContent) and prints a short,
labelled report on stdout. It is diagnostic only and never runs anything.
"""
from __future__ import annotations

import json
import re
import sys

MAX_CHARS = 4000
PLACEHOLDER = "[REDACTED]"

_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    # scheme://user:password@host  (database, redis, https ...)
    (re.compile(r"([a-z][a-z0-9+.-]*://[^\s:/@]*:)[^\s@]+(@)", re.I), rf"\1{PLACEHOLDER}\2"),
    # PEM private keys
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|\Z)", re.S), PLACEHOLDER),
    # AWS access key ids
    (re.compile(r"\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{12,}\b"), PLACEHOLDER),
    # JWTs (Supabase keys, tokens)
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*"), PLACEHOLDER),
    # Authorization / Bearer / Basic credentials
    (re.compile(r"\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}", re.I), rf"\1 {PLACEHOLDER}"),
    # KEY=value or "key": "value" where the key looks secret
    (
        re.compile(
            r"""(?ix)
            (["']?[A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization|auth|session|service[_-]?role|database[_-]?url|dsn)[A-Za-z0-9_.-]*["']?\s*[:=]\s*["']?)
            [^\s"',}]+
            """
        ),
        rf"\1{PLACEHOLDER}",
    ),
    # docker login style flags
    (re.compile(r"(--(?:password|token|secret)[= ])\S+", re.I), rf"\1{PLACEHOLDER}"),
)


def redact(text: str) -> str:
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    return text


def tail(text: str, limit: int = MAX_CHARS) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return "[... truncated ...]\n" + text[-limit:]


def report(invocation: dict) -> str:
    lines = [
        f"SSM status: {invocation.get('Status', 'unknown')} "
        f"(response code {invocation.get('ResponseCode', 'unknown')})"
    ]
    for label, key in (("stdout", "StandardOutputContent"), ("stderr", "StandardErrorContent")):
        content = invocation.get(key)
        content = content if isinstance(content, str) else ""
        body = tail(redact(content)) or "(empty)"
        lines.append(f"--- SSM {label} (redacted, last {MAX_CHARS} chars) ---")
        lines.append(body)
    return "\n".join(lines)


def main() -> int:
    try:
        invocation = json.load(sys.stdin)
        if not isinstance(invocation, dict):
            raise ValueError("not an object")
    except ValueError:
        print("SSM output could not be read as JSON; nothing printed to avoid leaking it.")
        return 0
    print(report(invocation))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
