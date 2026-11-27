# Production database release — scope S (Classroom Lab Session)

Status: **PROPOSED, NOT APPROVED. Nothing here has been applied to Production.** Prepared 2026-11-27 (promotion PR; the SQL is `database/migrations/20261127_s_classroom_lab_sessions.sql`, sha256 pinned in `database/migrations/manifest.json` and `database/release-scopes.json`).

## What it changes (additive, one relaxation, no data rewritten)
New table `classroom_lab_sessions` (RLS, one backend policy, runtime role SELECT/INSERT/UPDATE, no DELETE) with a partial UNIQUE index (one open reservation per robot) and two lookup indexes; `learning_classroom_robot_allocations` UNIQUE(classroom_id) → UNIQUE(classroom_id, robot_id); permission `education.lab_session.manage` granted to `instructor`. Catalog delta: +1 table, +1 RLS table, +1 policy.

## Mandatory ordering (the reason the PR must wait)
1. The Lab-Session-aware API (PR #243 and #244, built into the `develop`→`main` release) is deployed **first**; it works on the old schema (Lab Session endpoints answer 503 until S).
2. **Only then** merge this promotion PR into `develop`/`main`. Once S is in the manifest, the schema gate (`production_db_release.py compat`) refuses every deployment until S is in the Production ledger — intended, fail-closed. Merging it earlier would block the API release itself.
3. Run *Production Database Release* with scope `S` (plan → backup check → snapshot → reviewer approval → apply → postflight `verify_production_release_s.py`, 60 checks). The release workflow then resumes the pending deployment.
4. Hold the `deploy-web` approval until S is verified, then approve it and run the Production Lab Session acceptance.

## After S
Never redeploy a pre-Lab-Session image (`f0b3d87` and older). Education CI now has a read-only `rollback-guard` job that refuses a rollback dispatch once `classroom_lab_sessions` exists (`production_db_release.py rollback-guard`). Recovery is forward-only; the SQL rollback in the migration header is refused by PostgreSQL while any classroom holds two robots (tested), and allocations or Lab Session history are never deleted to restore the old constraint.

## Evidence (disposable PostgreSQL 17)
Fresh bootstrap with S through the migration runner (`schema fingerprint f3a0f948…`); postflight verifier 60/60 and 5 mutation tests (dropped index, old constraint back, extra runtime privilege, PUBLIC grant, no writes); K–L, N, O–Q verifiers still pass on a database that carries S (later released scopes' pinned deltas are accounted for); 374 database-safety tests pass (DB-backed ones run in CI).
