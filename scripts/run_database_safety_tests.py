#!/usr/bin/env python3
"""Run the database safety tests and fail on any failure, error, skipped test, or empty run.

Skips are detected from unittest's result object, never by searching output text: verbose output also prints test
names, and a passing test may legitimately have "skipped" in its name.
"""

from __future__ import annotations

import argparse
import sys
import unittest
from pathlib import Path


def run_strict(suite: unittest.TestSuite, stream=None, verbosity: int = 2) -> tuple[int, str]:
    """Return (exit_code, summary). Exit code is 0 only when tests ran, all passed, and none were skipped."""
    result = unittest.TextTestRunner(stream=stream or sys.stderr, verbosity=verbosity).run(suite)
    summary = (
        f"ran={result.testsRun} failures={len(result.failures)} errors={len(result.errors)} "
        f"skipped={len(result.skipped)} unexpected_successes={len(result.unexpectedSuccesses)}"
    )
    if result.testsRun == 0:
        return 1, "no tests were run; " + summary
    if not result.wasSuccessful():
        return 1, "tests failed; " + summary
    if result.skipped:
        reasons = "; ".join(f"{test.id()}: {reason}" for test, reason in result.skipped)
        return 1, f"database safety tests were skipped ({reasons}); " + summary
    return 0, summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-directory", default="tests/database")
    parser.add_argument("--pattern", default="test_*.py")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))  # tests import the scripts package, as with `python -m unittest discover` from the repo root
    suite = unittest.defaultTestLoader.discover(str(root / args.start_directory), pattern=args.pattern)
    code, summary = run_strict(suite)
    print(("PASS: " if code == 0 else "FAIL: ") + summary)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
