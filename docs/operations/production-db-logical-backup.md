# Production database release: logical backup mode (Supabase Free)

Status: **implemented, not executed.** No backup, restore or migration has been run against Production. Stage J stays excluded.

Supabase Free has no managed backups and no PITR. `backup_mode=logical` of `production-database-release.yml` replaces the managed-backup
check with a verified `pg_dump` backup. `backup_mode=managed` (default) is unchanged: it still requires PITR or a COMPLETED backup
< 26 h (Supabase Management API), checked in preflight and again right before apply.

## Flow

1. **preflight** (env `production-database-preflight`): reviewed main SHA, manifest/safety checks, read-only plan + snapshot. Logical mode skips only the managed API check.
2. **backup** (same environment, read-only DB credential, OIDC write role). Runs `scripts/production_db_backup.py run`:
   * identity check (`scripts/supabase_identity.py`): host and user must name the Production project **and** the user must be the backup reader role `vista_backup_reader` (the owner role `postgres` is refused); plan `status=ready`.
   * `pg_dump --format=custom --schema=public` (one repeatable-read snapshot = transactionally consistent). The client major must be ≥ the server major (CI installs PG17; Production is 17.6).
   * before/after comparison of catalog counts, per-table row counts and the migration ledger; any drift ⇒ retry (3×), then fail closed (writes during the dump window).
   * SHA-256 of the dump; `pg_restore --list` must succeed.
   * **restore test** into a throw-away database on a `postgres:17` service container (loopback only, dropped afterwards): `pg_restore --exit-on-error --single-transaction`, then checks `integrity_sha256`, `pg_restore_clean_exit`, `catalog_counts_equal`, `row_counts_equal` (every public table), `ledger_equal`, `critical_tables_present`. Any failure ⇒ nothing is uploaded and the job fails.
   * upload to the private bucket with **SSE-KMS** and an S3 `SHA256` checksum, read back (`HeadObject`: version id, checksum, size, encryption, KMS key) and compare; then upload `evidence.json`.
   * the dump lives only in a private `0700` temp dir and is deleted in a `finally`; it is **never** a workflow artifact. Logs show hashes, sizes, version ids and check names only; stderr from `pg_dump`/`pg_restore` is scrubbed of URLs, host, user and password; credentials go through a `0600` passfile, never argv.
3. **apply** (env `production-database-apply`, required reviewers) `needs: [preflight, backup]`. The job does not start (and cannot read `PRODUCTION_DATABASE_APPLY_URL`) until a reviewer approves **after** backup + restore test succeeded. Then: re-fetch `evidence.json` via the OIDC **read** role and `verify-evidence`: bindings, age ≤ 12 h, restore test result, PostgreSQL ≥ 17, object checksum/version/size/encryption/KMS key. Then `production_db_release.py apply --backup-mode logical` revalidates the evidence kind, binding, freshness and re-computes the plan hash against the live database before applying.

Evidence binds: `projectRef`, `scope`, `planHash`, `manifestSha256`, `releaseCommit` (the reviewed main SHA), `sourceCommit`, run id, dump SHA-256, object version. A backup from another project, scope, manifest, commit or plan is rejected. Missing evidence, restore failure, a missing role/bucket/key variable, stale evidence or a mode/evidence-kind mismatch all fail closed.

## One-time configuration (not done by this change)

GitHub environment **variables** (not secrets) in `production-database-preflight`: `DB_BACKUP_WRITE_ROLE_ARN`, `DB_BACKUP_BUCKET`, `DB_BACKUP_KMS_KEY_ARN`.
In `production-database-apply`: `DB_BACKUP_READ_ROLE_ARN`, `DB_BACKUP_BUCKET`, `DB_BACKUP_KMS_KEY_ARN`. Existing secrets stay as they are; no AWS keys are stored in GitHub.

The read-only Production role (`PRODUCTION_DATABASE_READONLY_URL`) needs `USAGE` on `public`, `SELECT` on every `public` table and sequence **and `BYPASSRLS` (or ownership)**: Production tables have RLS enabled with no policies, so a plain `SELECT` role gets `pg_dump` aborted (`query would be affected by row-level security policy`) and `count(*)` = 0; `--enable-row-security` would instead silently dump zero rows (verified on PostgreSQL 17). `production_db_backup.py` checks all of this before dumping (`reader_access_gaps`, names only) and `pg_dump` must run through the session pooler (5432) or direct connection. See [Reader role](#reader-role) for the exact (not yet executed) SQL and the verification status.

AWS (account 157098813811, ap-southeast-1) — **proposal, needs separate approval; nothing was created** (read-only check 2026-11-13: the GitHub OIDC provider exists, no backup bucket, alias or roles). The proposal is now written as `infra/terraform/db-backup.tf` (validated; read-only targeted plan: 13 additions, 0 changes, 0 destroys, no `aws_instance`; reproduce with `infra/terraform/scripts/plan-db-backup.sh`). **Do not run a plain `terraform apply`**: the same plan also wants to replace `aws_instance.api` (newer AMI + user-data drift) and change 11 other resources; apply only with reviewed `-target` for the `db_backup` resources, or after that drift is resolved.
* S3 bucket, e.g. `vista-prod-db-backups-157098813811`: Block Public Access all on, versioning on, default SSE-KMS with a dedicated CMK (rotation on), bucket policy denying non-TLS requests and `PutObject` without `aws:kms`, lifecycle: expire current/non-current versions after 90 days (matches `retentionDays`), optionally Object Lock (governance) for tamper resistance.
* IAM OIDC provider `token.actions.githubusercontent.com` (if absent) and two roles:
  * write role — trust `repo:<org>/<repo>:environment:production-database-preflight` (+ `aud sts.amazonaws.com`); permissions `s3:PutObject` on `production/ovijutkvaaxohauvuxbj/*`, `s3:GetObject`/`HeadObject` on the same prefix, `kms:GenerateDataKey`/`kms:Encrypt`/`kms:Decrypt` on the key. No delete.
  * read role — trust `...:environment:production-database-apply`; `s3:GetObject`/`HeadObject` on the prefix and `kms:Decrypt`. No write.
  * restoring a dump during recovery is a human operation with a separately approved break-glass role.

## Reader role

Supabase documents the pattern ([troubleshooting](https://supabase.com/kb/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)). **Proposed SQL, NOT executed; run by the database owner after approval, as `postgres`, once:**

```sql
CREATE ROLE vista_backup_reader LOGIN PASSWORD '<generated, stored only in the GitHub environment secret>' BYPASSRLS;
ALTER ROLE vista_backup_reader SET default_transaction_read_only = on;
GRANT USAGE ON SCHEMA public TO vista_backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vista_backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO vista_backup_reader;
-- tables created later (D-I creates 4) must be readable too, otherwise the next backup fails closed:
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO vista_backup_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON SEQUENCES TO vista_backup_reader;
```

### Connection strings and role separation (enforced in code)

`scripts/supabase_identity.py` is the single source of truth. A role is accepted only for its operation, only for the exact project reference `ovijutkvaaxohauvuxbj`, and only in these two shapes (anything else fails closed):

| Form | User | Host |
|---|---|---|
| Supavisor pooler (what GitHub runners need: IPv4) | `<role>.ovijutkvaaxohauvuxbj` | `<label>.pooler.supabase.com` |
| Direct (IPv6 only unless the IPv4 add-on is enabled) | `<role>` | `db.ovijutkvaaxohauvuxbj.supabase.co` |

| Operation | Permitted role | Used by | Secret / environment |
|---|---|---|---|
| `read` | `vista_backup_reader` | `plan`, `snapshot`, `compat` (schema gate), the logical backup, verifier `--snapshot` | `PRODUCTION_DATABASE_READONLY_URL` (`production-database-preflight`, and the `schema-gate` job) |
| `apply` | `postgres` | `apply` (plan recomputation, pre-snapshot, migration transaction, postflight `--verify`) | `PRODUCTION_DATABASE_APPLY_URL` (`production-database-apply` only) |

Neither role is accepted for the other operation: the reader credential can never apply, and the owner credential is refused by the preflight, the gate and the backup. **Consequence:** until `PRODUCTION_DATABASE_READONLY_URL` points to `vista_backup_reader`, preflight, the deployment schema gate and the backup fail closed (by design; the schema gate is already red while D-I is pending).

Expected reader URL (session-mode pooler, port 5432; `pg_dump` needs session mode; password URL-encoded, only `sslmode`, `connect_timeout`, `application_name` query parameters are accepted):

```
postgresql://vista_backup_reader.ovijutkvaaxohauvuxbj:<URL-encoded password>@<pooler host of the API's DATABASE_URL>:5432/postgres?sslmode=require
```

**The user name is not trusted on its own.** On Production every read entry point (`plan`, `snapshot`, `compat`/schema gate, the backup) also asks the server (`READER_ACCESS_SQL`, read-only) and fails closed unless the connection really is `vista_backup_reader` with `BYPASSRLS`, `USAGE`/`SELECT` on every `public` table and sequence, and **no** write path: not superuser, no `CREATE` on `public`, no `INSERT/UPDATE/DELETE/TRUNCATE` on any table, not a member of `postgres`. `apply` confirms server-side that it runs as `postgres`. A role that merely has the right name but, for example, lacks `BYPASSRLS` would otherwise read RLS-protected tables (the migration ledger included) as empty. If the hosted project grants table privileges to `PUBLIC` or to the reader beyond SELECT, these checks fail closed and name the gap.

`SUPABASE_URL` (`PRODUCTION_SUPABASE_URL`) stays `https://ovijutkvaaxohauvuxbj.supabase.co` and must carry the same reference. Error messages never contain the user name, host, reference or password supplied.

Deliberately **not** `pg_read_all_data` (reads `auth`/`storage` too and still does not bypass RLS). RLS stays enabled everywhere; no application role, policy or grant changes. `BYPASSRLS` gives this one login read access to every row, so its URL is a secret of `production-database-preflight` only and rotates after use; `default_transaction_read_only` is only a default (a session can switch it off) and the tooling wraps its reads in `BEGIN READ ONLY`.

Evidence (disposable container of `public.ecr.aws/supabase/postgres:17.11.0.011`, 2026-11-13; the hosted Free project was **not** touched): `postgres` (`rolsuper=f`, `rolcreaterole=t`, `rolbypassrls=t`) created the role; `pg_dump --schema=public` returned all rows (also with `FORCE ROW LEVEL SECURITY`); `pg_read_all_data` alone failed with the RLS error; `GRANT postgres TO role` was refused (no ADMIN option); `SELECT`-only failed. PostgreSQL itself only lets a role that holds `BYPASSRLS` grant it, which `postgres` does on Supabase. **Remaining uncertainty:** the hosted Free project's `postgres` role attributes were not inspected (a read-only `SELECT rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname='postgres'` under the preflight approval answers it). Fallbacks if it were refused: Supabase support request, or the Supabase-hosted logical backup via the dashboard/CLI (still not PITR); do not use the `postgres` owner URL for the backup job.

## Restoring (recovery; needs approval)

Create an empty PostgreSQL 17 database (a new Supabase project/branch or local), create the Supabase roles referenced by ACLs (`anon`, `authenticated`, `service_role`, … as `NOLOGIN`), `pgcrypto` in schema `extensions`, `DROP SCHEMA public CASCADE`, then `pg_restore --exit-on-error --single-transaction --no-owner --dbname <target> backup.dump`. Verify with the same row-count and ledger comparison recorded in `evidence.json`. Cutover to the restored database is a separate decision.

## Limitations (be honest about what this is)

* **Not PITR.** Recovery point = dump time. Anything written between the dump and a failure is lost; the evidence window is capped at 12 h and the dump runs right before approval, but approval waiting time widens the gap. Re-run the release if approval takes long (evidence older than 12 h is refused).
* Only the `public` schema is dumped. Supabase-managed schemas (`auth`, `storage` metadata, `realtime`, `vault`, extensions) are **not** captured, so auth users/sessions, storage object metadata and secrets are not recoverable from this backup. Application `users` data lives in `public`; verify that nothing in `public` has a foreign key to `auth.*` (none in the migration set today; the restore test fails closed if one appears). Storage objects (S3 media) are unaffected by this release.
* Roles, passwords, grants to roles that do not exist elsewhere and Supabase-internal settings are not restored (`--no-owner`; ACL roles are stubbed `NOLOGIN` in the test target). A Supabase-hosted restore must re-apply grants if needed.
* Free-plan pooler/statement limits (2 min `statement_timeout`) could abort a very large `COPY`; the database is ≈17 MB today. A failing dump fails the job closed.
* The disposable restore target is a plain `postgres:17` container, not Supabase's image, so extensions/hooks specific to Supabase are not exercised. PostgreSQL major 17 compatibility **is** exercised (restore server must be ≥ 17; pg_dump client must be ≥ the server major).
* Dump consistency: pg_dump is snapshot-consistent; the before/after comparison additionally rejects writes during the window, so a restore equal to the "before" state is proven, not assumed.
* Objects are protected by the private bucket, SSE-KMS and IAM; GitHub never stores the dump. Evidence summary (hashes, version id, restore result, no data) is uploaded as the `production-db-release-evidence` artifact like before.
* The first real use will also be the first real restore test of production-sized data; run the workflow in `logical` mode once with no pending work only after approval (it refuses `nothing_to_do`, so the first real run is the release itself).

## Completeness guards (all tested)

Before upload a backup must pass: reader-access check (above); archive listing has a table and a data section for every public table; the ledger is non-empty and not every table has zero rows; restore into PG17 reproduces catalog, per-table row counts and ledger; and the required restore check `dump_not_empty`. A well-formed but zero-row archive (the silent `--enable-row-security` failure) fails `row_counts_equal`; a truncated/empty archive fails the listing check.

## Tests

`tests/database/test_production_db_backup.py` (real `pg_dump`/`pg_restore` on a disposable loopback PostgreSQL 17, local directory instead of S3) and updates to `test_production_db_release.py` and the workflow safety checker. Run: `python3 scripts/run_database_safety_tests.py` with `VISTA_D03_MIGRATION_TEST_URL` set to a loopback test server.
