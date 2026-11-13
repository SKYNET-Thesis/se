# Staged migrations (not part of the active release manifest)

_Currently empty: D03 Stage 2 (`20261114_j_one_submission_per_attempt`) was activated and now lives in `database/migrations/` (manifest order 7). Release rules for it: [d03-stage2-release-runbook.md](../../docs/operations/d03-stage2-release-runbook.md)._

SQL here is **prepared but deliberately not registered** in `database/migrations/manifest.json`, and the manifest
validator ignores this directory (it only scans `database/migrations/`). A staged migration is released separately,
after its prerequisites, by the procedure in its own header and in
[`docs/operations/d03-student-submissions.md`](../../docs/operations/d03-student-submissions.md).

| File | Depends on | Release rule |
| --- | --- | --- |
| `20261114_j_one_submission_per_attempt.sql` (D03 Stage 2) | `20261113_i_attempt_submission_foundation` applied | Released only through the approval-gated `Production Database Release` workflow with **scope `J`** (defined in `database/release-scopes.json`, pinned SHA-256, strict pre/post catalog counts, hash-bound data preview, J-specific postflight verifier `scripts/verify_production_release_j.py`). It is plannable only after its separately reviewed manifest activation. No automatic rollback (see the ops doc). The pre-D03 API must not be running (production already runs the D03 API). |

To release a staged migration: move the file into `database/migrations/`, add its manifest entry (next contiguous
`order`, SHA-256 of the exact bytes), commit the SQL first and then point `sourceCommit` at that commit (the same
two-commit procedure as migration H), run `python3 scripts/validate_database_migration_manifest.py --release`, and
regenerate `database/baselines/dev-schema-expectation.json` with the bootstrap script on a disposable database.
Never edit a migration after it has been registered or applied.

CI: the `Database Bootstrap` workflow applies staged SQL to its throw-away runner database only (after the manifest-pinned schema
verification) with `scripts/apply_staged_migration_to_test_database.py`, so the database-backed integration tests exercise the final schema.
That script refuses anything but a loopback `vista_test_*` database and files under this directory; it is not a release mechanism.
