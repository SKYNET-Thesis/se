<!-- Draft body for the `develop` → `main` release PR. Open it as a DRAFT only after the closure documentation PR is merged. Do not merge without owner approval. Merging to main triggers the deploy jobs when AWS_DEPLOY_ENABLED is true. -->
# Release: VISTA RC (`develop` @ <SHA after docs PR>)

Contents: PRs #212–#219 and the closure documentation. See `docs/release/RELEASE_NOTES.md`, `FINAL_SYSTEM_ACCEPTANCE_REPORT.md`, `REPORT_5_TESTING_EVIDENCE.md`.

- Database migration: **none**. Schema gate expected to pass without a database release.
- Production MQTT / IoT / Terraform / secrets: **unchanged**.
- Desktop download: stays *unavailable* until the Desktop release is published and verified.
- Acceptance: local integrated pass (PASS), real-GoTrue local suites (PASS), CI green on PR #219; AWS, Desktop E2E, physical: not run/blocked.

## Required before merge (owner)
- [ ] Required checks green on this PR.
- [ ] Owner confirms Production deployment window and approves the merge.
- [ ] Rollback target recorded: previous API image SHA and previous web bundle (`RELEASE_CANDIDATE_CHECKLIST.md` §C).

## After merge (read-only smoke first)
- [ ] `/api/v1/health` and `/health/ready` OK; web `version.json` matches the commit.
- [ ] `GET /api/v1/me/attempts/<uuid>/quiz-result` without a token → 401.
- [ ] Public site and sign-in load; Homepage Desktop section shows *Download unavailable* (or the verified link if the release was published and verified first).
- [ ] One test student in a **test** classroom: quiz result dashboard renders.
