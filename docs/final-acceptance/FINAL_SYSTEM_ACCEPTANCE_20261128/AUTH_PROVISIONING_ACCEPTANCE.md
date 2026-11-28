# Account provisioning and first-login password policy — acceptance (2026-11-28)

Owner-approved requirement integrated into **WF-01** (a refinement, not a new workflow) and into the existing authentication, role, security, defect, runbook and freeze documents. Continues the existing acceptance; nothing was restarted.

**Revision tested:** branch `feat/staff-direct-accounts-20261128`, head `7beb691` = `develop` `eceb8d1` + untrack-symlink fix + this feature (PR #279). **Environment: LOCAL isolated** — real GoTrue (pinned image), real Education API with the runtime database role, PostgreSQL 17, real Chrome; staged migration U applied to the disposable database only. **Nothing was done on Production**: no configuration change, migration, deployment, account change or e-mail. Local PASS is not Production PASS.

## 1. What was found
| Finding | Evidence |
|---|---|
| The first-login password gate existed **for students only** (`education_school_user_profiles.password_change_required`, `person_type='student'`, `SupabaseAuthGuard`). School Administrators have **no profile row** and Instructor profiles require an employee code, so no staff account could be forced to change a temporary password | `supabase-auth.guard.ts`, `20261118_n_*.sql`, baseline `education_school_user_profiles_check` |
| Staff provisioning was invitation-only (`SupabaseAdminService.invite`) — no direct creation | `organization-management.service.ts` (`assignAdministrator`), `education-admin.service.ts` (`provisionImportRow`) |
| Invitation redirect: the redirect is taken from the optional `SUPABASE_INVITE_REDIRECT_URL`; the 2026-11-24 readiness record lists Production's secret as **10 keys with the optional keys absent**, and lists Site URL / redirect allow-list / custom SMTP as owner items. Without the variable GoTrue falls back to its Site URL, which matches the reported `localhost:3000` redirect. **Not confirmed**: the live Supabase Site URL and the API's live variable were not inspected (no Supabase dashboard or management access, and reading the secret would expose it) | `docs/operations/PRODUCTION_RELEASE_READINESS_20261124.md`, `supabase-admin.service.ts:168,183` |
| Actual SMTP provider | **Not determinable** from the repository or by public endpoints. Gmail is **not assumed**. If it is Gmail: 2-step verification and an App Password are required and the sender is rate-limited; the owner must confirm the provider in Supabase → Authentication → SMTP |
| An existing Auth user without a usable password (failed invitation) had no recovery other than deleting and re-inviting | no code path existed |

## 2. What was built (flag `STAFF_TEMP_PASSWORD_ENABLED`, default **off**)
* **Staged migration U** `database/staged-migrations/20261128_u_staff_password_change_required.sql` — three additive columns on `public.users` (`password_change_required` default false, `password_changed_at`, `temporary_password_expires_at`). Not in the release manifest, **not executed anywhere except the disposable local database; owner approval required** (release by the existing two-commit procedure and the Production Database Release workflow). With the flag off the API never reads or writes them, so deploy-before-migrate is safe.
* **`StaffAccountService` / `StaffAccountController`** — `POST /education-admin/organizations/:id/accounts` (`method: direct | invite`, `role: school_admin | instructor`), `POST …/accounts/:userId/recover-pending`, `POST …/accounts/:userId/reset-credentials`, `PATCH /auth/staff/password`, `GET /auth/staff/capabilities`.
  * Authorization: System Admin → School Admin (any school) and Instructor; School Admin with `education.members.provision` → Instructor of **their own** school only; everything else (cross-school, escalation, instructors) answers 404; unknown role 400. Students keep their own existing pipeline (temporary password + first-login change).
  * Temporary password: 24 random bytes (`crypto.randomBytes`, base64url, 32 chars), unique per account, default expiry 72 h (`STAFF_TEMP_PASSWORD_TTL_HOURS`, 1 h–14 d). Returned **once** in a `no-store` response to the authorized administrator; never persisted, never logged, never e-mailed.
  * Atomicity: the Auth identity is created first (an existing e-mail is never reused or touched), then user + membership + profile + audit in one transaction; on any failure the Auth identity is deleted and the request fails (no false success, no orphan membership).
  * Recovery: `recover-pending` keeps the same Auth user id, profile and membership; it **refuses** any account that is not `invited`, has ever signed in (checked against GoTrue `last_sign_in_at`), or already completed a change. `reset-credentials` works only while the first-login change is still pending. Both revoke earlier sessions (`password_changed_at`) and write an audit event; an account with a permanent password is never overwritten.
  * Gate: `SupabaseAuthGuard` computes `password_change_required` from `public.users` (and student profiles when their flag is on). Every route except `PATCH /auth/staff/password` and `/auth/students/password` answers **403 `PASSWORD_CHANGE_REQUIRED`**; an expired temporary password answers **403 `TEMPORARY_PASSWORD_EXPIRED`**; a pre-change session answers **401 `SESSION_ROTATED`**. The change requires the temporary password (verified against GoTrue), a different new password (≥12 characters, policy shown live), sets the new password through the admin API, rotates sessions, clears the gate only after the server-side update, and restores the previous credential if persistence fails.
* **Web** — `StaffAccountDialog` (two clearly separate actions: **Create account** and **Send invitation**), one-time credential reveal with *Copy credentials*, row actions *Recover pending account* / *Reset temporary credentials*, status labels *Pending invitation*, *Password change required*, *Active*; shown only when the server reports `staffDirectAccountsEnabled`. The forced-change page now serves staff as well (falls back to the staff endpoint when the student gate answers 409). Existing light design, no redesign.
* **Defect fixed on the way (N-15):** after a staff sign-in the login page verified roles, received `PASSWORD_CHANGE_REQUIRED`, and its generic error handler **signed the user out while the redirect was in flight**, so the forced-change page had no session.
* **Defect fixed on the way (N-16):** access tokens carry `iat` at one-second precision; credentials re-issued by an administrator could be used in the same second as the cutoff and were treated as a stale session. Re-issue now waits for the next second boundary (as the student flow already did).

## 3. Acceptance cases
Status vocabulary PASS / FAIL / BLOCKED / NOT RUN. "Local" = the environment above at `7beb691`. "Prod" = Production (not run: needs explicit owner authorization).

| ID | Case | Local | Evidence | Prod |
|---|---|---|---|---|
| ACCT-01 | System Admin directly creates a School Admin | **PASS** | Playwright API `ACCT-01/02` (201, role/school correct, audit `account.created`); UI `System Admin creates a School Administrator account` | NOT RUN |
| ACCT-02 | Credentials delivered through the authorized process, once | **PASS** | one-time response with `Cache-Control: no-store`; listings never contain it; unit test: not in any SQL/log; UI reveal then discarded | NOT RUN |
| ACCT-03 | School Admin logs in with temporary credentials | **PASS** | GoTrue password grant 200 | NOT RUN |
| ACCT-04 | First-login change is mandatory | **PASS** | UI held on `/student/change-password`; API 403 `PASSWORD_CHANGE_REQUIRED` | NOT RUN |
| ACCT-05 | Dashboard access before the change is rejected | **PASS** | `/me/roles`, members, classrooms, learning, attempts → 403; UI `/school`, `/school/users`, `/courses` redirect to the change page | NOT RUN |
| ACCT-06 | Direct API access before the change is rejected | **PASS** | including provisioning calls (403) | NOT RUN |
| ACCT-07 | Direct URL, refresh, new browser context cannot bypass | **PASS** | UI test 2 (URLs, reload, fresh context) | NOT RUN |
| ACCT-08 | Permanent password establishment | **PASS** | wrong current → 401, same as temp → 401, short → 400, correct → 200 + new session | NOT RUN |
| ACCT-09 | Temporary password no longer works | **PASS** | password grant ≥ 400; UI sign-in returns to `/login` | NOT RUN |
| ACCT-10 | Permanent password works | **PASS** | API and UI | NOT RUN |
| ACCT-11 | School Admin directly creates an Instructor | **PASS** | API + UI (`Create instructor account`), teacher profile with employee code | NOT RUN |
| ACCT-12 | School Admin directly creates a Student | **PASS (existing pipeline)** | students keep the existing temporary-password provisioning; real-GoTrue student API suite **13/13 re-run with the staff flag on**; UI suite 18/18 (earlier in this cycle, flag off) | NOT RUN |
| ACCT-13 | Instructor and Student complete mandatory changes | **PASS** | Instructor: API + same page; Student: existing suites | NOT RUN |
| ACCT-14 | System Admin invites a School Admin by **actual** e-mail | **NOT RUN** | the local invitation path creates an `invited` account but **no mail transport exists locally**; real delivery needs the Production SMTP and owner authorization | NOT RUN |
| ACCT-15 | School Admin activates the invitation, sets a password | **NOT RUN** | needs a real invitation e-mail | NOT RUN |
| ACCT-16 | School Admin invites Instructor and Student | **NOT RUN** | same | NOT RUN |
| ACCT-17 | Both activate and set passwords | **NOT RUN** | same | NOT RUN |
| ACCT-18 | Existing previously invited account recovered without deletion | **PASS (simulated)** | an Auth user with no password + `invited` rows recovered in place: same Auth user id, one membership, login works, then a second recovery is refused (409) and an active fixture instructor is refused (409) and still signs in. **Real affected Production accounts: NOT RUN — needs owner approval** | NOT RUN |
| ACCT-19 | Duplicate creation handled safely | **PASS** | 409, no extra rows, existing identity never deleted (unit + API) | NOT RUN |
| ACCT-20 | Expired temporary credentials rejected | **PASS** | expiry forced in the database → 403 `TEMPORARY_PASSWORD_EXPIRED` for every route including the change endpoint; authorized reset re-issues, old password and old session die | NOT RUN |
| ACCT-21 | Expired and reused invitations | **PARTIAL → NOT RUN for invitations** | single-use recovery links were already proven (`staff-auth-recovery-ui`); invitation tokens need a real invitation | NOT RUN |
| ACCT-22 | Actual password-recovery e-mail delivered | **NOT RUN** | no SMTP locally; link generation through the admin API is tested, delivery is not | NOT RUN |
| ACCT-23 | Recovery succeeds on the correct Production URL | **NOT RUN** | Production only | NOT RUN |
| ACCT-24 | Direct creation works independently of SMTP | **PASS** | the local GoTrue has no SMTP at all | NOT RUN |
| ACCT-25 | Cross-school provisioning rejected | **PASS** | other school's admin → 404; own org vs other org → 404 | NOT RUN |
| ACCT-26 | Unauthorized role assignment rejected | **PASS** | School Admin creating a School Admin → 404; instructor → 404; unauthenticated → 401; `system_admin` → 400 | NOT RUN |
| ACCT-27 | Role and school membership correct after the change | **PASS** | SQL: one membership `school_admin` in the right organization, `active`; gate columns cleared; audit `account.first_login_password_changed` | NOT RUN |
| ACCT-28 | No credentials in logs or unauthorized responses | **PASS** | no password in `audit_logs`, `users`, member listings, or the API log (searched for every issued password) | NOT RUN |
| ACCT-29 | Failure leaves no inconsistent membership | **PASS** | unit tests (persistence failure deletes the Auth identity; no success reported; invite path likewise) | NOT RUN |
| ACCT-30 | Activation status accurate | **PASS for the implemented states** | *Password change required* (not "Active") until the change, *Pending invitation* for invited, *Active* after; **gaps: no computed "Expired invitation" state; Disable already exists** | NOT RUN |

**Totals (local, 30 cases):** PASS 23 (ACCT-12 and ACCT-18 with the scope stated in their rows), NOT RUN 7 (ACCT-14, 15, 16, 17, 21, 22, 23), FAIL 0. Production: 0 of 30 executed.

## 4. Test evidence
* Backend Jest, no database: 122 suites passed; **1415 passed, 0 failed** (unit `staff-account.service.spec` 11/11).
* Playwright, real GoTrue, API: `staff-direct-accounts-api` **10/10**; student suites with the staff flag on **13/13**.
* Playwright, real GoTrue, UI: `staff-direct-accounts-ui` **3/3**.
* Web: Vitest **845/845** (+2: login keeps the session on `PASSWORD_CHANGE_REQUIRED`; staff fallback of the change page), `tsc` clean, ESLint 0 errors.
* Not re-run for this change (unchanged areas): the 256-test acceptance of the baseline; the CI-only database suites. **CI for PR #279 is pending.**

## 5. Completion gate (section 12 of the requirement)
| Criterion | Status |
|---|---|
| Direct Account Creation works | **PASS locally** |
| Temporary credentials work | **PASS locally** |
| First-login change enforced by the backend | **PASS locally** (behind the flag; needs migration U) |
| Email Invitation works | **NOT RUN** (delivery) |
| Invited users establish passwords | **NOT RUN** |
| Existing affected accounts can be recovered | **PASS in simulation; Production NOT RUN** |
| SMTP works | **BLOCKED** — provider unknown, no access |
| Password recovery works | link/password change **PASS locally**; delivery **NOT RUN** |
| Role and school isolation | **PASS locally** |
| Actual Production acceptance evidence | **NOT RUN** — requires owner authorization |

**Therefore Authentication, WF-01 and Web Production Acceptance are NOT declared complete.**

## 6. Owner actions to finish (nothing was executed)
1. Approve migration U and its release (Production Database Release workflow), then set `STAFF_TEMP_PASSWORD_ENABLED=true` (and the TTL if desired) in the API environment. Do not turn the flag off again while staff are pending.
2. Supabase dashboard: confirm the **SMTP provider** and sender (Authentication → SMTP; for Gmail: 2-step verification + App Password, daily limits), set **Site URL** and the redirect **allow-list** to the Production origin only, set `SUPABASE_INVITE_REDIRECT_URL` in the API secret, confirm the invite and recovery templates.
3. Authorize a Production run: ACCT-14…17, 21–23 with real mailboxes; and approve the recovery of the existing invited accounts (`recover-pending` for each verified pending account, or a fresh invitation after the redirect is fixed). **Production accounts were not touched.**
4. Merge PR #279 (and #277 beneath it) into develop when CI is green; `main` stays owner-only.
