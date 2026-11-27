# Staged migrations (not part of the active release manifest)

_Currently holds migrations M and R (below). S was promoted to the manifest (scope `S`). Q was promoted to the manifest (scope `O-Q`). D03 Stage 2 (`20261114_j_one_submission_per_attempt`) was activated and now lives in `database/migrations/` (manifest order 7). Release rules for it: [d03-stage2-release-runbook.md](../../docs/operations/d03-stage2-release-runbook.md)._

SQL here is **prepared but deliberately not registered** in `database/migrations/manifest.json`, and the manifest
validator ignores this directory (it only scans `database/migrations/`). A staged migration is released separately,
after its prerequisites, by the procedure in its own header and in
[`docs/operations/d03-student-submissions.md`](../../docs/operations/d03-student-submissions.md).

| File | Depends on | Release rule |
| --- | --- | --- |
| `20261116_m_revoke_public_temp_privilege.sql` (database-wide TEMP revocation) | L applied (K-L released and verified) | **Production-BLOCKED and unreleased.** Moved here byte-identical (SHA-256 `80619e7d…9f38`) so K and L can be released first (scope `K-L`); never marked applied. Hosted compatibility is unproven (platform roles beyond M's allowlist lose TEMP; see `docs/operations/production-lms-k-m-hosted-verification.md`). Released later only through its own reviewed scope `M`; PUBLIC TEMP stays an explicitly tracked residual risk until then. CI applies it to the disposable runner database so its tests keep running. |
| `20261120_r_device_provisioning.sql` (per-device identity: `robot_devices`, `device_enrollment_challenges`, RLS + runtime-role grants, permission `education.devices.manage`) | Robots, organizations, roles/permissions present | **Unapproved, additive, idempotent; not for Production until approved.** SHA-256 `d6b304abeb9eae384b4aa7b8a5ae0ea5ec0064f3c43f52fe0b83b3c044a780ca`. Feature stays off unless `DEVICE_PROVISIONING_ENABLED=true`. Contract: [`DEVICE_PROVISIONING_CONTRACT.md`](../../docs/acceptance/DEVICE_PROVISIONING_CONTRACT.md). |
| `20261114_j_one_submission_per_attempt.sql` (D03 Stage 2) | `20261113_i_attempt_submission_foundation` applied | Released only through the approval-gated `Production Database Release` workflow with **scope `J`** (defined in `database/release-scopes.json`, pinned SHA-256, strict pre/post catalog counts, hash-bound data preview, J-specific postflight verifier `scripts/verify_production_release_j.py`). It is plannable only after its separately reviewed manifest activation. No automatic rollback (see the ops doc). The pre-D03 API must not be running (production already runs the D03 API). |

To release a staged migration: move the file into `database/migrations/`, add its manifest entry (next contiguous
`order`, SHA-256 of the exact bytes), commit the SQL first and then point `sourceCommit` at that commit (the same
two-commit procedure as migration H), run `python3 scripts/validate_database_migration_manifest.py --release`, and
regenerate `database/baselines/dev-schema-expectation.json` with the bootstrap script on a disposable database.
Never edit a migration after it has been registered or applied.

CI: the `Database Bootstrap` workflow applies staged SQL to its throw-away runner database only (after the manifest-pinned schema
verification) with `scripts/apply_staged_migration_to_test_database.py`, so the database-backed integration tests exercise the final schema.
That script refuses anything but a loopback `vista_test_*` database and files under this directory; it is not a release mechanism.
