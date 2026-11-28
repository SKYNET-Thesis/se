# Production database release — scope T-U (rubric level descriptors + staff first-login password state)

**Status: PROPOSED, NOT APPROVED. Nothing has been applied anywhere except disposable local databases.**

| Item | Value |
|---|---|
| Migrations | `20261128_t_rubric_level_descriptors`, `20261128_u_staff_password_change_required` (both additive, idempotent, transactional-body only) |
| Requires applied | D-L, N, O-Q and S (the scope lists them explicitly) |
| Catalog delta | none: no table, policy, trigger or function (pinned equal before/after) |
| Data effect | none: no backfill, no row rewritten, nobody restricted; digests of existing rows are verified unchanged |
| Verifier | `scripts/verify_production_release_tu.py` (preview, snapshot, verify) |
| Workflow | Production Database Release, `scope = T-U` (approval-gated, verified backup first) |

## Compatibility (verified by tests, see `tests/database/test_tu_verifier_postgres.py` and `test_tu_compatibility.py`)
* **API before the migration:** the previous API never names the new columns (explicit column lists, INSERTs do not list them), so it runs unchanged on the new schema. The new API with `STAFF_TEMP_PASSWORD_ENABLED` unset never reads or writes the U columns.
* **API after the migration:** reads `descriptors` / `level` only for assignments that carry them; legacy criteria and scores keep `NULL` and behave exactly as before.
* **Order:** either; the documented order is *deploy API → apply T-U → verify → enable `STAFF_TEMP_PASSWORD_ENABLED`*.

## Rollback
Run only if the features are abandoned (loses descriptors, recorded levels and pending first-login state; points, totals and credentials stay valid): see the `Rollback` block in each SQL header. The runner never executes it automatically. Disable `STAFF_TEMP_PASSWORD_ENABLED` first **only if no staff account is still pending its first password change**.
