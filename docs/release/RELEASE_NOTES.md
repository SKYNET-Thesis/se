# VISTA release notes — release candidate `7ac0d58` (2026-11-26)

Scope: `develop` after PRs #212–#219. **No database migration.** Not deployed to Production; Production runs an older revision. Production MQTT remains off.

## New
- **Question Bank import** (Excel/CSV): official template, per-row validation and mapping (course, lesson, section, objective), difficulty default points 1/2/3 with overrides, true/false questions, duplicate detection, row-level error report (CSV), preview then explicit confirmation bound to the previewed file (SHA-256), imports as drafts by default, idempotent re-import. Guide: `docs/education/QUESTION_BANK_IMPORT_GUIDE.md`.
- **Quiz result dashboard**: weighted score, PASS/FAIL, performance rating, per-type/difficulty/topic/objective analytics, deterministic review recommendations with **Review Lesson** links, "Insufficient Evidence" states. Read-only endpoint `GET /me/attempts/:attemptId/quiz-result` (owner only). Grading rules unchanged.
- **Pilot curriculum**: normalized import files for 3 courses / 18 lessons / 180 questions and an English demo course (explanations are generated drafts, `PENDING_REVIEW`).
- **Homepage Desktop download**: Ubuntu amd64 `.deb` card; Windows/macOS Coming Soon; no AppImage. #217 shipped it as *Download unavailable*; PR #221 enables the verified download of Desktop v0.1.0 (131,395,882 bytes, SHA-256 `a5dbca4d…a8e4`, `vista-lab-station` 0.1.0 amd64, verified anonymously on 2026-11-26) with terminal install, checksum and launch commands.
- Documentation: user guide (Report 6), testing evidence (Report 5), acceptance report, demo runbook, RC checklist, AWS E2E approval request.

## Fixed
- `GET /me/experiments/:id/events` returned 500 for large event ids (BigInt serialization) — #212.
- Import commit now authorizes the caller **before** validating the request (an unauthorized student previously received a validation error) — #219.
- Explicit-code re-import reports "already imported" instead of "invalid" — #215.

## Compatibility
No schema change; the API and web can be rolled back independently to the previous image/bundle. New route is additive. The import API now requires `confirm` and `expectedSha256` on commit (the web client sends them); other API clients of the import endpoint must be updated.

## Known limitations
Simulation/mock runtime only (no physical or AWS acceptance); no AI inference or AI assessment; Desktop v0.1.0 is published (GitHub flags it pre-release) but the Desktop↔Web end-to-end test was not run; Vietnamese pilot explanations are source echo; no dark mode; student temporary password login is disabled by default and unreleased; see `FINAL_SYSTEM_ACCEPTANCE_REPORT.md` §6–7.
