# VISTA main schema release

## Production execution record — 2026-11-09

The seven migrations in `manifest.json` were applied to Supabase Production
project `ovijutkvaaxohauvuxbj`, database `postgres`, using the reviewed
release runner through the project Session Pooler. TLS hostname and CA
verification used `verify-full`. The Direct Connection endpoint is IPv6-only
and was unreachable from the execution host. The runner's allowlist accepts
only the verified project Direct endpoint or the exact project-qualified
Session Pooler endpoint.

The runner applied migration SQL and wrote the seven `executed` rows to
`public.vista_schema_migrations` in its release transaction. The separate
read-only `postcheck.sql` passed. The current read-only schema fingerprint is
`1d0453953658bfe9b6db7d14f477c023`. Production identity and all seven ledger
rows/checksums were rechecked over the strict-TLS Session Pooler.

AWS deployment was not performed. Prisma history reconciliation is pending;
do not rerun the Production release runner or execute any migration SQL as
part of that follow-up.

## Migration order and checksums

| Order | Migration | SHA-256 | Production provenance |
| ---: | --- | --- | --- |
| 1 | `20261104_curriculum_foundation` | `57cb9b29751f3392214c54ac0291a696fbdb03f5ab252ab9f9e836822f305359` | `executed` |
| 2 | `20261105_question_bank_foundation` | `cfad4d384a5ff551d68c5ac57d7c9b1981c2d2e52a37a2060ee1f936a3516056` | `executed` |
| 3 | `20261106_question_bank_quiz_attempt` | `e9c2c214dc836d32c7031a4e185c77063a1b4e84ca3c6ff86109f0663b13f825` | `executed` |
| 4 | `20261106_classroom_enrollment_lifecycle` | `fc776052d91b80d5b5aef35d3bf2e9cadb2b9896e0adbce36a5e66a5b5a3cd7e` | `executed` |
| 5 | `20261106_iot_lifecycle_foundation` | `d5d1ebee0812dfb4388d8deb3188b8c8df9e6815f6a73839b3c8dd88f5883eed` | `executed` |
| 6 | `20261106_iot_publish_intent` | `fad0cfbbca5680e9825841a529c9a09b4e0d6457af043b95a5d07f60d7009833` | `executed` |
| 7 | `20261108_iot_lifecycle_access_restrictions` | `4e2ac74232b536d0193be32c61fd5922017644721e893423e553362109b01f98` | `executed` |

Release ID: `20261108-main-schema`
Source commit pinned by the release manifest: `c23f3366ef78d20d17979b712af5d9f16aa27512`

## Prisma history follow-up

The seven release migrations are not yet represented in
`public._prisma_migrations`. Do not run their SQL again. Prisma 5.22.0
`migrate status` currently exits 1 because the checkout lacks nine historical
migration directories represented by ten Production rows, and three other
successful Production migrations have checksums that do not match their
current local SQL. The original files and matching versions were not found in
available Git refs/history. See
[`READINESS_REPORT_2026-11-08.md`](READINESS_REPORT_2026-11-08.md) for the
row-by-row inventory and blockers.

After exact historical SQL and checksums are recovered from an authoritative
source and the history is reviewed, the supported metadata-only operation for
each already-executed release migration is `prisma migrate resolve --applied
<migration-name>`. This operation has not been run. Do not resolve the
pre-existing rolled-back `20261015_symbolic_evaluation_history` attempt or
change any `_prisma_migrations` row without separate approval. Do not run
`migrate deploy`, `migrate dev`, `db push`, or `migrate reset` for this follow-up.

## Artifact boundaries

- `manifest.json` pins the release ID, source commit, baseline fingerprint,
  migration order, SQL paths, and checksums.
- `run-release.sh` performs schema SQL execution and app-owned ledger writes;
  it does not reconcile Prisma history.
- `postcheck.sql` is read-only and passed after execution.
- The two untracked disposable test harnesses are not part of the release
  manifest. Keep them outside the release commit unless they are separately
  adopted as maintained tooling.
- No Production backup contents, environment files, or credentials belong in
  this package.
