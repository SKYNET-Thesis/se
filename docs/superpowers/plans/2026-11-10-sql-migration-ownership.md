# Plan: SQL Migration Ownership and Production Baseline Preparation

## Goal

Implement the approved local-only architecture in which the SQL release runner
owns future Supabase Production schema changes, `vista_schema_migrations` is its
ledger, and `_prisma_migrations` remains immutable legacy audit history.

## Steps

1. Add stdlib Python tests for manifest integrity, Git provenance, inventory
   hygiene, ordering, and protection against the seven already-applied versions.
2. Implement the validator and an empty, explicit new-stream manifest; do not
   synthesize migration SQL or modify historical Prisma migration files.
3. Add ownership policy and a new-capture baseline runbook covering schema-only
   capture, object inventory, checksum, and isolated restore parity.
4. Add an independent CI safety workflow; preserve existing local edits in
   `backend-ci.yml` and remove the ambiguous Prisma migration package alias.
5. Run validator tests, migration inventory checks, workflow static checks, and
   offline Prisma schema validation where available.

## Safety

No Production connections or writes, migration execution, Prisma Migrate,
`db push`, ledger edits, database reset, commit, or push. The November 7 dump is
historical evidence only; current Production baseline capture remains pending.
