# VISTA database release and Prisma history status — 2026-11-09

## Production release status

**The seven release migrations are applied in Production. The release postcheck passed. Prisma history reconciliation is blocked pending recovery of original migration SQL and resolution of checksum conflicts. AWS deployment was not performed.**

Target: Supabase project `ovijutkvaaxohauvuxbj`, database `postgres`,
PostgreSQL 17. Strict TLS `verify-full` was used through the verified project
Session Pooler with the trusted Supabase CA. The Direct Connection endpoint is
IPv6-only and could not be reached from the execution host. No TLS verification
was disabled.

The release runner executed all seven migrations in manifest order. Its
transaction recorded `executed` provenance in
`public.vista_schema_migrations`. The read-only postcheck passed. A fresh
read-only query confirmed the seven rows, checksums, release ID, source commit,
and current fingerprint `1d0453953658bfe9b6db7d14f477c023`.

| Migration | Production provenance | SHA-256 |
| --- | --- | --- |
| `20261104_curriculum_foundation` | `executed` | `57cb9b29751f3392214c54ac0291a696fbdb03f5ab252ab9f9e836822f305359` |
| `20261105_question_bank_foundation` | `executed` | `cfad4d384a5ff551d68c5ac57d7c9b1981c2d2e52a37a2060ee1f936a3516056` |
| `20261106_question_bank_quiz_attempt` | `executed` | `e9c2c214dc836d32c7031a4e185c77063a1b4e84ca3c6ff86109f0663b13f825` |
| `20261106_classroom_enrollment_lifecycle` | `executed` | `fc776052d91b80d5b5aef35d3bf2e9cadb2b9896e0adbce36a5e66a5b5a3cd7e` |
| `20261106_iot_lifecycle_foundation` | `executed` | `d5d1ebee0812dfb4388d8deb3188b8c8df9e6815f6a73839b3c8dd88f5883eed` |
| `20261106_iot_publish_intent` | `executed` | `fad0cfbbca5680e9825841a529c9a09b4e0d6457af043b95a5d07f60d7009833` |
| `20261108_iot_lifecycle_access_restrictions` | `executed` | `4e2ac74232b536d0193be32c61fd5922017644721e893423e553362109b01f98` |

Release ID: `20261108-main-schema`
Source commit in manifest: `c23f3366ef78d20d17979b712af5d9f16aa27512`

Staging remains a separate environment. Its six prior records and migration 7
staging/disposable validation were not rerun for this report.

## Prisma history investigation

The current checkout contains 11 migration directories. Prisma CLI 5.22.0
`migrate status`, run read-only over strict-TLS Session Pooler, reported 11
local migrations, seven release migrations not yet recorded in Prisma history,
and ten database history rows whose migration names are absent locally. It
exited 1 because the two histories differ.

The 14 Production rows were retrieved with their checksums and status fields.
Ten rows belong to nine migration names absent from this checkout:

| Production migration row | Production status | Production SHA-256 | Original SQL recovered from local Git? | Checksum comparison | Recommended treatment |
| --- | --- | --- | --- | --- | --- |
| `20261014_add_auth_user_mapping` | Successful | `765e750b7b621d8109cb134e2bdad0bd0d34049625306721e5c0b4aad15882de` | No | Not possible; SQL absent | Recover exact source file from an authoritative repository and verify the hash before adding it locally. |
| `20261014_add_auth_user_provisioning_trigger` | Successful | `7db32288f6ee9a10364240f22d7de7bd87fcca5bb29c3fe7d91c4b80859fcde3` | No | Not possible; SQL absent | Same; do not fabricate or baseline from the name. |
| `20261014_phase2b_assignment_permissions` | Successful | `d57b805c0330697b7e0ebe219f449a2bc04ee0191c8b088ceab081bddf32ac3c` | No | Not possible; SQL absent | Recover exact source and verify the hash. |
| `20261014_phase2c_submission_program_version` | Successful | `af6bbb25ab31c4bf987b59512eaa87d0a054025072a6bceec9d4177927b8b52d` | No | Not possible; SQL absent | Recover exact source and verify the hash. |
| `20261014_phase2d_assessment_permissions` | Successful | `c740dbacb3d1f40838c122e6c6f00434cfe902eb5404339c1322ef0c2338fa07` | No | Not possible; SQL absent | Recover exact source and verify the hash. |
| `20261014_phase3_experiment_permissions` | Successful | `6b8b90e3733c417acfb62fb318be7dbc14dc7542c9f81f4f3c5dd12468868fbf` | No | Not possible; SQL absent | Recover exact source and verify the hash. |
| `20261015_symbolic_evaluation_history` — rolled-back attempt | Rolled back; `finished_at` is null, `rolled_back_at` is set | `c6cb0433a1cb681ef24b61c1441e373933f09a7454f46caba58e0b3201ff6a16` | No | Not possible; SQL absent | Preserve this row and status. Do not mark it applied or rolled back again. |
| `20261015_symbolic_evaluation_history` — later row | Successful; same migration name and checksum as the rolled-back attempt | `c6cb0433a1cb681ef24b61c1441e373933f09a7454f46caba58e0b3201ff6a16` | No | Not possible; SQL absent | Recover the original SQL and verify its checksum. Preserve both existing rows. |
| `20261021_remove_local_user_credentials` | Successful | `ddfef3b5ce62b94a9ced6b67216e0cf115799316daea8be1c0eeddd397c49aea` | No | Not possible; SQL absent | Recover exact source and verify the hash. |
| `20261104000000_student_code_auth` | Successful | `7e6ca0eac4292d97be50a08b6e3436c70b0fc1d0f22a5c6ebb16332bce11c7f9` | No | Not possible; SQL absent | Recover exact source and verify the hash. |

The migration source search covered local and remote-tracking branches, tags,
all reachable commits, and local reflog history. No files, renames, or
deletion records for these nine names were found. Therefore no source commit
or branch can currently be attributed to them. Absence from local history does
not establish whether they were deleted before those refs or authored in an
unavailable repository.

Three additional successful Production migrations have same-named local files
whose SQL does not match the Production checksum. History/reflog inspection
found no version with an exact Production checksum:

| Migration | Production SHA-256 | Current local SHA-256 | Exact matching Git version found? |
| --- | --- | --- | --- |
| `20261021_school_administration` | `1c8d67c434139d1d07172d6b4450cf091996fdaad34e1f4e2e11b7cd6fe34ce4` | `966a63f1dc5f488fbf49b986f8c004bb29693c29a8909861b7431ce47da62c51` | No |
| `20261025_add_blockly_control_mode` | `5b15d57578169962c5c37c05b9a7dab101aea06e98a34e46aed6d92f1e673c79` | `72d649be85ee4668bde821c61713e385069839eadab3173009b78d6b28defbcc` | No |
| `20261104120000_remove_student_auth_identifier` | `a020ea57de31a9bfd143dfbffca58351f8b8e890fcbbe89ed93dd7147bc69155` | `66804f342fe8b69f0febea18683eed21b856b68ce081b391b8fd8c0716c56eb8` | No |

The local `20261103_activity_progress` SQL does match its Production checksum.
No SQL was edited during this investigation.

### Reconciliation assessment

Restoring exact original files for the nine missing names is necessary but
not sufficient with the evidence currently available: the three checksum
mismatches above must also be resolved by recovering their exact historical
SQL. Once every local migration file matches its Production checksum and all
historical names are present, `migrate status` should no longer report those
database-only entries. This remains to be verified; no history was changed.

Only after exact historical sources are recovered and reviewed can the seven
already-executed release migrations be recorded in Prisma history with the
supported metadata operation, one migration at a time:

```sh
prisma migrate resolve --applied <migration-name>
```

That command is not run in this task. Do not execute their SQL again. Do not
alter either `20261015_symbolic_evaluation_history` row. Do not run
`migrate deploy`, `migrate dev`, `db push`, or `migrate reset`.

## Git release controls

The release branch is `chore/main-non-iot-schema-release`; its approved
remote destination is `refs/heads/chore/main-non-iot-schema-release`. The
local branch tracks `origin/main`, so use only the explicit destination
refspec below and never a bare `git push`:

```sh
git push origin HEAD:refs/heads/chore/main-non-iot-schema-release
```

Inspect the remote release branch before pushing. If it exists, verify that
the release commit is a fast-forward. Do not force-push, merge into `main`, or
deploy AWS. The GitHub Actions push trigger is limited to `main`, and its
Production deployment jobs are also gated to `main`; pushing this release
branch does not trigger Production deployment.

The release package contains the 11 reviewed files: nine release artifacts
and the two pinned migration SQL files. Keep the disposable test harnesses
outside the commit. No credentials, environment files, Production metadata,
AWS resources, or deployment workflows are part of this release package. No
Prisma reconciliation or AWS deployment is performed by this release.

## Current decision

**BLOCKED — CHECKSUM MISMATCH**

The nine historical migration files are unavailable in local Git history, and
three same-named local files do not match the checksums already stored in
Production. Obtain the original SQL from an authoritative source and verify
each recorded checksum before preparing Prisma reconciliation approval.
