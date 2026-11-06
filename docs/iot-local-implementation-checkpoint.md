# IoT local implementation checkpoint

- Milestone 1: completed — recovery runner is feature-flagged, interval-configured, non-overlapping, and shuts down cleanly.
- Milestone 2: partially complete — PhysicalExecution persists intent/payload, claims `publishing`, publishes outside transactions, preserves early ACKs, and differentiates definite failure from unknown outcome. PostgreSQL tests exercise the private publish boundary with a real Prisma lifecycle fixture; public API status, concurrent API dispatch, persistence-after-publish failure, and feature-off integration remain to be added.
- Milestone 3: partially complete — restart, concurrent `SKIP LOCKED` claims, expiry and unknown-outcome non-replay are covered on PostgreSQL; explicit lease-expiry and ACK-during-recovery cases remain to be added.
- Milestone 4: partially complete — fake-SQS + real repository covers commit-before-delete, delete failure/redelivery, visibility extension, graceful shutdown, retry and permanent rejection; feature-off and controlled-restart coverage remain to be added.
- Milestone 5: completed — Jest targeted regression is 79/79, the PostgreSQL integration suite is 24/24, Python Edge tests are 16/16, and the TypeScript build passes.
- Tests failed: none in the final local run.
- Fixture cleanup: integration suite `afterAll` completed; no database-wide reset or truncate was used.
- Next action: add the explicitly listed remaining integration cases, then re-run the final local regression; do not run migrations against a non-local database without the missing migration-history evidence.
