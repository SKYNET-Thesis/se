# Device provisioning contract (Education API → Desktop Lab Station / Edge Runtime)

Status: **implemented and verified locally** (Playwright `platform-device-provisioning` 10/10 against the real API, restricted `vista_app_runtime` role and disposable PostgreSQL; Jest `device-crypto`, `production-config`, `health.readiness`). **Not applied to any shared or Production database**: it needs staged migration R (`database/staged-migrations/20261120_r_device_provisioning.sql`), which is unapproved. The feature is **off by default** (`DEVICE_PROVISIONING_ENABLED`); when off every route below answers `404`.

Scope guard: this is the VISTA-side identity of a *device*. It issues **no AWS credential**, no long-lived shared secret and uses **no AWS IoT provisioning**. The device access token is valid only against this API. Cloud (MQTT/AWS) onboarding remains a separate, postponed decision.

## 1. Model

* Table `robot_devices`: `id`, `organization_id`, `name`, `device_kind` (`desktop_lab_station` | `edge_runtime`), optional `robot_id`, `status` (`pending` → `active` ⇄ `suspended`; `revoked` terminal), `public_key` (Ed25519 SPKI, base64url), `key_fingerprint` (sha256 of the key), `credential_version`, `last_seen_at`, lifecycle timestamps, `revoke_reason`. Name unique per organization; a key fingerprint may be active on only one non-revoked device.
* Table `device_enrollment_challenges`: only **hashes** are stored (sha256 of the code and of the nonce); one-time, expiring.
* RLS enabled; runtime role has SELECT/INSERT/UPDATE only (no DELETE). Audit rows in `audit_logs` (insert-only for the runtime role).
* Ownership/scoping: a device belongs to exactly one organization; an optional robot must be entitled to that organization (`org_entitlements`, currently valid). A suspended/closed organization disables the device immediately.
* Permission: `education.devices.manage` (granted to the School Admin role by the migration); System Administrators manage any organization through `org.manage`. Everyone else, and other tenants, get `404`.

## 2. Management routes (user session, `Authorization: Bearer <Supabase JWT>`)

Base: `/api/v1/education-admin/organizations/:organizationId/devices`

| Method / path | Body | Success | Notes |
|---|---|---|---|
| `POST /` | `{ name (≤120, non-blank), deviceKind, robotId? }` | `201 { device, enrollmentCode, enrollmentExpiresAt }` | Code is `vd_<32 base64url>`, **shown once**, valid `DEVICE_ENROLLMENT_TTL_HOURS` (default 24, 1–168). Audit `device.registered`. `409` duplicate name; `404` robot not entitled. |
| `GET /`, `GET /:deviceId` | – | `200` device view / list (max 200) | View never contains key material beyond the fingerprint. |
| `POST /:deviceId/suspend` | `{ reason? ≤500 }` | `200` | `active → suspended`; `409` otherwise; idempotent when already suspended. Audit `device.suspended`. |
| `POST /:deviceId/resume` | – | `200` | `suspended → active`; `409` otherwise. Audit `device.resumed`. |
| `POST /:deviceId/revoke` | `{ reason? }` | `200` | **Permanent and idempotent.** Invalidates tokens at once. Audit `device.revoked`. |
| `POST /:deviceId/rotate-credential` | – | `201 { device, enrollmentCode, enrollmentExpiresAt }` | Drops the key, status → `pending`, bumps `credential_version` (old tokens die), issues a new one-time code; `409` if revoked. Audit `device.credential_rotation_requested`. |

## 3. Device routes (no user session; identity is the device's own key)

Base: `/api/v1/devices`. All four public routes are rate-limited per `deviceId` (`DEVICE_AUTH_LIMIT_PER_MINUTE`, default 10) and per client address (`DEVICE_IP_LIMIT_PER_MINUTE`, default 120) → `429`. Production runs behind a trusted proxy (`TRUST_PROXY=1`).

The device generates its **own Ed25519 key pair** and never sends the private key. Public key = SPKI DER, base64url. Signature = raw 64-byte Ed25519 signature of the UTF-8 message, base64url (86 chars).

### 3.1 Enrollment (once per credential)
1. `POST /devices/enroll/start` `{ enrollmentCode }` → `200 { deviceId, nonce, nonceExpiresAt (5 min), signedMessageFormat, algorithm:"Ed25519" }`. Unknown/expired/used code or non-pending device → `404`.
2. `POST /devices/enroll/complete` `{ deviceId, nonce, publicKey, signature }` where `signature` signs `vista-device-enroll:v1:<deviceId>:<nonce>` → `201 { deviceId, status:"active", keyFingerprint, credentialVersion }`. Bad/foreign signature or stale nonce → `401` (challenge survives for a retry within its window); malformed key → `400 INVALID_PUBLIC_KEY`; replay of a completed enrollment → `409`; key already used by another device → `409`. Audit `device.enrolled`.

### 3.2 Session (every time the device needs an API token)
1. `POST /devices/auth/challenge` `{ deviceId }` → `200 { nonce, expiresAt (60 s), signedMessageFormat, algorithm }`.
2. `POST /devices/auth/token` `{ deviceId, nonce, signature }` where `signature` signs `vista-device-auth:v1:<deviceId>:<nonce>` → `200 { accessToken, tokenType:"device", expiresIn }` (default 900 s; `DEVICE_TOKEN_TTL_SECONDS` 60–3600). The nonce is **single use**: consumed atomically even when the signature is wrong.
3. Any failure (unknown device, not active, suspended, revoked, org not active, wrong signature, used/expired nonce) returns the same generic `401 "Device authentication failed."`.

### 3.3 Authenticated device calls (`Authorization: Bearer vd1.<payload>.<hmac>`)
* `GET /devices/me` → `{ id, organizationId, name, deviceKind, robotId }`.
* `POST /devices/me/heartbeat` → `200 { status:"active", serverTime }`; updates `last_seen_at`.
* The token is HMAC-signed (`DEVICE_TOKEN_SECRET`, ≥32 chars) and bound to `credential_version`; **every request re-checks the live device and organization**, so suspend/revoke/rotate/org-suspend take effect on the next request, not at token expiry.
* Device tokens are **not accepted** by any user route and user tokens are not accepted by device routes.

## 4. Lifecycle summary

`register → pending → (enroll) active → suspend ⇄ resume → revoke (terminal)`; `rotate-credential` from pending/active/suspended returns to `pending` with a new code.

## 5. Configuration

| Variable | Meaning |
|---|---|
| `DEVICE_PROVISIONING_ENABLED` | `true` to expose the routes (default off → 404) |
| `DEVICE_TOKEN_SECRET` | ≥32 chars; required when enabled; **the production validator refuses to boot** with a missing/short/placeholder value |
| `DEVICE_TOKEN_TTL_SECONDS`, `DEVICE_ENROLLMENT_TTL_HOURS` | token and code lifetimes (defaults 900 / 24) |
| `DEVICE_AUTH_LIMIT_PER_MINUTE`, `DEVICE_IP_LIMIT_PER_MINUTE` | rate limits (10 / 120) |

`GET /health/ready` does not require R (provisioning is optional); it reports the Q/P columns and runtime role.

## 6. What the Desktop must do

1. Operator registers the device in the Web LMS API and hands over the one-time code (out of band).
2. Desktop generates a key pair in OS secure storage, runs §3.1, stores `deviceId` and keeps the private key local.
3. Per session run §3.2, keep the access token in memory only, re-run on `401`.
4. On `401` after having worked: the device was suspended/revoked/rotated or its organization suspended — stop robot-facing work; do not retry-loop (respect `429`).
5. Never log the code, nonce, signature or token.

## 7. Verified behaviours (`platform-device-provisioning`, 10 tests)

Registration + isolation between schools; wrong role/tenant `404`; full enrollment + session; replay/foreign-signature/garbage rejection; single-use nonces; suspend/resume/revoke/rotate effects on existing tokens; per-device rate limit; org suspension; audit rows for each lifecycle action; no secrets in responses.

## 8. Not covered / open

* Production application of migration R and hosted-environment acceptance (NOT TESTED).
* Binding a device token to MQTT/IoT topics or any cloud credential (explicitly out of scope).
* Per-device command authorization (physical execution authorization remains the existing user/attempt-based path).
