# Production schema baseline verification — 2026-11-09 capture

**Production project:** `ovijutkvaaxohauvuxbj`
**Capture:** `2026-11-09T17:29:50Z`
**Status:** Migration Recovery is **DONE within the verified scope**. The
Production catalog comparison has 12 `MATCH`, 3
`EXPECTED_ENVIRONMENT_DIFFERENCE`, 0 `REAL_SCHEMA_DRIFT`, and 0 `UNVERIFIED`
classifications, with no missing Production catalog fields. This result does
not validate a live SQL runner release.

The dump remains outside the repository at
`/home/quangduc/vista-production-baseline/production-public-schema-20261109T172950Z.sql`.
It has mode `0600`; this implementation did not copy or modify it.

## Integrity results

- Expected and observed SHA-256: `5b140ce7b5f9b71e5c013f45ec9298cde48db29ac5e6a979b78aea694c2ef962` — **match**.
- Expected and observed size: `225119` bytes — **match**.
- The schema dump scanner found no top-level `COPY ... FROM stdin` or `INSERT INTO` data statements.
- The scanner found no database URI with embedded credentials, private-key marker, secret assignment, role password statement, or AWS access-key marker.
- Function bodies are excluded from the row-data test, so legitimate function code containing DML is not treated as table data.

Static checks alone do not prove every catalog object was captured or that the
SQL restores successfully. The isolated restore and Production catalog
comparison below provide those additional checks.

## Objects represented in the dump

| Scope | SQL statements/count |
|---|---:|
| Tables | 88 |
| User-defined types | 1 (`lead_type` enum) |
| Views / materialized views / foreign tables | 0 / 0 / 0 |
| Columns | 777 |
| Constraints | 475 |
| Physical indexes | 234 (89 standalone `CREATE INDEX` statements plus 145 indexes created by unique/primary/exclusion constraints) |
| Sequences | 1 (owned by an identity column; no standalone `CREATE SEQUENCE` statement) |
| Functions | 12 |
| Triggers | 19 |
| RLS enabled / forced | 46 / 0 |
| Policies | 0 |
| Grants and revokes | 301 |
| Default privileges | 24 |
| `CREATE EXTENSION` statements | 0 |

The dump has one detected reference to the Supabase-managed `auth` schema. No
`storage`, `realtime`, `extensions`, `vault`, or GraphQL-managed schema
references were detected. Extension objects are not necessarily captured by a
`public`-only dump.

The dump's zero policy and extension DDL statements were not treated as proof
that Production has none. The read-only catalog comparison below separately
verified public policies, installed extension names/versions, and
role/default-privilege behavior.

The machine-readable baseline evidence record is
[`../../database/baselines/production-baseline-evidence.json`](../../database/baselines/production-baseline-evidence.json).
The detailed parity report and Supabase environment inventory remain outside
the repository at `/home/quangduc/vista-production-baseline/` with restricted
permissions; they are not source-controlled.

Production migration history evidence records 14 rows in
`public._prisma_migrations` and 7 rows in `public.vista_schema_migrations`.
The seven SQL-runner versions remain historical and must not be replayed:
`20261104_curriculum_foundation`, `20261105_question_bank_foundation`,
`20261106_question_bank_quiz_attempt`,
`20261106_classroom_enrollment_lifecycle`,
`20261106_iot_lifecycle_foundation`, `20261106_iot_publish_intent`, and
`20261108_iot_lifecycle_access_restrictions`.

## Persistent isolated inventory and Production parity

The isolated baseline inventory is stored outside the repository at
`/home/quangduc/vista-production-baseline/isolated-inventory.json` with mode
`0600`. It was regenerated from the unchanged verified dump using
`scripts/restore_schema_baseline_isolated.py` in an isolated PostgreSQL 17.11
container with networking disabled. Its `baseline_sha256` matches the capture
fingerprint and `dump_counts_match` is true.

The final read-only comparison used the verified project reference
`ovijutkvaaxohauvuxbj`, database `postgres`, and PostgreSQL 17.6. The result is
`EXPECTED_ENVIRONMENT_DIFFERENCE`: all 12 comparable schema fields match and
the only three differences are documented below. No Production fields were
missing. The detailed JSON report is retained outside Git at
`/home/quangduc/vista-production-baseline/production-catalog-parity-report.json`.

The three differences are environment/bootstrap differences, not observed
VISTA public-object drift:

1. **Default privileges:** all six public-schema entries match. Eighteen
   additional entries are three each in Supabase-managed `auth`, `extensions`,
   `graphql`, `graphql_public`, and `realtime` schemas, plus `storage`; their
   grantors are the recorded Supabase administrative roles or `postgres`.
2. **Extensions:** Production has `pg_stat_statements` 1.11, `pgcrypto` 1.3,
   `plpgsql` 1.0, `supabase_vault` 0.3.1, and `uuid-ossp` 1.1. The isolated
   restore has `plpgsql`. Catalog dependency review found `plpgsql` required by
   the public functions; no dependency from VISTA public objects was observed
   for the other four. PostgreSQL 17 provides `gen_random_uuid` as a core
   function.
3. **Public schema ACL:** Production is owned by `pg_database_owner` and
   grants `USAGE` to `PUBLIC`; isolated restore is owned by `postgres` and
   does not grant `USAGE` to `PUBLIC`. The explicit `USAGE` grants to
   `anon`, `authenticated`, and `service_role` match. Production's broader
   `PUBLIC USAGE` is preserved as a real ACL difference and is not claimed to
   be equivalent to the isolated ACL.

The baseline fingerprint is pinned in the intentionally empty new-stream
manifest. The parity result satisfies the local baseline comparison gate, but
does not authorize or validate a Production migration release. The first
Production SQL-runner deployment remains untested and requires a separate
release review and explicit approval.

## Isolated restore status

**VERIFIED in an isolated local container.** The unchanged dump restored into
PostgreSQL 17.11 with networking disabled. The restore inventory matched the
dump for tables (88), user-defined types (1), views/materialized
views/foreign tables (0/0/0), columns (777), constraints (475), physical
indexes (234), sequences (1), functions (12), triggers (19), RLS
enabled/forced (46/0), and policies (0). Both migration ledgers contain zero
rows, as expected for schema-only capture. Detailed catalog and ACL output is
stored outside the repository at
`/home/quangduc/vista-production-baseline/isolated-inventory.json` with mode
`0600`.

The restore first exposed a missing placeholder role (`supabase_admin`); the
restore helper was corrected to include default privilege grantors/grantees.
The failed restore ran in a single transaction and rolled back. A fresh test
database was then used for the successful restore. The prepared
[`restore_schema_baseline_isolated.py`](../../scripts/restore_schema_baseline_isolated.py)
refuses non-loopback hosts and databases whose names do not start with
`vista_baseline_test_`.
