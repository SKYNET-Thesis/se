# Experiment events BigInt serialization fix

## Root cause

`ExperimentController.events()` delegates directly to `ExperimentService.events()`. That query returned `learning_experiment_events.id` without conversion. The PostgreSQL identity primary key is Prisma `BigInt`, so Prisma returns a JavaScript `bigint`; Express `res.json()` cannot serialize it and returned HTTP 500. `event_index` is a PostgreSQL `integer` and was not the failing field.

## Change and response compatibility

The events query now selects `id::text AS id`. The existing response array and row keys (`id`, `event_index`, `event_type`, `event_data`, `occurred_at`), ordering, and ownership check are preserved. `id` is returned as an exact base-10 decimal string; this avoids precision loss for values above `Number.MAX_SAFE_INTEGER`. `event_index` remains numeric. Client code should treat the ID as opaque. Desktop currently reads the event array/count and does not do numeric operations on IDs.

No schema migration or data rewrite is required.

## Regression coverage

- `experiment.service.spec.ts` asserts a precision-safe string projection, JSON serializability, and unchanged numeric `event_index`.
- `experiment-run.db.spec.ts` persists a real event using an ID above `Number.MAX_SAFE_INTEGER`, verifies exact decimal round-trip through JSON serialization, and verifies same-tenant and cross-tenant learners receive `NotFoundException` for another student's event stream.
- The integration test uses the existing isolated PostgreSQL test target guard.

## Verification

- `npm test -- --runTestsByPath src/modules/learning/experiment.service.spec.ts`: **18 passed**.
- Isolated real PostgreSQL `experiment-run.db.spec.ts`: **7 passed**, including the new persisted-event regression.
- `npm run build`: **passed**.
- Desktop full E2E rerun after this change: **not run**. The Desktop runner's strict 3 GiB preflight remained unsatisfied; a bounded wait at a 3.5 GiB threshold timed out without starting containers. The preceding Desktop run proved the API event route's exact serialization failure. Backend-level PostgreSQL/service regression passes now cover that failure path; re-run Desktop `scripts/run-isolated-lms-e2e.sh` when at least 3 GiB is available to confirm the complete cross-repository workflow.

Changes are uncommitted and intended for a separate follow-up PR to `main`, independent of PR #179. No Production, AWS, migration, Desktop repository, or shared Supabase changes were made.
