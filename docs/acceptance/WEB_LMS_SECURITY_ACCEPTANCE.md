# Web LMS + Education API — security acceptance report (2026-11-20)

Local, disposable infrastructure only (PostgreSQL 17, RustFS S3, local JWKS signer, real GoTrue `v2.197.0` harness). Nothing was run against Production, AWS or a hosted Supabase project. Statuses: **PASS / FAIL / BLOCKED / NOT TESTED**. This is engineering evidence, **not** a sign-off: the human security sign-off in item 4 of the readiness blockers is still required.

| # | Control | Status | Evidence |
|---|---|---|---|
| 1 | Tenant isolation: every new route answers 404 to other schools/roles; System routes invisible to non-system roles | PASS | `platform-system-admin`, `platform-school-admin`, `platform-full-journey`, `lms-security-matrix`, `platform-media-archive`, `platform-device-provisioning` |
| 2 | RBAC enforced server-side (permissions come from membership + organization status, never from the client) | PASS | guard + service specs; E2E role matrices |
| 3 | Invited → active transition: single conditional statement (admin-created, subject-linked, email-claim match, non-anonymous, active membership in an **active** organization, instructor/school-admin only); disabled accounts rejected first | PASS | 11 E2E scenarios + 5 unit tests |
| 4 | Suspension/closure/disable removes authorization on the next request **and** closes live Digital Twin viewers | PASS | `digital-twin-websocket-revocation` 11/11 (real WebSocket close `4403`), `digital-twin-revocation`, `platform-lifecycle` |
| 5 | Twin viewer scope: attempt-bound, 60 s, 404 on every failure, fails closed; WebSocket handshake now selects the offered subprotocol (defect found and fixed this session) | PASS | `test_attempt_scope.py` (59/59 Twin tests), real-client spec |
| 6 | Runtime DB role: non-superuser, no BYPASSRLS, no CREATE/TEMP from PUBLIC (after M), no ledger/API-key access, DML matrix | PASS **locally** (M applied on disposable DB); **BLOCKED for Production** (M unapproved, hosted validation pending) | `runtime-role-security.db.spec` 8/8; K-L and M verifiers |
| 7 | Media: type/size allow-list, identity verification, private bucket, signed URLs, no hard delete, archive blocked while referenced, archived files not served | PASS | 97 media unit tests, S3 integration 6/6, `platform-media-archive` 3/3 |
| 8 | Device identity: per-device Ed25519, one-time code (only sha256 stored), single-use nonces, token bound to `credential_version`, live status check per request, generic 401s, rate limits, audit, no cloud credential issued | PASS (feature flag off by default) | `platform-device-provisioning` 10/10, `device-crypto` + flag-off unit tests; production validator refuses a missing/short secret |
| 9 | Student temporary password / recovery: plaintext never persisted or logged | PASS | 0 plaintext occurrences in DB dump and API/GoTrue/proxy logs (real-GoTrue harness leak scan, re-run at end of this session: see final report) |
| 10 | Secrets: none in changed files; local placeholders are labelled; production validator rejects placeholders, `LEARNING_MEDIA_S3_ENDPOINT`, non-loopback Twin URL, short secrets | PASS | staged-diff scan before commit; `production-config.spec` |
| 11 | Rate limits (student auth, reissue, device endpoints) and `TRUST_PROXY=1` kept | PASS | specs + E2E |
| 12 | Accessibility (axe WCAG 2.0/2.1 A+AA) | PASS | `platform-axe` |
| 13 | Hosted Supabase behaviour (email confirmation, invitation mail, redirect URLs) | NOT TESTED | operator checklist in `WEB_LMS_PRODUCTION_READINESS.md` §2 |
| 14 | AWS/CloudFront/S3-in-AWS behaviour, broker/AWS IoT MQTT | NOT TESTED | postponed by decision |
| 15 | Physical robot paths, real motor frames | NOT TESTED | forbidden in this sprint |

## Residual risks (accepted for local acceptance, open for Production)

1. Revocation delivery is best-effort with bounded retry and no persistent outbox: an API crash between commit and delivery falls back to the ≤60 s scope TTL; the Twin forgets revocations on restart.
2. An unscoped viewer connecting to a Twin with no buffered simulation stream receives the labelled **mock** stream (no attempt data).
3. Device enrollment codes travel out of band; whoever holds an unexpired code can enroll once (24 h default, one-time, replaced by rotation).
4. Migration M is applied only on disposable databases; the Production runtime role keeps PUBLIC `TEMP` until M is approved and applied.
5. In-memory rate limits are per API task (consistent with the existing student-auth limiter).
