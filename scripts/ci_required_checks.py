#!/usr/bin/env python3
"""Deployment gate helpers for the Auto Deploy workflow (read-only GitHub API calls; no Production access).

  checks   wait until every REQUIRED check run of a commit succeeded; fail on any failure, missing check or timeout.
  is-head  exit 0 only if the commit is still the head of the branch (a newer commit supersedes an older one).

The evaluator is pure so it can be tested without the network. A skipped or neutral conclusion never satisfies a required check:
a check that did not really run is not evidence. Checks listed in IF_PRESENT (path-filtered workflows) may be absent, but if they
exist they must succeed (or be skipped by their own path filter).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

# The branch-protection checks of main (api/web/docker/database-safety: Education CI; validate-inventory: Database Migration Safety).
REQUIRED = ("api", "web", "docker", "database-safety", "validate-inventory")
IF_PRESENT = ("fresh-bootstrap",)  # Database Bootstrap runs only for database/scripts/backend path changes
FAILED = {"failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"}


def _latest(check_runs: list[dict], name: str) -> dict | None:
    runs = [run for run in check_runs if run.get("name") == name]
    return max(runs, key=lambda run: run.get("id", 0)) if runs else None  # a re-run supersedes the earlier attempt


def evaluate(check_runs: list[dict], required: tuple[str, ...] = REQUIRED, if_present: tuple[str, ...] = IF_PRESENT) -> tuple[str, list[str]]:
    """Returns (state, reasons); state is 'success', 'pending' or 'failed'."""
    failed: list[str] = []
    pending: list[str] = []
    for name in required:
        run = _latest(check_runs, name)
        if run is None:
            pending.append(f"{name}: not reported yet")
        elif run.get("status") != "completed":
            pending.append(f"{name}: {run.get('status')}")
        elif run.get("conclusion") != "success":
            failed.append(f"{name}: {run.get('conclusion')}")
    for name in if_present:
        run = _latest(check_runs, name)
        if run is None:
            continue
        if run.get("status") != "completed":
            pending.append(f"{name}: {run.get('status')}")
        elif run.get("conclusion") in FAILED:
            failed.append(f"{name}: {run.get('conclusion')}")
    if failed:
        return "failed", failed
    if pending:
        return "pending", pending
    return "success", []


def _api(path: str, token: str):
    request = urllib.request.Request(f"https://api.github.com{path}", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "vista-auto-deploy"})
    with urllib.request.urlopen(request, timeout=30) as response:  # noqa: S310 - fixed https host
        return json.load(response)


def fetch_check_runs(repo: str, sha: str, token: str) -> list[dict]:
    runs: list[dict] = []
    page = 1
    while True:
        body = _api(f"/repos/{repo}/commits/{sha}/check-runs?per_page=100&page={page}", token)
        runs.extend(body.get("check_runs", []))
        if len(body.get("check_runs", [])) < 100:
            return runs
        page += 1


def cmd_checks(args) -> int:
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("GITHUB_TOKEN is required", file=sys.stderr)
        return 2
    deadline = time.monotonic() + args.timeout_seconds
    while True:
        state, reasons = evaluate(fetch_check_runs(args.repo, args.sha, token))
        print(f"required checks for {args.sha[:12]}: {state}" + (f" ({'; '.join(reasons)})" if reasons else ""))
        if state == "success":
            return 0
        if state == "failed":
            return 1
        if time.monotonic() >= deadline:
            print("timed out waiting for required checks; not deploying", file=sys.stderr)
            return 1
        time.sleep(args.interval_seconds)


def is_head(head_sha: str, sha: str) -> bool:
    return bool(head_sha) and head_sha == sha


def cmd_is_head(args) -> int:
    token = os.environ.get("GITHUB_TOKEN", "")
    head = _api(f"/repos/{args.repo}/commits/{args.branch}", token)["sha"] if token else ""
    print(f"{args.branch} head is {head[:12] or 'unknown'}; candidate {args.sha[:12]}")
    return 0 if is_head(head, args.sha) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    checks = sub.add_parser("checks")
    checks.add_argument("--repo", required=True)
    checks.add_argument("--sha", required=True)
    checks.add_argument("--timeout-seconds", type=int, default=1200)
    checks.add_argument("--interval-seconds", type=int, default=20)
    head = sub.add_parser("is-head")
    head.add_argument("--repo", required=True)
    head.add_argument("--sha", required=True)
    head.add_argument("--branch", default="main")
    args = parser.parse_args(argv)
    try:
        return cmd_checks(args) if args.command == "checks" else cmd_is_head(args)
    except urllib.error.URLError as exc:
        print(f"GitHub API error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
