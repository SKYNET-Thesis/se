# Full LMS Phase 1 — hosted Supabase K–M verification (evidence and release plan)

Status: **no Production or hosted-Supabase query was run, and nothing was changed there. K–M remain BLOCKED.**
Evidence labels: **[disposable-pg]** plain local PostgreSQL 17; **[supabase-image]** Supabase's own PostgreSQL image (`public.ecr.aws/supabase/postgres:17.11.0.011`, the same base as hosted Supabase) in a throw-away container with the non-superuser `postgres` role; **[hosted]** not yet obtained.

## 0. What could not be done, and why
The approved read-only Production credential (`PRODUCTION_DATABASE_READONLY_URL`) exists only as a secret of the `production-database-preflight` GitHub environment, usable by a workflow on `main`. This environment has no approved hosted connection, and reading the API's `DATABASE_URL` from Secrets Manager (or any other secret) would bypass the approval boundary, so I did not. The read-only queries (`docs/operations/sql/km-hosted-readiness.sql`) therefore remain **to be run** by one of: (a) the database owner in the Supabase SQL editor (read-only, redact before sharing); (b) a reviewed read-only workflow in the preflight environment that prints only booleans/counts (the repository is public: do not print role lists or ACLs, and never upload them as artifacts). Both need your approval.

## 1. Findings (with evidence)
| # | Finding | Evidence |
|---|---|---|
| F1 | **Migration L fails as written on the Supabase image.** Run as `postgres` (CREATEROLE, BYPASSRLS, not superuser) it aborts at `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA pgbouncer FROM vista_app_runtime`: `permission denied for function get_auth` (`vault` has two such functions). The single transaction rolled back; no role was left behind. | [supabase-image] applied L itself |
| F2 | General rule behind F1: a non-superuser REVOKE raises *permission denied* (not a warning) when the executing role has no USAGE on a schema (even an empty one) or no privilege at all on a table/function; it only warns when it holds some privilege without grant option. | [disposable-pg] probes A1–A6 |
| F3 | A candidate L (sweep limited to `public`, plus an assertion that the role holds no explicit privilege on other schemas) applies cleanly and yields the intended role: LOGIN, not superuser, NOINHERIT, no BYPASSRLS. For a **new** role the all-schema sweep is a no-op anyway (nothing was granted), so the change is behaviour-neutral. | [supabase-image] |
| F4 | M applies when the apply role owns the database (it does in the image). After M, TEMP is gone from PUBLIC and the runtime role but **also** from `pgbouncer`, `supabase_etl_admin`, `supabase_privileged_role`, `supabase_read_only_user`, `supabase_replication_admin` (none on M's 8-role allowlist). `dashboard_user` keeps TEMP (explicit grant). The K–M verifier's "platform roles retain TEMP" check only covers the 8 allowlisted roles, so it would still pass. Whether any of those five roles needs TEMP is unknown. (My earlier note that `dashboard_user` loses TEMP was wrong: it came from a non-Supabase local database.) | [supabase-image] |
| F5 | M's owner guard is necessary: executed by a non-owner, `REVOKE TEMPORARY … FROM PUBLIC` is a silent no-op (WARNING only). | [disposable-pg] probe B |
| F6 | Runtime role after L+M behaves as designed: cannot create temp tables, cannot read `auth`, cannot create objects in `public`, can use its allowlisted sequence. | [supabase-image] |
| F7 | **Rollbacks:** M's rollback `GRANT TEMPORARY ON DATABASE <db> TO PUBLIC` restores TEMP for every role. L's documented rollback needs a correction: `DROP OWNED BY vista_app_runtime` is **refused** to `postgres` on PostgreSQL 17 (no implicit membership for CREATEROLE). Working order: drop the role's RLS policies, `REVOKE ALL` on each granted object/schema/database explicitly, verify `pg_shdepend` is empty, then `DROP ROLE`. | [supabase-image] |
| F8 | The pre-LMS image (`b8ac12f`) references 75 public tables, **all** inside L's 75-table allowlist (as does the current build); it has no reads of `audit_logs`, no deletes on `auth_tokens`, no writes to the SELECT-only catalogs; the only public sequence is allowlisted. So `vista-rollback-api` is not expected to break under the runtime-role credential. Static heuristic (identifier match + Prisma accessors): it cannot see dynamically built SQL. | [static] — a runtime test is still required |
| F9 | K is plain DML (permissions/role grants) with fail-closed prerequisites; unaffected by F1–F7. K–M verifier 32/32 on a migrated database. | [disposable-pg] |
| F10 | Apply-role attributes in the image: `postgres` is not superuser, has CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS, owns the `postgres` database, holds USAGE and privileges on all 9 platform schemas except functions in `pgbouncer`/`vault`. The readiness SQL (query 8b) now reports apply-role gaps per schema, including functions; it flags exactly `pgbouncer` and `vault` here. | [supabase-image] |

**Open hosted questions** (only the read-only queries can answer): who owns the project database; whether Production has additional schemas/functions the apply role cannot use (query 8b); which roles exist and hold TEMP; whether `vista_backup_reader` or any platform role relies on PUBLIC TEMP; the pooler form and mode for the runtime role.

## 2. Can K+L be released with M deferred?
**Yes in principle, without weakening runtime security or touching history — but it needs reviewed tooling changes and an explicit risk acceptance. It is not possible with the current repository as is.**
- *Mechanics.* The planner requires the manifest to equal exactly `requiresApplied + scope versions`, and the gate requires the deployed image's manifest to be fully applied (names and checksums). Deferral is therefore done the way Stage 2 (J) was handled earlier: keep M **out of the release manifest** and move its SQL, byte-identical, to `database/staged-migrations/` until its own scope is approved; add scope `K-L`. Nothing is marked applied, no ledger row is written or edited, and K's and M's checksums are unchanged. Re-adding M later appends one ledger version after L. An image whose manifest lacks M stays compatible before M is released; after M is released, older images fail the gate's "unmanifested ledger version" rule (the expected, fail-closed behaviour).
- *L must change first (F1).* L has never been applied to any database that matters, so replacing it before release does not rewrite history, but it changes the pinned checksum: it needs a reviewed PR (manifest, scope pins, schema expectation, tests). I did not change any checksum.
- *Security effect of deferring M.* TEMP stays inherited from PUBLIC: the runtime role (and every role) can create session-local temp tables. All other L restrictions are unchanged. The K–M verifier's "runtime role cannot use temp tables" check cannot hold for K–L; a `kl` mode must replace it with an explicit "PUBLIC TEMP unchanged, M absent" check — not a silent skip — and the owner must accept the residual risk in writing. PostgreSQL has no per-role revocation of a PUBLIC privilege, and the other temp-related settings are superuser-only on hosted Supabase.
- *If M is released later (option B):* extend its allowlist to the five roles in F4 (or prove they do not need TEMP) and extend the verifier to cover them.

## 3. Release-tooling changes required
> **Implementation status (branch `release/lms-k-l-supabase-ready`):** items 1, 2, 3, 4, 6, 7, 8 and 9 are implemented and tested (see `production-lms-k-l-release-readiness.md`); item 5 (a hosted rehearsal target mode) is not: it still needs a reviewed design. Item 4's workflow option is `K-L`; the redacted evidence workflow is `production-readiness-evidence.yml`.

1. Replace L with a hosted-compatible version (F3); regenerate manifest/scope pins and the bootstrap expectation; keep tests that exercise L on a Supabase-image database.
2. Scopes: add `K-L`, a separate `M` scope (staged, BLOCKED); retire the composite `K-M` or keep it BLOCKED. Generalise the planner's "K-M is BLOCKED" rule so approval is an explicit reviewed marker per scope.
3. Verifier: `kl` mode; extend the M checks to platform roles beyond the 8.
4. Production Database Release workflow: add `K-L` to the scope choices and update the workflow safety checker (CODEOWNER review).
5. Rehearsal support: the tooling accepts only the Production project or a loopback database; a hosted rehearsal project needs a reviewed, explicitly non-production target mode (or the rehearsal is run manually by the database owner with reviewed evidence).
6. A redacted read-only evidence job (booleans/counts only) so the readiness SQL can run without exposing role lists in a public repository.
7. `deploy-api.sh`: fail before `docker run` if the production `DATABASE_URL` user is not `vista_app_runtime[.<ref>]` (today the API itself crash-loops).
8. Correct the L rollback text in `production-release-k-m-runbook.md` (F7).
9. CI: apply staged M to the disposable CI database after verification (as done for J) so M's tests keep running while it is outside the manifest.

## 4. Backup and isolated restore rehearsal plan
*Backup (existing, approval-gated mechanism).* `backup_mode=logical`: `pg_dump --format=custom --schema=public` in one repeatable-read snapshot, restore test into a disposable PostgreSQL 17, SSE-KMS upload, evidence bound to project, scope, manifest, commit and plan hash; evidence ≤ 12 h old and re-verified by the approval-gated `apply` job. Limits to accept: no PITR (recovery point = dump time), `public` only (auth users, storage metadata and vault are not captured), roles/grants are not restored. The first real dump/restore on Production-sized data has never been exercised.
*Rehearsal (new, needs approval).*
1. Create a separate Supabase project of the same plan, region and PostgreSQL major (or a Supabase branch if the plan allows). It must have no connection to Production credentials.
2. Restore the latest verified dump into it; create the roles referenced by ACLs as the project does.
3. Run `km-hosted-readiness.sql`: compare with Production's read-only results (owner, roles, query 8b).
4. Apply the replacement L (and K), then — if option B — M, as the project's `postgres` role; run the K–M/K–L verifier.
5. Set a throw-away password for `vista_app_runtime`; start the **current** and the **pre-LMS (`b8ac12f`)** API images against it through the pooler form; run the acceptance smoke subset (login, RBAC, authoring, quiz, assignment).
6. Execute the documented rollbacks (M grant-back; L explicit-revoke order) and re-run the verifier.
7. Destroy the project and record the evidence (counts and booleans only).

## 5. Runtime-role transition and rollback requirements
- Set the password out of band (never in the repository or logs); store the pooler-form `DATABASE_URL` (`vista_app_runtime.<project_ref>`, pooler mode chosen for Prisma) in the Secrets Manager secret read by `deploy-api.sh`. The running container keeps its old environment until the next deployment, so the switch takes effect only when the new image starts.
- `vista-rollback-api` re-reads the secret, so the **previous** image will run as the runtime role: F8 plus the rehearsal step 5 must pass before the secret changes.
- Keep the owner credential only in `production-database-apply`; remove/rotate the old privileged URL from the API secret after the switch.
- Stop conditions: API `current_user` ≠ `vista_app_runtime`, any `permission denied` in API logs after deployment, failed smoke test → roll back the image (and, if needed, the secret) before touching the database.

## 6. Approvals needed
1. Run the read-only hosted evidence (option a or b above).
2. Replace L (new checksum) and merge the scope/tooling changes (CODEOWNER + independent reviewer).
3. Written acceptance of the residual PUBLIC-TEMP risk for K+L, or a decision to pursue M (option B) with the extended allowlist.
4. Create and destroy the rehearsal project.
5. Production Database Release for `K-L` (fresh logical backup + restore test, `production-database-apply` approval).
6. Credential switch, then first deployment via Auto Deploy (`aws-demo` approval).

## 7. Step-by-step safe release plan
1. **Evidence (read-only):** run the readiness SQL; review. Stop if query 8b shows gaps beyond `pgbouncer`/`vault`, or if the owner is not the apply role.
2. **Tooling PR:** replacement L, `K-L`/`M` scopes, `kl` verifier, workflow scope option, runbook fixes, CI staged-M step; independent review; merge.
3. **Rehearsal** (section 4); attach evidence.
4. **Backup:** dispatch the Production Database Release in `logical` mode for `K-L`; preflight → backup + restore test → reviewer approval → apply → postflight (`kl`). Stop on any failed check; recovery = logical backup + the rollback orders above.
5. **Credential switch** (section 5), no deployment yet; verify the secret by a read-only connection test from the rehearsal tooling, not from the API host.
6. **Deploy:** Auto Deploy/dispatch → `schema-gate` passes → `aws-demo` approval → API and web SHA verification by the workflow.
7. **Acceptance:** run `production-lms-deployment-acceptance-plan.md` (including real S3/IAM/CORS media checks and a rollback drill).
8. **M later (optional):** only with its own evidence, extended allowlist and scope.
