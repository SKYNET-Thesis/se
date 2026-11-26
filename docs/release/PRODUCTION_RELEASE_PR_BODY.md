<!-- Draft body for the `develop` → `main` release PR. Open it as a DRAFT only after the closure documentation PR is merged. Do not merge without owner approval. Merging to main triggers the deploy jobs when AWS_DEPLOY_ENABLED is true. -->
# Release: VISTA RC (`develop` @ <SHA after docs PR>)

Contents: PRs #212–#219 and the closure documentation. See `docs/release/RELEASE_NOTES.md`, `FINAL_SYSTEM_ACCEPTANCE_REPORT.md`, `REPORT_5_TESTING_EVIDENCE.md`.

- Database migration: **none**. Schema gate expected to pass without a database release.
- Production MQTT / IoT / Terraform / secrets: **unchanged**.
- Desktop download: v0.1.0 published and verified (HTTP 200, 131,395,882 bytes, SHA-256 `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`); enabled by PR #221, which must be merged into `develop` first.
- Acceptance: local integrated pass (PASS), real-GoTrue local suites (PASS), CI green on PR #219; AWS, Desktop E2E, physical: not run/blocked.

## Deployment gates (see `PRODUCTION_RELEASE_GATE.md`)
- Merging to `main` runs Education CI, then Auto Deploy dispatches the gated path: `schema-gate` → `deploy-api`/`deploy-web` behind the reviewer-gated `aws-demo` environment. Nothing deploys without that approval.
- The deploy fails closed before replacing anything if the EC2 host script differs from `deploy-api.sh`; run the owner-approved `refresh-host-deploy-script.sh --execute` first if needed.
- Production currently serves `ef95cdd`; `main` is `745c7ac` (its deploy was cancelled).

## Required before merge (owner)
- [ ] Required checks green on this PR.
- [ ] Owner confirms Production deployment window and approves the merge.
- [ ] Rollback target recorded: previous API image SHA and previous web bundle (`RELEASE_CANDIDATE_CHECKLIST.md` §C).

## After merge (read-only smoke first)
- [ ] `/api/v1/health` and `/health/ready` OK; web `version.json` matches the commit.
- [ ] `GET /api/v1/me/attempts/<uuid>/quiz-result` without a token → 401.
- [ ] Public site and sign-in load; Homepage Desktop section shows an active **Download DEB** link (v0.1.0, 125.3 MiB).
- [ ] One test student in a **test** classroom: quiz result dashboard renders.
