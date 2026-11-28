# Decision record — `STUDENT_TEMP_PASSWORD_ENABLED` in Production

Read-only source inspection at `develop` `43d7f10`; Production's running API has the flag effectively `true` (checked 2026-11-26). Nothing was changed.

## What the flag controls
| Area | When `true` | When `false` |
|---|---|---|
| School Admin student import / provisioning (`StudentProvisioningService.provision`) | creates a Supabase identity with a random temporary password (shown once), marks the profile `password_change_required` with an expiry | legacy path: Setup Code activation, Recovery Code |
| `POST …/temporary-password/reissue` | allowed (admin permission `education.members.provision`) | 403 "Temporary student credentials are not enabled." |
| `PATCH /auth/students/password` (first-login change) | works while a change is pending | 409 "No first-login password change is pending." |
| Auth guard (`SupabaseAuthGuard`) | reads `password_change_required`, `temporary_password_expires_at`, `password_changed_at`; enforces `PASSWORD_CHANGE_REQUIRED` (403), `TEMPORARY_PASSWORD_EXPIRED` (403), `SESSION_ROTATED` (401) | none of those columns are read or enforced |
| People list / student auth queries | include the new columns | omit them |
| `GET /auth/students/capabilities` | `{temporaryPasswordEnabled: true}` (web chooses the flow) | `false` |
Not controlled by the flag: staff (email) login and recovery, `POST /auth/students/login`, `/setup`, `/recover` endpoints themselves, instructors, all LMS routes.

## Dependency and risk of switching to `false`
- School-admin provisioning does **not** need the flag (legacy Setup Code path), but accounts already issued temporary passwords would lose their enforcement: a student still pending first change would no longer be forced to change it, and the temporary-password expiry would not be enforced. The feature's own documentation says not to turn it off again while students are pending.
- First-login and password-change workflows for such pending students would fail (409) rather than complete.
- Turning it **on** requires migration N (columns on `education_school_user_profiles`). Production serves traffic with the flag on and the guard reads those columns on every request, and `schema-gate` reports `compatible`, so the columns are present.

## Existing protections (verified in source/documentation)
192-bit random passwords, plaintext never stored or logged; per-address student-auth rate limit and a per-account limiter (10/min); reissue limited to 5 per administrator per hour; expiry default 72 h (`STUDENT_TEMP_PASSWORD_TTL_HOURS`, 1–720); forced change before any other API route; after a change, access tokens issued before `password_changed_at` are refused (`SESSION_ROTATED`) and other sessions are revoked best-effort via GoTrue `logout?scope=others`; idempotent, crash-safe provisioning; audit rows without secrets.

## Evidence coverage
Local real-GoTrue acceptance on `7ac0d58` covered **both** states: flag-on API (10/10, 3/3 session) and UI (11/11), flag-off legacy flow and default-off behaviour (inside `student-auth-api`). Not covered: the hosted Production Supabase project, real Production students, and Production's actual data.

## Recommendation
**Retain `true` for this release.** The setting predates this release and this release changes none of the code paths above; flipping it during a release window adds an untested configuration change and can strand any student issued a temporary credential. Before the defense, the owner should run a read-only count in the Production database (e.g. students with `password_change_required = true` and their expiry). If the count is zero and the owner prefers the legacy flow, set it to `false` as a separate, deliberate change after the release. If the owner wants it off *now*, that is a Secrets Manager change that only the owner makes, followed by the API restart/deploy.
