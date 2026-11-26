# VISTA — release candidate checklist, deployment and rollback

Nothing below is executed without explicit owner approval. This is a plan, not a record of deployment. Production currently runs a release older than these PRs.

## A. Gates before a Production release

- [ ] #212, #213, #214, #215, #216, #217 merged by the owner (in that order); required checks green on each.
- [ ] Integrated acceptance on the merged `develop` revision (`FINAL_SYSTEM_ACCEPTANCE_REPORT.md` §2–4), run sequentially.
- [ ] `develop` → `main` release PR; required checks green; owner approval.
- [ ] No migration is part of these PRs (verified: no `database/` change). If a later PR adds one it follows `docs/operations/production-migration-ownership.md` and the SQL-runner gate — never `db push`.
- [ ] Desktop download remains disabled unless the Desktop release is published **and** verified (anonymous download, filename, size, SHA256SUMS, package version, architecture).

## B. Deployment plan (existing single-EC2 architecture, no new resources)

1. Owner merges the release PR to `main`; the existing CD workflow builds the API image and web bundle (deploy jobs run only on `main`).
2. API: shared image SHA deployed through the reviewed host wrapper (`infra/terraform/scripts/deploy-api.sh`) via SSM; `/api/v1/health` and `/health/ready` verified; the new route `GET /api/v1/me/attempts/:id/quiz-result` answers 401 without a token.
3. Web: static bundle to S3 + CloudFront invalidation; `version.json` matches the commit.
4. Smoke (read-only first): public site, sign-in, student quiz result for a test student in a **test** classroom.
5. Production MQTT stays **off** (`VISTA_IOT_ENABLED` unset); no certificates, no Terraform.

## C. Rollback

- API: redeploy the previous shared image SHA (the host wrapper keeps the prior image); no data migration to reverse (none applied).
- Web: redeploy the previous bundle and invalidate CloudFront.
- Data: question imports create draft rows only; they are removable by archiving the drafts through the existing authoring UI. The quiz-result route is read-only.

## D. Checklist status (2026-11-26)

| Item | Status |
|---|---|
| Required CI on #215/#216/#217 | in progress — see PR pages |
| Integrated acceptance | NOT RUN (needs merges) |
| Production deploy / migrations / MQTT / AWS / certificates | NOT APPROVED, NOT DONE |
| Desktop Release | Draft — owner action |
| Report 5 acceptance evidence | inputs: `WEB_ACCEPTANCE_MATRIX_2026-11-26.md`, `WF03_ACCEPTANCE_REPORT.md`, `QUIZ_RESULT_DASHBOARD.md`, `PILOT_IMPORT_ACCEPTANCE.md`, `WF04_REQUIREMENT_CHECK.md` |
| Report 6 user guide updates | inputs: `docs/education/QUESTION_BANK_IMPORT_GUIDE.md` (instructor import); student quiz-result reading guide = runbook step 4; Desktop install steps = Homepage Installation Guide tab |
