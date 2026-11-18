# Full LMS Phase 1 — Production K–M readiness review (hosted Supabase)

Status: **review only. K–M remain BLOCKED for Production.** Nothing here was run against Production, hosted Supabase or AWS. **Superseded where it conflicts by `production-lms-k-m-hosted-verification.md`** (Supabase-image evidence: migration L fails as written; some M findings corrected below).
Evidence is labelled **[disposable]** (local PostgreSQL 17, repository tooling) or **[hosted]** (must still be produced).

## Where Production is (read-only facts)
- Running API and web: commit `b8ac12f` (merge of PR #145), deployed 16 Nov 2026 after reviewer approval (Education CI dispatch run 43429677475). ECR's newest image tags are `b8ac12f…` and `99a1b1b…`; `https://api.skynex.best/api/v1/health` is `ok`; the web `index.html` was last written 16 Nov 14:42 UTC. Neither exposes its commit yet (added by the Auto Deploy change: `GET /api/v1/version`, `/version.json`).
- Schema: D–J applied (the schema gate lists only K, L, M as pending; it compares names and checksums). The Full LMS build (Phase 1A–1G, on `main`) requires K–M: the gate refuses it, so **no LMS code is deployed**.
- Why the API cannot simply be deployed: in production `PrismaService` insists the connection runs as `vista_app_runtime` (created by L); the authoring endpoints rely on the permissions K adds.

## Migration K — author/publish capabilities
- Pure DML on `permissions` / `role_permissions`; idempotent; aborts unless canonical roles `instructor` and `school_admin` exist; asserts the final grant matrix (author: Instructor + School Admin, publish: Instructor only).
- [disposable] K–M verifier 32/32 PASS on a fully migrated local database (roles present, grants exact, School Admin never publishes, students hold nothing, row digests unchanged).
- [hosted] still needed: confirm both roles exist with those exact codes (`docs/operations/sql/km-hosted-readiness.sql`, query 6).
- Compatibility risk: low. Rollback: revoke the three grants and delete the two permission rows after the dependent code is rolled back.

## Migration L — `vista_app_runtime`
- Creates a LOGIN, password-less, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS role; REVOKEs everything from it in every non-system schema, then grants a frozen table allowlist (catalogs SELECT-only, `audit_logs` INSERT-only, `auth_tokens` S/I/U) plus a permissive RLS policy scoped to this role.
- [disposable] The full LMS (Playwright 44 browser tests, the HTTP/DB Jest suites, the runtime-role security suite) ran with the API connected as `vista_app_runtime`: the allowlist covers everything the LMS code touches.
- **Hosted blockers / open questions**
  1. **Confirmed failure (see the hosted-verification document):** on the Supabase PostgreSQL image, L aborts as the non-superuser `postgres` role at `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA pgbouncer` (`permission denied for function get_auth`); `vault` has the same problem. A candidate fix (limit the sweep to `public`, assert no explicit privileges elsewhere) applies cleanly. [disposable, Supabase image]
  2. `CREATE POLICY … TO vista_app_runtime` needs table ownership: hosted public tables are owned by `postgres` (apply role) — verify with query 8. [hosted]
  3. The role has no password: it must be set out of band, and the API must reach it through the Supabase pooler with user `vista_app_runtime.<project_ref>` (the repo's `supabase_identity` enforces `<role>.<project_ref>`). Session vs transaction pool mode must be chosen for Prisma. [hosted]
  4. **Rollback hazard:** `vista-rollback-api` redeploys the *previous* image with the *current* secret. After the credential switch, the pre-LMS image (`b8ac12f`) would run as `vista_app_runtime`; it must be proven to work with that role before the switch (run the old image against a disposable database as the runtime role). [disposable, not yet done]
- Credential transition (needs approval; not performed): (a) apply L; (b) `ALTER ROLE vista_app_runtime PASSWORD …` by the owner, generated outside the repo; (c) put the new `DATABASE_URL` (pooler form) into the Secrets Manager secret read by `deploy-api.sh`; the running container keeps its old environment until the next deployment, so the switch takes effect only when the new image starts; (d) rotate/remove the old privileged URL from the API secret; (e) keep the owner URL only in `production-database-apply`.

## Migration M — database-wide TEMP revocation
- `REVOKE TEMPORARY ON DATABASE … FROM PUBLIC`, then re-grants TEMP to eight named platform roles; fails closed if the apply role is not the **database owner**, or if any listed platform role loses TEMP.
- Findings (corrected): on the Supabase image `dashboard_user` keeps TEMP through an explicit grant; the roles that lose it after M are `pgbouncer`, `supabase_etl_admin`, `supabase_privileged_role`, `supabase_read_only_user` and `supabase_replication_admin` (not on M's allowlist, and the K–M verifier does not check them). Whether any of them needs TEMP is unknown. [hosted]
- In the Supabase image the `postgres` database is owned by `postgres`, so M's owner check passes there; the hosted project's owner is still unverified (queries 1–2 of the readiness SQL). [hosted]
- Supported hardening strategy: PostgreSQL has no per-role revocation of a PUBLIC privilege. Options: (A) accept PUBLIC TEMP on hosted Supabase (low impact: the runtime role can create session-local temp tables only) and release **K+L only**; (B) apply M only if queries 1–5 and 9 prove ownership and that no platform service depends on PUBLIC TEMP, with the allowlist extended after review. Recommendation: **A first.** This needs a reviewed release-scope decision, because the manifest/gate require all manifest migrations: a `K-L` scope plus moving M out of the release manifest (or a separate later scope) — an owner/reviewer decision, not something to change to obtain a green workflow.

## Release preparation
- Checksums and ordering: the manifest pins D–M by SHA-256 to Git source bytes; `validate_database_migration_manifest.py --release` passes; K–M order is fixed (J is a hard prerequisite) and the planner refuses anything else.
- Backup: Production uses the logical-dump mode (Supabase Free: no PITR): fresh dump ≤ 12 h old, restore-tested into a disposable PostgreSQL 17, encrypted private bucket, evidence bound to project, scope, manifest, commit and plan hash, re-verified by the approval-gated `apply` job.
- **Restore rehearsal (needed, tooling gap):** restore the latest dump into a *separate* Supabase project (same plan/region/major version), apply L (and K) there and run the K–M verifier plus `km-hosted-readiness.sql`. The release tooling accepts only the Production project reference or a loopback test database, so a hosted rehearsal needs a dedicated, reviewed implementation (as the code states); until then the rehearsal must be run by the database owner manually in the other project, with the evidence reviewed.
- Rollback/recovery: K additive (see above); L — stop API use of the role, revoke its grants and policy, drop only after proving it owns nothing; M — `GRANT TEMPORARY ON DATABASE <db> TO PUBLIC`; any failure inside a migration rolls the whole transaction back.

## Gate for unblocking (all required)
1. Independent review of K–M by a second person (hashes, grants, allowlist, M role list).
2. Hosted evidence from `km-hosted-readiness.sql` (read-only) reviewed and attached.
3. Rehearsal on a restored copy: L (and M if option B) succeed, K–M verifier passes, runtime role passes the LMS smoke tests, the pre-LMS image works with the runtime role.
4. Release-scope decision (A or B) merged through a reviewed PR; the BLOCKED marker is changed only by that PR.
5. Fresh logical backup + restore test bound to the plan; reviewer approval in `production-database-apply`.
