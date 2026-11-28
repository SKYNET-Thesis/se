# Supabase and SMTP configuration — exact values (Production project `ovijutkvaaxohauvuxbj`)

**Nothing here has been applied.** Only the owner can change the Supabase dashboard (no management access exists in this environment). The values below make the invitation, password-recovery and temporary-credential flows work and remove the `localhost:3000` redirect. Production web origin: `https://skynex.best` (API behind the same origin at `/api/v1`).

## Why invitations were broken (verified)
1. **No page existed to set a password for an invited user.** The invitation link signs the person in but sets no password; `/reset-password` accepts only genuine *recovery* events. Fixed in PR #283 (`/accept-invitation`). Without it the account exists in Supabase Authentication but can never sign in again — exactly the reported "accounts without a usable password".
2. **Redirect target.** The API passes `redirect_to` from `SUPABASE_INVITE_REDIRECT_URL`, which the 2026-11-24 readiness record lists as an *optional key absent from the Production secret*. When it is missing, or when the URL is not on the Supabase allow-list, Supabase falls back to the project **Site URL** — which is `http://localhost:3000` until changed. (The live dashboard value was not readable from here: confirm it.)
3. **E-mail delivery.** Supabase's built-in mail service is limited to a few messages per hour and is not for production. Custom SMTP is required. The current provider is **unknown** (not assumed to be Gmail).

## A. Authentication → URL Configuration
| Field | Value |
|---|---|
| Site URL | `https://skynex.best` |
| Redirect URLs (allow-list, exactly these; delete every `localhost` / `127.0.0.1` entry) | `https://skynex.best/accept-invitation` · `https://skynex.best/reset-password` · `https://skynex.best/login` |
| If `https://www.skynex.best` serves the app | add the same three paths for `www` **and** set the API `WEB_ORIGIN` accordingly; otherwise do not add it |

## B. Authentication → Emails → SMTP Settings (enable custom SMTP)
Pick the provider you actually own; the field names are the same.

| Field | Gmail / Google Workspace (only if that is what you use) | Transactional provider (recommended for production: Amazon SES, Resend, Postmark, SendGrid) |
|---|---|---|
| Sender e-mail | the Gmail address itself (Gmail rewrites any other From) | an address on a domain you verified (SPF + DKIM), e.g. `no-reply@skynex.best` |
| Sender name | `VISTA` | `VISTA` |
| Host | `smtp.gmail.com` | provider SMTP host |
| Port | `465` (SSL) — or `587` (STARTTLS) | `465` / `587` |
| Username | the full Gmail address | provider SMTP username |
| Password | a 16-character **App Password** (requires 2-Step Verification on the Google account: Google Account → Security → 2-Step Verification → App passwords). The normal account password will be rejected | provider SMTP password / API key |
| Limits to know | ~500 recipients/day (personal Gmail), ~2,000/day (Workspace); sending from a consumer Gmail address may be throttled or flagged | provider quota |

After saving: Authentication → **Rate Limits** → *Rate limit for sending emails* ≥ **100 per hour** (with custom SMTP the default is low), *Minimum interval per user* 60 s (default).

## C. Authentication → Emails → Templates
* **Invite user** — the button/link must be `{{ .ConfirmationURL }}` (Supabase appends `redirect_to` from the API). Subject: `You are invited to VISTA`.
* **Reset password** — link `{{ .ConfirmationURL }}`; redirect is requested by the app as `https://skynex.best/reset-password`.
* Do not put the password or any credential in a template. Temporary passwords are never e-mailed.

## D. Authentication → Sign In / Providers
| Setting | Value | Reason |
|---|---|---|
| Email provider | enabled | existing |
| **Confirm email** | ON | the invitation→active transition trusts the verified e-mail claim |
| **Allow new users to sign up** | **OFF** (recommended hardening) | the product has no self-registration; the 2026-11-24 record found public sign-up *allowed*. Admin invitations and the admin API are unaffected. A self-registered account can never gain a role (the API refuses it), but it should not be creatable |
| Minimum password length | **12** | matches the application policy (12+ characters) |
| Phone / anonymous / OAuth providers | OFF | existing |

## E. API configuration (AWS Secrets Manager `vista/demo/education-api/env`) — applied after the owner approves
| Key | Value | When |
|---|---|---|
| `SUPABASE_INVITE_REDIRECT_URL` | `https://skynex.best/accept-invitation` | before the next API start |
| `STAFF_TEMP_PASSWORD_ENABLED` | `true` | **only after** database scope `T-U` is applied and verified, and before the `deploy-api` approval (the new container reads it at start) |
| `STAFF_TEMP_PASSWORD_TTL_HOURS` | optional, default `72` (allowed 1–336) | with the flag |
| `STUDENT_TEMP_PASSWORD_ENABLED` | already `true` | unchanged |
| `WEB_ORIGIN` | `https://skynex.best` (already) | unchanged |
Safe edit (the secret value is never printed): `aws secretsmanager get-secret-value --secret-id vista/demo/education-api/env --query SecretString --output text | jq '. + {"SUPABASE_INVITE_REDIRECT_URL":"https://skynex.best/accept-invitation"}' > "$T" && aws secretsmanager put-secret-value --secret-id vista/demo/education-api/env --secret-string "file://$T"; shred -u "$T"` with `T=$(mktemp)`.

## F. How to verify after configuring (Production runbook cases ACCT-14…17, 21–23)
1. System Admin sends *Send invitation* to a mailbox you control → the e-mail arrives → the link's host is `skynex.best` (never `localhost`) → the page *Choose your password* → Password + Confirm → the correct dashboard; the account shows *Active*.
2. Open the same link again → *This invitation has expired or was already used*.
3. *Forgot password* → e-mail arrives → `https://skynex.best/reset-password` → new password → sign in.
4. *Create account* with SMTP deliberately disabled/rate-limited still succeeds (no e-mail involved).
