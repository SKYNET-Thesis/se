# VISTA — final integration hardening (2026-11-16)

Branch `integration/rc-on-develop-2026-11-16` (isolated worktree `../se-rc-integration`, local only — **not pushed, not merged**). Base `origin/develop` `83266c7`. The original dirty RC worktree was not touched. Database work was done only on the verified disposable container (`127.0.0.1:55433`, tmpfs); the protected 55432 instance was never contacted.

## 1. Commits since the previous report (`c97474e`)

| SHA | Subject |
| --- | --- |
| (frontend TS) | zero TypeScript errors without importing the unrelated UI sweep |
| `9277722` | migrations K, L, M (SQL only) |
| `c9bf79e` | register K, L, M in the manifest (`sourceCommit` = `9277722`) |
| `ea8b600` | release scope K-M, verifier, bootstrap checks, regenerated schema fingerprint, release-test harness |
| `1fbd542` | per-question points for students and authors, runtime-role privilege-matrix tests |

## 2. Policy decisions — implementation evidence

**D1 (offerings: global + own school, never another school).** `education-admin.service.ts` (`createClassroom`, `createCourseOffering`, `changeClassroomOffering`) and `school-admin-query.service.ts` (`publishedGlobalCourses`) accept `status='published' AND (organization_id IS NULL OR organization_id = <the school in the URL>)`. Evidence: unit specs (`education-admin.*.spec`, 99 pass) assert the exact where-clause; E2E Journey 1/2 create classrooms on the school's own course through develop's flow; the cross-school specs return 404 for the other school's course and classroom.

**D2 (`learning.course.publish`).** `LearningScopeService.canPublishOrganization` checks an active membership carrying `learning.course.publish` in that school (or `org.manage` for global courses). It is evaluated **inside develop's transactional publish** (`publishCourse`, locked course row) and `syncCourseEnrollments` uses authoring authority. Instructor gets the permission in migration K; School Admin and students do not. Evidence: unit spec (`course-authoring-authority.spec`, 13), DB spec `course-publish-sync` with the real scope, E2E "Publishing policy" (School Admin creates/edits a course, `POST /publish` → 404, the course stays `draft`, the builder's publish button is disabled; the Instructor's publish reaches the publish rules), verifier check "School Admin never holds learning.course.publish". Question authoring/publication by school authors is unchanged.

**D3 (migrations K, L, M, local only).** Registered in `database/migrations/manifest.json` (orders 8–10) with pinned SHA-256 and a `sourceCommit` whose tree contains the exact bytes; historical migrations and the baseline are untouched.
- **K** `20261116_k_course_authoring_capabilities`: permissions `learning.course.author` (Instructor, School Admin) and `learning.course.publish` (Instructor only); idempotent; grants only to roles that exist.
- **L** `20261116_l_runtime_role`: restricted `vista_app_runtime` (no password stored), allowlisted table grants + role-scoped RLS policies. Fixed: `learning_submission_files` (migration I) was missing → `permission denied` on submissions.
- **M** `20261116_m_revoke_public_temp_privilege`: see §4.
- Governance: the team's release tooling pins one reviewed scope per release and rejects a manifest that differs from it, so a reviewed scope **`K-M`** (requires D–J, pinned hashes, additive read-only verifier `scripts/verify_production_release_km.py`, workflow option) was added; D-I and J scopes are unchanged. `dev-schema-expectation.json` was regenerated from a fresh PostgreSQL 17 bootstrap (policies 0 → 48, fingerprint updated); bootstrap required-object checks added for K, L, M. **Nothing was applied to any shared or production database; production release still requires the existing approval gates.**

## 3. Frontend TypeScript — 0 errors, build PASS

The 90 inherited errors were 77 × TS6133 (unused imports/locals) and 13 real type errors (`Record<string, unknown>` vs the canonical robot-program type, unknown `version` in a promise chain, a Blockly `scrollIntoView` call, a missing `completedAt` field, three spec typing issues).
- Mechanical pass over develop's *current* files removing unused imports/locals (no behaviour change); verified pure type/typing fixes taken from the checkpoint for files the team had not changed (HardwareCalibrationPanel, two specs, DemonstrationPractice, VrPractice); targeted fixes in `lib/api.ts` (program payload `object`, `completedAt`) and `Practice.tsx` (save-chain typing, scroll target) — the checkpoint's old quiz/knowledge-check code in those files was **not** copied (develop's newer implementation kept).
- Classification of the ~72 files omitted earlier: `components/studio` (16), `ui`/`layout`/`dashboard`/`robot`/`school`/`teacher` pages — import/type cleanups (reproduced mechanically, not copied); `components/digital-twin` (13) — a new multi-arm Digital Twin workspace with a mock telemetry provider, in-progress feature work by another agent, unrelated to the RC and **not ported** (still on the checkpoint branch); older copies of quiz/learning code — obsolete, superseded by develop.
- Result: `tsc --noEmit` = **0**; `vite build` PASS.

## 4. Database security (TEMP and the runtime role)

Finding: the database ACL was `=Tc/vista_test` — `PUBLIC` holds **TEMP** (and CONNECT) on every new PostgreSQL database; a privilege granted to PUBLIC cannot be removed from one role, so `vista_app_runtime` kept TEMP although migration L revoked everything role-specific.
Fix (M): `REVOKE TEMPORARY ON DATABASE <current> FROM PUBLIC`, then explicit `GRANT TEMPORARY` to the platform roles that exist (`postgres`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `authenticator`, `anon`, `authenticated`, `service_role`), explicit revoke from `vista_app_runtime`, and an assertion that it ends without TEMP. CONNECT and the owner's rights are untouched. Residual risk to review before any production use: a role not in that list that relied on implicit TEMP (none known) would now need an explicit grant; Supabase-managed roles were listed for that reason.

Evidence (fresh DB: baseline → D…M by the official runner; ledger shows all ten versions):
- Resulting ACL `{=c/owner, owner=CTc, vista_app_runtime=c, postgres=T, supabase_admin=T, anon=T, authenticated=T, service_role=T}`; per-role matrix: runtime role CONNECT only (no CREATE/TEMP); platform roles keep TEMP.
- Practical probes as the runtime role: `CREATE TEMP TABLE` → permission denied; `CREATE TABLE public.zz` → denied; `CREATE SCHEMA` → denied; `SET ROLE postgres` → denied; read of `vista_schema_migrations`/`api_keys` → denied; `learning_submission_files` readable and writable (an insert reaches the table trigger instead of being refused).
- Role attributes: no superuser/bypassrls/createrole/createdb/replication/inherit.
- `scripts/verify_production_release_km.py --verify`: 27 of 28 checks pass; the failing one ("no business rows added/removed") is the expected consequence of running the verifier after the E2E created data (the snapshot was taken on the empty DB) — not a privilege failure. All role/permission/TEMP/table-grant/ledger checks PASS, including "School Admin never holds learning.course.publish".
- Runtime-role security suite (`RUN_RUNTIME_ROLE_SECURITY=1`): **8/8 pass** (was 5/6): the original assertion plus two new tests — PUBLIC has no TEMP/CREATE and temp/schema creation actually fails; a table-privilege matrix (writable runtime tables, SELECT-only catalogs, no ledger/API-key access) and "every RLS table the role can read has a role-scoped policy".
- Application runtime: the whole E2E suite ran against the API connected as `vista_app_runtime` on the K–M database. School isolation and submission-file access are covered by the cross-school E2E specs and the privilege matrix.
- Database safety suite (python, all opt-in env vars set against disposable `vista_test_*` / `vista_baseline_test_*` databases that were dropped afterwards): **268 run, 0 failed in the dedicated checks; the one rollback-integration test needs a baseline-restored database and passed separately (1/1)**. Develop's baseline run of the same suite: 0 failed. Four tests I had to adapt: two release-scope invariants and the release harness (it hides later scopes from the D-I/J scenarios) and the bootstrap required-object list.

## 5. Student quiz points (browser-verified)

Finding: the Question Bank stored `points` and the server grades by points, but the student UI never rendered them (the public snapshot type dropped the field) and the author UI always added questions with `points: 1`.
Fix: authors set points (0.01–1000, ≤2 decimals) per question when adding; the quiz order shows points; the student page shows each question's points and the total, and after grading `N of M points earned` plus per-question `earned / possible` and explanations; quizzes without points (older snapshots) show nothing invented.
Evidence: Vitest (3 new tests); Playwright Journey 2: questions worth 3 and 1 points → authoring API returns them; student page shows `Total: 4 points · Pass at 70%` and `· 3 points`, `· 1 point`; attempt 1 (1-point question right, 3-point wrong) → `Score: 25%`, `1 of 4 points earned`, per-question `0 / 3` and `1 / 1` (an unweighted score would have been 50%); attempt 2 → `100%`, `4 of 4 points earned`; the server persisted scores are `[25, 100]`.

## 6. Test counts (integrated code, disposable infrastructure only)

| Gate | Result |
| --- | --- |
| API `tsc` / web `tsc` | 0 / **0** |
| API build / web build | PASS / PASS |
| API Jest | 79 suites passed, 19 skipped (opt-in DB/S3/Supabase); **890 passed, 0 failed, 178 skipped** |
| DB-backed Jest (`*.db.spec`, 17 suites, incl. runtime-role security; guard pointed at 55433 temporarily and restored) | **151 passed, 0 failed** |
| `iot-feedback.repository.int.spec` | NOT RUN (expects Supabase-local DB on 54322) |
| Web Vitest | 84 files, **581 passed, 0 failed** |
| Playwright (real browser + real API + K–M database + restricted runtime role) | **13/13 passed** |
| Python database safety suite | see §4 (0 failed) |
| Python robot-runtime / hardware-adapter / digital-twin suites | NOT RUN in this task |

## 7. LMS regression coverage (real browser unless stated)

Instructor authoring (Journey 1), School Admin authoring (publishing-policy test), Instructor-only publishing (E2E + DB spec + verifier), school-owned and global offerings (classroom flow + specs), school isolation (cross-school specs and every foreign-school authoring call → 404), course/module/lesson management and Question Bank + mini quizzes (Journey 2), student attempts with weighted scoring, classroom assignments and instructor grading with develop's per-attempt release (spec "Student submits a ProgramVersion…"), student progression (course-builder-delivery + persistence specs), execution provenance (Jest/Vitest only — **no real-stack Robot Lab run in this checkout**).

## 8. Team and RC features preserved

Team: PR #147 and the symbolic evaluator (develop's Jest specs run and pass), ProgramVersion/assignment evaluation, migrations F–J (registered chain intact; fresh apply succeeds), transactional course publishing (kept; authority evaluated inside it), course-archive protections (specs pass), attempt-level grade release (used by the E2E), CI/release tooling (extended additively, base scopes unchanged). No team test was removed; the tests changed were those asserting superseded contracts (D1 global-only offerings; "only a system administrator can publish").
RC: school-scoped authoring, ownership/isolation, question authoring and publication, Instructor-only publishing, weighted quiz display, execution provenance, authoring UI and E2E suite.

## 9. Remaining blockers / not verified

1. K–M and the TEMP revocation are **not approved for any shared or production database**; production still needs an authoritative role/permission seed (K inserts permissions and grants only to roles that already exist) and the existing release gates.
2. Robot Lab and Digital Twin real-stack/browser acceptance not run; Python suites not run in this task.
3. Failed-upload recovery (no S3) not run; `iot-feedback` int spec not run.
4. The new Digital Twin workspace from the checkpoint is not part of this branch.
5. Local green results are not production readiness.
