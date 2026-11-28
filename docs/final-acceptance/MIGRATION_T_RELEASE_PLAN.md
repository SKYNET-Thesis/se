# Migration T — review and release plan (owner approval required; nothing executed)

**What:** `database/staged-migrations/20261128_t_rubric_level_descriptors.sql` (PR #267 content, carried by draft PR #272) adds two **nullable** columns: `learning_rubric_criteria.descriptors jsonb` (exactly four strings) and `learning_assessment_scores.level smallint` (0..4), each with a CHECK. No data is rewritten. Weight is not stored (`w = max_points / 4`).

**Compatibility (verified locally):** applied twice (idempotent), row counts unchanged, legacy rows keep `NULL`; direct-point rubrics, historical grades and quiz results are unaffected; an API that does not know the columns ignores them (explicit column lists), so T may be applied before OR after the API that uses it. The only API that *requires* T is the code in #272 (reads `descriptors`/`level`).

**Verification:** `scripts/verify_staged_migration_t.sh` (idempotent, additive, constraints enforced, clean rollback); Jest real-DB level spec; Playwright `rubric-levels-flow` (template → descriptors → partial draft → release refused → complete 31/36 → student + Gradebook agree).

**Release sequence (owner-approved steps only):**
1. Release PR #266 (develop → main) does **not** contain #272 or T. Deploy it first (`deploy-api`, `deploy-web`), Terraform IAM apply, Production acceptance of WF01–04 as planned.
2. After acceptance, promote T: move the SQL into `database/migrations/`, next manifest `order`, SHA-256, two-commit procedure (`database/staged-migrations/README.md`), regenerate `dev-schema-expectation.json`.
3. Production Database Release workflow: preflight → verified backup → apply → postflight (approval-gated; the only migration path).
4. Merge #272 (then CI has T), release again via the normal pipeline. `schema-gate` must pass; the rollback-guard continues to forbid redeploying images older than S.
**Rollback:** drop the two CHECKs and columns (SQL header). Loses only descriptors and recorded levels; points and totals stay valid. Roll back the API first (previous image) — note rollback-guard forbids pre-S images, not T-era images.
**Risk:** low (additive/nullable). **Open owner approvals:** exact migration text, release order above, template weights (defaults, configurable).
