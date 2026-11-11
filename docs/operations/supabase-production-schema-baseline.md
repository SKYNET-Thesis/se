# Supabase Production schema baseline runbook

**State: MIGRATION RECOVERY DONE WITHIN VERIFIED SCOPE; FIRST LIVE SQL RUNNER
RELEASE NOT VALIDATED.** The November 9, 2026 schema-only snapshot is outside the repository.
SHA-256 is
`5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962`; size is
225119 bytes. The November 7 export remains historical. The same-window
read-only Production catalog comparison for project `ovijutkvaaxohauvuxbj` is
complete: 12 matches, 3 documented environment differences, no schema drift,
and no unverified or missing Production fields. This runbook does not authorize
Production writes.

## 1. Capture from the approved project

An authorized operator uses a trusted workstation and a read-only database
credential. Verify the Supabase dashboard project reference and connection
target before running any command. Do not put credentials in repository files,
terminal history, process listings, logs, or the dump. Prefer an interactive
secret manager or protected environment injection.

Capture only the schema, retaining ACL statements for review. `--no-owner`
avoids binding the artifact to source-project owner roles; do not use
`--no-privileges` because grants/revokes must be captured and reviewed.

```sh
umask 077
pg_dump --schema-only --no-owner --schema=public \
  --file=/secure/path/vista-production-public-schema.sql \
  "$READ_ONLY_DIRECT_DATABASE_URL"
sha256sum /secure/path/vista-production-public-schema.sql
```

The operator should supply the connection secret without expanding it in shell
history (for example via an approved secret manager). Never paste the expanded
URI into a command transcript. Record separately: project reference, capture
UTC timestamp, server version, `pg_dump` version, schema filter, and SHA-256.
Do not add the dump to Git until its security and schema-only review is done.

The dump intentionally has no row data. It will not contain definitions for
objects owned by other schemas such as `auth`, `storage`, `realtime`,
`extensions`, or `vault`; inventory dependencies/references to those managed
objects separately. Capture the installed extension names/versions. Preserve
RLS enable/force flags, policies, function definitions and security settings,
triggers, constraints, indexes, sequences, comments, and grants in `public`.
Review default privileges and role memberships separately because schema dumps
do not fully describe project-level role configuration.

## 2. Read-only catalog inventory

Run these `SELECT` queries in the same approved capture window and save their
results with the dump checksum. They are read-only and do not mutate catalog or
data.

```sql
SELECT current_database(), current_setting('server_version'),
       current_user, current_schema();

SELECT extname, extversion FROM pg_extension ORDER BY extname;

SELECT c.relkind, n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S','v','m','f')
ORDER BY c.relkind, c.relname;

SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default, is_identity, is_generated
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
ORDER BY table_name::text, conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'public'
ORDER BY tablename, indexname;

SELECT p.oid::regprocedure AS function_name, p.prosecdef AS security_definer,
       p.proconfig AS function_settings, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' ORDER BY function_name::text;

SELECT event_object_table AS table_name, trigger_name, action_timing,
       event_manipulation, action_statement
FROM information_schema.triggers WHERE trigger_schema = 'public'
ORDER BY table_name, trigger_name, event_manipulation;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual,
       with_check FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT n.nspname AS schema_name, c.relname AS object_name,
       c.relkind, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relacl IS NOT NULL
ORDER BY c.relkind, c.relname;

SELECT n.nspname AS schema_name, p.proname AS function_name,
       p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proacl IS NOT NULL
ORDER BY p.proname;

SELECT defaclrole::regrole AS grantor, defaclnamespace::regnamespace AS schema,
       defaclobjtype AS object_type, defaclacl AS privileges
FROM pg_default_acl ORDER BY 1, 2, 3;

SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

Also query Supabase-specific configuration relevant to the application from
the dashboard or supported catalog views, documenting inaccessible managed
metadata as such. Classify every cross-schema dependency as managed Supabase
infrastructure or application-owned. Do not include credentials, secret values,
table data, or row samples.

## 3. Verify artifact integrity and restore isolation

Repeat the static check (the path below is the external original; the checked-in copy has the same hash):

```sh
python scripts/verify_schema_baseline.py \
  /home/quangduc/vista-production-baseline/production-public-schema-20261109T172950Z.sql \
  --expected-sha256 5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962 \
  --expected-size 225119
```

The prepared restore script requires a loopback host and a database named
`vista_baseline_test_<suffix>`. Supply a disposable PostgreSQL 17 server,
`VISTA_BASELINE_TEST_DATABASE_URL`, and an inventory output path outside the
repository; pass `--confirm-isolated-restore` to proceed. It refuses a
non-empty `public` schema. A byte-identical schema-only copy of the baseline is also checked in under
`database/baselines/` and is used only by the local development bootstrap
(`scripts/bootstrap_dev_database.py`; see `database/README.md`). The inventories and parity reports remain
outside Git.

1. Recompute SHA-256 after transfer and compare it with the capture record.
2. Review the SQL for data-copy commands/rows, credentials, and ACLs to managed
   roles. Schema-only dumps can include function bodies containing DML; inspect
   the dump structure and confirm no table data section was emitted.
3. **Completed:** the unchanged dump restored to a disposable PostgreSQL 17.11
   container on an internal-only network. Missing source roles were represented
   by non-login placeholders only in that isolated instance. Catalog counts
   matched the dump; detailed inventory is at
`/home/quangduc/vista-production-baseline/isolated-inventory.json` (mode
`0600`). This persistent inventory was regenerated from the unchanged dump
using the isolated restore script; it includes the expected baseline SHA-256,
`dump_counts_match`, and the catalog fields used by the Production parity
verifier.
4. **Completed:** catalog definitions, RLS, policies, functions, triggers,
   grants, indexes, constraints, sequences, extension versions, and relevant
   dependencies were compared in a read-only Production transaction. See the
   [verification record](production-schema-baseline-20261109-verification.md)
   for the three documented environment differences and their evidence.
5. Confirm restored `_prisma_migrations` and `vista_schema_migrations` tables
   have definitions but no copied ledger rows. The baseline is evidence, not a
   script to replay into Production.
6. Run Prisma introspection only as a comparison aid against the isolated
   restore. Record every omitted/unsupported catalog object. Do not use Prisma
   output as the baseline source of truth.
7. **Completed:** the local verifier at
   `scripts/verify_production_catalog_parity.py` validated the project
   reference and issued only SELECTs in a read-only transaction. Its report and
   environment inventory are retained outside the repository with restricted
   permissions. Catalog parity is verified within the classifications in the
   verification record; this does not make the first live runner release
   production-ready by itself.

## 4. Baseline checksum and ownership transition

The approved snapshot checksum becomes a local baseline fingerprint and
precondition for a future runner release. This runbook does not create or
populate Production ledger rows. Any Production ledger/bootstrap transition,
runner activation, or migration release requires its own explicit approval and
reviewed cutover plan. Keep `_prisma_migrations` unchanged throughout.

The local SQL runner and its tests are prepared, including transactional
rollback. The catalog comparison gate is satisfied in local baseline evidence.
The release manifest is empty, so no new SQL migrations are pending. API deploy
workflows do not run either SQL migrations or Prisma Migrate. The first
Production runner execution, release credentials, protected approval gate, and
operational recovery procedure still require separate verification and
approval.
