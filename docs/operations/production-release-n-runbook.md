# Production release N: student temporary password

Scope `N` (`database/release-scopes.json`) = migration `20261118_n_student_password_change_required`: five additive columns on
`public.education_school_user_profiles`. It requires D–L applied (Production ledger: 16 rows incl. K and L) and excludes M.
Nothing in this document has been executed; every Production step below needs the approval shown.

## What the migration does (and does not)

| | |
|---|---|
| Changes | `ADD COLUMN IF NOT EXISTS` ×5: `password_change_required boolean NOT NULL DEFAULT false`, `password_changed_at`, `temporary_password_expires_at`, `provisioning_claim_token uuid`, `provisioning_lease_until` (all nullable) |
| Does not | backfill, `UPDATE`, `DELETE`, constraint/index/RLS/grant/trigger/policy change, new table or function |
| Existing students | every row reads `password_change_required = false` (constant default, metadata-only on PostgreSQL ≥ 11) → nobody is forced to change a password |
| Lock | brief `ACCESS EXCLUSIVE` for the catalog change only (no table rewrite); 50 profile rows today |
| Catalog counts | unchanged: tables 91, RLS 49, policies 48, triggers 22, functions 15 (pinned in the scope; postflight asserts equality) |
| Compatibility | the previous API ignores the columns; the new API reads them only while `STUDENT_TEMP_PASSWORD_ENABLED=true` |

## Sequence

**The database release comes first.** `scripts/production_db_release.py compat` (the `schema-gate` job of every API/web deployment) requires the build's
**entire** manifest to be applied in Production, regardless of any feature flag. Once migration N is registered in `database/migrations/manifest.json`
(it is, since #171), every deployment of `main` is refused until N is applied: *"Schema is incompatible with this build: migrations not applied to the
database: 20261118_n_student_password_change_required. Run the approved Production Database Release first; the running API was not touched."* This is the
intended release ordering (a schema-incompatible image would crash-loop; the gate runs before any SSM command, so the running API is never touched).
The application code is additionally flag-safe (it reads the new columns only while `STUDENT_TEMP_PASSWORD_ENABLED=true`), but that does not bypass the gate.

1. **PR merged** by the owner (done for #170/#171). CI runs the manifest validator, workflow-safety check, the strict database suite and the fresh bootstrap.
2. **Database release**: GitHub → *Production Database Release* → `scope=N`, `backup_mode=logical`, `expected_main_sha=<40-char head of main>`.
   * preflight (read-only): plan + snapshot (counts, ledger, row digest of the profile table); the plan fails closed unless exactly D–L are applied, N is the only pending migration, M is absent and the catalog equals the pinned counts.
   * backup: fresh `pg_dump` + restore test into a throw-away PostgreSQL 17, SSE-KMS upload, evidence bound to project/scope/plan/manifest/commit.
   * **apply requires the `production-database-apply` reviewer approval** (reviewer: `leduc121`), after the backup evidence is visible.
   * postflight `verify_production_release_n`: ledger entry with the pinned checksum and `sourceCommit`; catalog unchanged; the five column definitions; **no row forced / no backfill**; digest of every existing profile row unchanged; row counts of all tracked tables unchanged.
   * the workflow's last job (`resume-deployment`) then dispatches the protected deployment (`backend-ci.yml`, `action=deploy`) for `main`.
3. **API/web deploy with the flag OFF** (`aws-demo` approval; `schema-gate` now passes). Smoke: existing login, Setup Code, Recovery Code.
4. **Enable the flag**: add `STUDENT_TEMP_PASSWORD_ENABLED=true` to the Production secret (`vista/demo/education-api/env`) and restart through the approved deploy path. The secret is the only place the flag lives; its absence means OFF. Keep `TRUST_PROXY=1`.
5. **Production E2E** with new isolated test schools (needs approval to create test identities): create/import student → temporary password shown once → login → forced change → old password rejected → My Learning → reissue → expiry → duplicates → isolation → Setup Code and Recovery Code → cleanup by archive/disable.

## Rollback

* Application: set the flag to `false` (remove the key) and restart; or redeploy the previous immutable image tag. Students who already changed their password are unaffected. Students still pending a first-login change are no longer gated while the flag is off, so reissue/complete them first or have them use Recovery Code.
* Database: leave the columns (inert). Only if the feature is abandoned: `docs/operations/sql/n-rollback.sql` (refuses while any student is still pending; also removes the ledger row). It is **not** run by the release runner and needs its own approval.

## Client-address handling (verified, do not change `TRUST_PROXY` blindly)

Measured from Production's nginx access log with tagged probes:

* Browser → `https://skynex.best/api/v1/*` → CloudFront → nginx → API. nginx sees the **CloudFront edge** as the peer, and the forwarded chain is `<client-supplied…>, <viewer>, <edge>`. With `TRUST_PROXY=1` (trust nginx only) the API sees the **edge** address, shared by every user on that edge.
* `https://api.skynex.best` → nginx directly. Peer = the real client; chain `<client-supplied…>, <client>`; `TRUST_PROXY=1` is correct and cannot be spoofed. With `TRUST_PROXY=2` this direct path would pick the **client-supplied** entry (spoofable).

Therefore the student-auth limiter is keyed per **account** (school code + student code, 10/min, independent of IP) with a generous per-address cap (120/min; env `STUDENT_AUTH_ACCOUNT_LIMIT_PER_MINUTE`, `STUDENT_AUTH_IP_LIMIT_PER_MINUTE`). Both counters are process-local (single API instance; reset on restart; multiply with instance count). The reissue limit (5/administrator/hour) is also process-local.
