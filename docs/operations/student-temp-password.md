# Student temporary password (first-login password change)

Status: implemented and verified against a real Supabase GoTrue + PostgreSQL on a disposable stack. **Disabled by default.
Not released to Production.** Releasing it needs an approved database migration (below) and an explicit flag change.

## Flow

School Admin imports/creates students → API generates a 192-bit random temporary password per new student → a school-scoped
Supabase Auth identity (`student-<userId>@students.auth.vista.invalid`, never shown in the UI) is created with that password →
the profile row is flagged `password_change_required` with an expiry → the admin sees the credential **once** (response is
`Cache-Control: no-store`; the web app drops it when the result dialog closes) → the student signs in with school code +
student code + temporary password → every ordinary API route answers `403 PASSWORD_CHANGE_REQUIRED` until
`PATCH /auth/students/password` succeeds → the student lands in My Learning.

* Existing students, the legacy Setup Code and the Recovery Code are untouched. Existing rows keep
  `password_change_required=false`; nothing is back-filled.
* Plaintext passwords are never stored or logged (verified by scanning a full data dump and the API/GoTrue/proxy logs for every
  issued, reissued, changed and recovered password: 0 hits).
* Provisioning is idempotent and crash-safe: a claim token + 1-hour lease on the profile row (`account_state='invited'` while
  in progress), the Supabase identity is created/looked up by its UUID-derived alias, and an orphan trigger-created stub is
  reconciled in the finalizing transaction. A re-import never rotates an existing student's password.
* Reissue (`POST /education-admin/organizations/:org/students/:id/temporary-password/reissue`, permission
  `education.members.provision`) only applies to students still pending their first change, serializes per student with an
  advisory lock, writes an audit row without the secret, and is limited to 5 per administrator per hour (in-process window,
  because the runtime database role is INSERT-only on `audit_logs`).
* Expiry (default 72 h, `STUDENT_TEMP_PASSWORD_TTL_HOURS`, 1–720): an expired temporary password is refused at login and by the
  guard (`TEMPORARY_PASSWORD_EXPIRED`); the admin reissues.

## Sessions after a password change (what is and is not guaranteed)

* The replacement session is created after the change and the API calls GoTrue `POST /logout?scope=others` with it, which
  revokes the refresh tokens of the student's other sessions (verified: the pre-change refresh token is rejected by GoTrue).
  This call is best effort.
* Server-side backstop: access tokens whose `iat` is not later than `password_changed_at` are refused (`401 SESSION_ROTATED`).
  Supabase access tokens carry `iat`, **not** `auth_time` (checked against a real GoTrue token).
* An access token issued before the change that has not expired is *not* revoked by Supabase itself; the `iat` cutoff rejects it
  at this API only. This is not a global Supabase session revocation.

## Feature flag and migration safety

`STUDENT_TEMP_PASSWORD_ENABLED` (default `false`, see `.env.example`).

* **Flag off:** no code path reads or writes the new columns. The API runs unchanged against a database that has *not* received
  the migration (verified: auth guard, people list, student login, LMS reads and legacy import all succeed on a schema copy with
  the five columns dropped). Deploy-before-migrate is therefore safe.
* **Flag on:** requires the migration. Do not turn the flag off again while students are still pending their first change; the
  forced-change gate lives behind the flag.

Migration `services/education-api/prisma/migrations/20261118_student_password_change_required/migration.sql` (not registered in
`database/migrations/manifest.json`, **not applied anywhere except disposable databases**): five `ADD COLUMN IF NOT EXISTS`
on `public.education_school_user_profiles`: `password_change_required boolean NOT NULL DEFAULT false`,
`password_changed_at`, `temporary_password_expires_at`, `provisioning_claim_token uuid`, `provisioning_lease_until` (nullable).
Additive only, no back-fill, no constraint/index/RLS/grant/trigger changes, metadata-only on PostgreSQL ≥ 11. The runtime role
already has SELECT/INSERT/UPDATE on the table (migration L), so no grant change is needed. Rollback = leave the columns (unused
when the flag is off) or `DROP COLUMN` them after the flag has been off.

### Release plan (needs explicit approval; not part of the LMS release)

1. Register the migration in the release manifest / apply through the approved Production database release workflow
   (backup + schema gate), then verify the columns exist.
2. Deploy API + web with the flag **off**; verify existing login, Setup Code and Recovery Code.
3. Set `STUDENT_TEMP_PASSWORD_ENABLED=true` (Student Auth already requires `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`),
   restart, provision one test student, complete the first-login change, then roll out.
4. Rollback: set the flag to `false` (students already changed are unaffected; pending ones must be reissued a Setup Code
   or have their temporary password changed first).

## Real-integration test harness (local only)

No Production or hosted Supabase is used. Components: disposable `postgres:17` (tmpfs, loopback port) bootstrapped with
`scripts/bootstrap_dev_database.py`; `public.ecr.aws/supabase/gotrue:v2.197.0` on the same database (`auth` schema) with
`GOTRUE_JWT_KEYS` = one ES256 signing key + the HS256 secret as a verify-only `oct` key, `GOTRUE_JWT_ISSUER` and
`API_EXTERNAL_URL` = `http://127.0.0.1:54323/auth/v1`; a ~15-line Node reverse proxy on `127.0.0.1:54323` that strips the
`/auth/v1` prefix and adds CORS (hosted Supabase's gateway does both); fixtures from `phase243-e2e-fixtures.js seed` plus real
GoTrue users created with the fixture auth UUIDs; the Education API twice (flag on `:3012`, flag off `:3013`, `TRUST_PROXY=1`).
Run `playwright test -c playwright.student-auth.config.ts` (API journeys) and with `SA_WITH_UI=1` (browser journeys).
The API specs use a distinct `X-Forwarded-For` per request so the per-IP student-auth limiter (10/min) does not interfere, and
assert that the limiter does trigger.
