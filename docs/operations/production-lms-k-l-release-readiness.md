# Full LMS Phase 1 — K-L release readiness (release candidate, not approved)

Status: **BLOCKED — HOSTED EVIDENCE REQUIRED.** Every code, migration and tooling blocker that can be resolved locally has been addressed on this branch; what remains needs
hosted/Production evidence or an explicit approval. Evidence labels: **[disposable-pg]** plain PostgreSQL 17, **[supabase-image]** Supabase's PostgreSQL image with a
non-superuser `postgres` apply role, **[CI]** GitHub Actions, **[hosted]** not yet obtained. Nothing was run against Production, hosted Supabase or AWS deployment.

## 1. Release blocker matrix
| # | Component | State now | Defect / gap | Change in this branch | Validation | Risk | Owner |
|---|---|---|---|---|---|---|---|
| 1 | `main` | `cb0e27e` (PR #156, #157 merged) | — | — | — | — | — |
| 2 | Education CI | push = validation only | — | — | green on `main` [CI] | low | — |
| 3 | Auto Deploy | live; first run dispatched the deployment, which **failed closed at `schema-gate`** (K, L, M missing); nothing touched | none: intended gate | — | run 44112960652 [CI] | low | — |
| 4 | Database Bootstrap | green | S3 suite needed a service container (fixed earlier) | now also applies staged M to the disposable DB and runs the isolated staged-M tests | CI-exact local run | low | — |
| 5 | Database Migration Safety | green | — | new tests picked up | — | low | — |
| 6 | Production Database Release | D–J released earlier | `K-M` scope selectable but BLOCKED | scope `K-L` replaces `K-M`; `HOSTED_BLOCKED_SCOPES = (K-L, M)` blocks hosted plan/apply in code | plan refuses hosted; tests | medium | owner |
| 7 | Manifest | D–M | **L failed on the Supabase image** | L revised; M staged byte-identical; manifest D–L re-pinned (`sourceCommit` 9de296c); expectation regenerated (ledger 9, fingerprint `51f5f109…`) | validator, 2 fresh bootstraps identical | medium | reviewer |
| 8 | Migration L | unreleased | all-schema sweep aborted on `pgbouncer`/`vault` functions | sweep limited to `public` + fail-closed assertion | applied by non-superuser `postgres` [supabase-image] | high until reviewed | reviewer |
| 9 | Migration M | staged, unreleased | hosted compatibility unproven; five platform roles outside its allowlist lose TEMP | moved to `database/staged-migrations/`; scope `M` BLOCKED; still tested in the isolated staged path | staged tests; Supabase-image apply + rollback | high (deferred) | owner |
| 10 | Backend Prisma / runtime role | API requires `vista_app_runtime` in production | credential switch not done | deploy script rejects any other DB user | script test; API smoke old+new as runtime role [disposable-pg] | high until switched | owner |
| 11 | ECR build/tagging | SHA-tagged, `GIT_SHA` build arg | — | (PR #157) | image verified | low | — |
| 12 | EC2 deploy via SSM | `deploy-api.sh` is baked into the instance at creation (Terraform `user-data`) | the new DB-user guard is **not active on the host** until the host script is updated (needs an approved infrastructure change); the API's own role assertion still protects it | script changed in repo | script test | medium | owner |
| 13 | Web S3/CloudFront | `b8ac12f` | — | `version.json` verified by the workflow (PR #157) | — | low | — |
| 14 | API/Web version verification | in place | — | — | workflow tests | low | — |
| 15 | Health checks / smoke | health only | LMS smoke not yet run on hosted | acceptance plan | [hosted] required | medium | owner |
| 16 | Rollback | `vista-rollback-api` redeploys `previous-image` with the current secret | needed proof the old image works as the runtime role | old image `b8ac12f`: 105 requests, 0 differences / 0 5xx vs owner credential | smoke script [disposable-pg] | medium | owner |
| 12b | **Learning Media on AWS** | live bucket CORS allows only `https://dbwzn37ruvlzi.cloudfront.net` with `HEAD`/`PUT`; live instance role has **no S3 permissions** | the LMS uploads with a presigned **POST** from `https://skynex.best`, signed by the instance role: uploads and downloads would fail in production. Terraform (`storage.tf`, `compute.tf`) declares POST/HEAD for `skynex.best`, `www.skynex.best` and the CloudFront domain and `s3:PutObject/GetObject` on `learning-media/courses/*`, but they were never applied | none possible without Terraform apply | read-only AWS inspection | **blocking (Production-only)** | owner |
| 17 | Hosted evidence | not run | no approved connection from this environment | redacted read-only evidence command + dispatch-only workflow | local runs; **not dispatched** | **blocking** | approver |
| 18 | Rehearsal | not run | needs a separate Supabase project | plan below | — | **blocking** | approver |

## 2. Migration state
| Migration | Production | In repo | Notes |
|---|---|---|---|
| D–J | applied (ledger; checksums match; confirmed only by the gate listing just K, L, M as pending) | manifest 1–7 | unchanged |
| K `20261116_k_course_authoring_capabilities` | **not applied** | manifest 8, sha `4c1d5b4a…` unchanged | prerequisite roles unverified on Production |
| L `20261116_l_runtime_role` | **not applied** | manifest 9, sha `5b49e050…` (revised; the previous sha `5a4db3de…` was recorded only by disposable databases) | role has no password; credential switch is a separate approval |
| M `20261116_m_revoke_public_temp_privilege` | **not applied, not manifested, never marked applied** | `database/staged-migrations/`, sha `80619e7d…` unchanged | scope `M`, BLOCKED; PUBLIC TEMP stays a tracked residual risk |

Implication of changing L's checksum: L is applied in no environment that matters (Production ledger ends at J); local/CI databases are recreated every run. Developer databases
bootstrapped earlier hold the old checksum and must be re-bootstrapped. No applied migration was rewritten; no ledger row was edited; M's bytes are identical.

## 3. What was verified
**Migration L revision.** Applied cleanly on the Supabase image by a non-superuser `postgres` with platform-owned functions it cannot execute (reproduced the original failure first).
**K-L scope.** `plan --scope K-L` (local test mode) is `ready`, pending exactly K and L, catalog before-state equals the pinned J state (91 tables, 49 RLS, 0 policies, 22 triggers, 15 functions);
the planner refuses a hosted K-L/M plan in code. Postflight verifier `kl`: 36/36 on the Supabase-image rehearsal and on bootstrapped databases; it asserts M absent and PUBLIC TEMP unchanged (a changed state fails it),
no explicit privileges outside `public`, no role membership/ownership, table privileges ⊆ the frozen allowlist, `audit_logs` insert-only. M's own verifier rejects a K-L database (so K-L can never be mistaken for M-complete).
**Runtime-role behaviour.** After L (+M) the role cannot create temp tables (M only), read `auth`, or create objects in `public`; uses its sequence.
**Rollback.** M: `GRANT TEMPORARY … TO PUBLIC` restored TEMP for all roles. K-L: `docs/operations/sql/k-l-rollback.sql` rehearsed as non-superuser `postgres` (role, policies, K permissions removed; ledger untouched).
**Old/new image vs runtime role.** Pre-LMS API (`b8ac12f`): 105 authenticated requests, no status differences, no 5xx versus the owner credential; current build: 111 requests, same, with `DATABASE_RUNTIME_ROLE` enforced; the current build refuses to start under the owner credential when the role is required.
**Full stack.** Fresh bootstrap (K-L) + staged M on a disposable database, API as `vista_app_runtime`, local S3: Playwright 45 passed / 2 skipped (opt-in visual audit).

## 4. Backup and recovery rehearsal plan (not performed)
Realistic rehearsal = separate Supabase project (same plan, region, PostgreSQL major), no Production credentials. Steps: fresh logical backup through the approval-gated release workflow → restore into the rehearsal project (public schema only) →
read-only evidence (`production-readiness-evidence` logic against the rehearsal) → apply K-L as the project's `postgres` → verifier `kl` → set a throw-away runtime password → run the current **and** the pre-LMS image through the pooler form
(`vista_app_runtime.<project_ref>`) with the smoke script and the LMS acceptance subset → run the rollbacks (API image; `k-l-rollback.sql`) and re-verify → destroy the project.
Observations to record: dump size/time, restore time, K-L apply time, API start time, rollback time. **Assumptions to state, not claim:** RPO = dump time (no PITR on the current plan; evidence ≤ 12 h old, widened by approval wait); RTO unknown until measured; auth users/storage metadata/vault are not in the dump; roles/passwords/platform grants are not restored (`--no-owner`);
the disposable restore target is plain PostgreSQL, not Supabase. The release tooling accepts only the Production project or a loopback database, so a hosted rehearsal currently needs the database owner to run it manually with reviewed evidence, or a further reviewed tooling change.

## 5. Residual risks
PUBLIC TEMP remains inheritable (session-local temp tables) until M is released; five platform roles outside M's allowlist would lose TEMP if M were released; the deployment-script guard is not active on the host until the instance script is updated; hosted owner/role/schema facts and the pooler connection path are unverified; no real S3/IAM/CORS evidence; first real dump/restore on Production-sized data never exercised.

## 6. Approvals required (each separately)
(1) code review and PR approval; (2) hosted read-only evidence (dispatch `Production Readiness Evidence` after merge, or owner runs the SQL); (3) rehearsal resources; (4) Production database migration (`K-L`, after the code change that removes it from `HOSTED_BLOCKED_SCOPES`, fresh backup, `production-database-apply`); (5) Production credential change (runtime password, secret `DATABASE_URL`); (6) host script update (infrastructure change); (7) AWS deployment (`aws-demo`).

## 7. Exact release sequence
1. Merge this PR (no Production effect). 2. Dispatch the evidence workflow; review the redacted result; stop on any blocking finding. 3. Independent review of L (revision), K, the `K-L` scope and verifier. 4. Hosted rehearsal. 5. Reviewed change that unblocks `K-L` (removes it from `HOSTED_BLOCKED_SCOPES`) with the evidence attached. 6. Fresh logical backup → `Production Database Release` scope `K-L` → reviewer approval → apply → postflight `kl`. 7. Set the runtime password; switch the secret to the pooler-form runtime URL (no deployment yet). 8. Update the host deploy script if required. 9. Auto Deploy → `schema-gate` → `aws-demo` approval → API/Web SHA checks. 10. `production-lms-deployment-acceptance-plan.md`, including real S3/IAM/CORS media checks and a rollback drill. 11. Rollback if needed: image via `vista-rollback-api`; database via `k-l-rollback.sql`; M separately later.

## 8. AWS read-only readiness (profile `vista`, region `ap-southeast-1`; nothing was changed)
| Item | Observation |
|---|---|
| Account | `157098813811` (as configured) |
| API host | EC2 `i-0fa8cb318ce21afa5` running (t3.medium, launched 2026-11-04); SSM agent Online |
| ECR | `vista/demo/education-api`: tags immutable, scan on push; newest SHA tag `b8ac12f…` (matches the running API) |
| Secrets Manager | `vista/demo/education-api/env` last changed 2026-11-04 (so no runtime-role credential switch yet); value not read |
| CloudFront / web bucket | distribution Deployed and enabled, aliases `skynex.best`, `www.skynex.best`; web bucket blocks public access; web `index.html` last written 2026-11-16 |
| GitHub OIDC | API and web deploy roles trust only `repo:SKYNET-Thesis/se:environment:aws-demo` (audience `sts.amazonaws.com`): AWS access requires passing the reviewer-gated environment |
| GitHub environments | `aws-demo` and `production-database-apply` require 1 reviewer; `production-database-preflight` has no reviewer (read-only secrets) |
| **Media bucket CORS (drift)** | live rule: origin `https://dbwzn37ruvlzi.cloudfront.net`, methods `HEAD`,`PUT`. Required by the LMS: origin `https://skynex.best` (and `www`), method `POST` |
| **Instance role (drift)** | live inline policy: ECR pull, one `GetSecretValue`, CloudWatch logs. **Missing:** `s3:PutObject`/`s3:GetObject` on the media bucket (`learning-media/courses/*`) |
| Terraform | not run (no init/plan/apply). `user_data_replace_on_change = true` and the instance user-data embeds `scripts/deploy-api.sh`: **editing that script (done in this branch for the DB-user guard) makes the next full `terraform apply` plan an instance replacement.** Any apply must be reviewed with `terraform plan` first and should be targeted (IAM policy + media CORS) unless a replacement is deliberately scheduled |
| Not verifiable read-only | whether the API secret already contains `LEARNING_MEDIA_BUCKET`/`AWS_REGION`; the pooler form and mode of a future runtime-role `DATABASE_URL` |

Consequence: even with K-L released, Learning Media (PDF/DOCX/PPTX/PNG/MP4) will **not work in production** until the media IAM policy and CORS are applied, which needs an approved Terraform change (separate from the database release). All media results in this repository are from S3-compatible local storage.
