# Supabase IoT migration runner: IPv4 Session Pooler evidence

**Scope:** connection-path research only, completed 2026-11-08.  No database
connection was made and this note does not authorize a production change.

## Decision

The normal, preferred Supabase route for migrations is the direct Postgres
connection.  It is not reachable from this runner's IPv4-only network unless
the project has purchased/enabled the IPv4 add-on.  When direct IPv6 is
unavailable, the **Shared Session Pooler** is the supported IPv4 fallback for
the repository's proposed application-owned SQL runner, subject to every
release gate below.  Use the exact `Session pooler` string copied from the
Supabase Dashboard Connect dialog:

```text
postgresql://<migration-role>.<project-ref>:<password>@<pooler-host>:5432/postgres?sslmode=require
```

Do not construct `<pooler-host>` from a region; Supabase documents its pooler
cluster index as non-derivable.  The shared-pooler user name must include the
project ref (`<role>.<project-ref>`), unlike the direct connection user name.
Percent-encode reserved password characters.  Keep the URL in an approved
secret store/environment for the single runner invocation: never commit it,
place it in a Prisma environment file, shell history, or CI logs.

## Compatibility conclusion

| Path | Result for this release runner | Reason |
| --- | --- | --- |
| Direct `db.<project-ref>.supabase.co:5432` | Preferred but unavailable on IPv4-only network without IPv4 add-on | Supabase explicitly recommends direct connections for migrations, dumps, backups/restores, and replication; it is IPv6 unless the add-on is enabled. |
| Shared **Session** Pooler `<pooler-host>:5432` | **Supported fallback, conditional GO** | It is IPv4 on every plan and preserves session features, including session-level advisory locks. That matches the repository design requiring one runner session to obtain an advisory lock, validate, apply ordered SQL, and write its application ledger. |
| Shared Transaction Pooler `<pooler-host>:6543` | **NO-GO** | Transaction mode does not preserve session state and Supabase specifically says not to use it for CLI `db pull`/`db diff`. It is incompatible with a session-level advisory-lock runner. |
| Prisma `migrate deploy`, `migrate resolve`, or `db push` | **NO-GO regardless of route** | The repository's production-baseline decision forbids these because the Prisma history is divergent; changing connection transport cannot make that ledger safe. |

The Session Pooler conclusion applies only to the separately approved,
application-owned SQL migration stream.  The repository currently documents
the runner's required behavior, but does not contain an executable approved
runner implementation; connection success alone is not a release approval.

## Required runner and release checks before any execution

1. Use exactly one Session-Pooler connection for the critical section and
   acquire/hold the runner's PostgreSQL advisory lock on that session until
   the transaction and ledger write complete. Do not use a transaction-pooler
   URL or an application-side reconnecting pool for that critical section.
2. Require TLS (`sslmode=require`, or reviewed `verify-full` with the Supabase
   root certificate), the dedicated least-privilege migration role, short
   connection/statement/lock timeouts, and redacted logging.
3. Validate the separately approved application-owned ledger and recorded
   production-baseline fingerprint. `public._prisma_migrations` is
   read-only evidence and must not be written or "repaired".
4. Confirm PITR/backup restore owner, immediate read-only catalog/ledger
   preflight, both IoT tables absent, parent UUID keys present, and runtime
   feature flags off. Stop on any difference or prior/conflicting ledger row.
5. Apply only the two immutable SQL files below, in that order, then run the
   documented catalog and application-ledger post-checks before enabling any
   IoT feature flag.

## Reviewed IoT manifest fingerprints

| Ordered version | SHA-256 |
| --- | --- |
| `20261106_iot_command_lifecycle` | `a351f372d645ce630997841f1e8ccad66f9881c3c8b8aa514a8f3a1d9464c45d` |
| `20261106_iot_publish_intent` | `fad0cfbbca5680e9825841a529c9a09b4e0d6457af043b95a5d07f60d7009833` |

## Evidence

- [Supabase: Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) — connection-selection table marks direct as the migration route; documents direct IPv6 behavior, IPv4 add-on, Session Pooler as the IPv4-only alternative, Session Pooler port 5432/tenant user, Session mode support for advisory locks, and TLS guidance.
- [Supabase: Connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits) — Shared Pooler is IPv4-only; session mode is the long-lived-session alternative when IPv4 is required.
- [Supabase: CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows) — for CLI catalog workflows, direct is preferred; on IPv4-only networks Session Pooler is the fallback and Transaction Pooler must not be used for `db pull`/`db diff`.
- [Repository migration readiness](supabase-iot-migration-readiness.md) — active release gates, required application-owned ledger, immutable two-file manifest, and prohibition on Prisma production migration commands.
- [Repository baseline reconciliation](supabase-schema-baseline-reconciliation.md) — runner contract (advisory lock, baseline validation, ordered transactional SQL, application-owned ledger) and immutable manifest fingerprints.

