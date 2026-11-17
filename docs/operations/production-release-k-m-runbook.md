# Production release K–L (and staged M) recovery and approval runbook

> **Scope update (this branch):** the release is split. Scope `K-L` (K + a hosted-compatible revision of L) is the next release candidate; migration M is staged in `database/staged-migrations/` as scope `M`. Both remain production-BLOCKED in code. The M text below still applies to the later M release. The L rollback order is: drop the role's policies, explicit `REVOKE ALL` on each granted object, verify nothing depends on the role, `DROP ROLE` (`DROP OWNED BY` is refused to the apply role on PostgreSQL 17); tested sequence in `docs/operations/sql/k-l-rollback.sql`. See `production-lms-k-m-hosted-verification.md`.

Status (historical wording, K–M composite): **K–M production rollout BLOCKED**. K–L are structurally reviewable, but M changes database-wide `TEMP` inheritance and hosted Supabase compatibility has not been demonstrated. A PostgreSQL 17 disposable test is not hosted evidence. No K–M migration has been applied to Production.

## Scope and order

The manifest order is D–I, J, K, L, M. J remains its own release scope and is a hard prerequisite: K–M requires D–J already applied and its plan must include only K, L and M; it never applies J. K–M's catalog is pinned from the exact schema J leaves (91 tables, 49 RLS, 0 policies, 22 triggers, 15 functions) to the same plus the 48 runtime-role RLS policies. The manifest validator, scope pins, catalog preflight, ledger dependency check and deterministic data preview are prerequisites to approval.

K requires existing canonical `instructor` and `school_admin` roles and grants `learning.course.author` to both. It grants `learning.course.publish` only to Instructor. Missing roles or incorrect grants abort the transaction; the migration never seeds or elevates roles. L creates the restricted `vista_app_runtime` role only if absent and refuses unsafe existing attributes, membership, ownership, or missing allowlist relations. Runtime grants on `learning_submission_files` are included. Future table access requires a reviewed allowlist update.

M revokes database TEMP from PUBLIC, then grants it to the known platform roles that exist: `postgres`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `authenticator`, `anon`, `authenticated`, and `service_role`. Database ownership, role availability, PUBLIC/runtime denial and platform-role retention are checked. The platform role list must be reconciled with the target project's actual role catalog before approval; future roles require explicit maintenance.

## Required approval gates

1. **Migration review:** database owner and independent reviewer approve exact manifest/source hashes, K grants, L allowlist, M role list, catalog fingerprint, and rollback procedure.
2. **Hosted preflight:** use the read-only hosted connection to confirm target identity, D–I ledger state, exact catalog fingerprint, platform role inventory, and pre-migration TEMP behavior. Save redacted evidence. A local database is insufficient.
3. **Recovery readiness:** confirm an approved recovery point and rehearse restore/recovery on a separate project/branch. Confirm role grants can be restored by the operational owner.
4. **Production approval:** only the protected `production-database-apply` environment may release. Keep the privileged URL unavailable outside that gate. If hosted role inventory or rollback behavior cannot be proven, do not approve M and do not run K–M as one scope.
5. **Postflight:** execute the K–M verifier; compare catalog fingerprint, ledger, permission grants, runtime allowlist, TEMP grants, and deterministic digests. Any failed assertion blocks deployment.

## Rollback and recovery

K is additive. If application rollback is required, first roll back backend code using these permissions, then revoke only the three approved role-permission grants and delete the two K permission rows if no other code depends on them. Do not delete canonical roles.

L creates a role and grants table/sequence/schema privileges. Recovery requires disabling runtime connections first, then revoking its grants and dropping the role only after proving it owns no objects and has no dependencies. Never drop it automatically.

M rollback is `GRANT TEMPORARY ON DATABASE <db> TO PUBLIC`, restoring the prior inherited behavior. If its transaction fails, PostgreSQL rolls back the whole migration. If a post-commit platform issue is found, use the approved owner connection to restore PUBLIC TEMP, verify platform access, and record the recovery. Because this rollback re-enables TEMP for the runtime role, the restricted-runtime security requirement is temporarily unmet; treat it as an incident and keep the API role isolated until a reviewed replacement control is available.

## L maintenance

The L allowlist is intentionally frozen. When runtime code begins using a new table, sequence, function, or RLS-protected table, update the allowlist in a new reviewed migration, add least-privilege grants and RLS policy assertions, and test both permitted and denied operations on a disposable database. Do not rely on default privileges or broad schema grants.
