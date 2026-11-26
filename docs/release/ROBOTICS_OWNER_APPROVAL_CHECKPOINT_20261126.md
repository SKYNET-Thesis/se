# Robotics commissioning — FINAL owner approval checkpoint (updated 2026-11-27 eve)

Production serves `ebf344f` (main = develop tree; #225–#233 deployed). Nothing below is executed; every item needs your explicit approval. Dataset ids are in `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` §10.

## 1. What changed since the last checkpoint (findings)
| Finding | Evidence | Consequence |
|---|---|---|
| **No physical start path existed**: `start()` accepted only `fake_follower` | `physical-execution.service.ts` | PR **#234** adds `VISTA_IOT_START_MODE=physical_commissioning` (off by default, see §5) |
| **The Robot Lab start step is unreachable in Production**: the physical steps are generated only for Module 5 lessons without database sections (seeded curriculum); a Course-Builder Module 5 never shows them (`-physical` URL falls back to the first reading). The SO-101 seed is guarded to a local database and Production has no SO-101 course | `lessonActivities.ts`; Production DB; direct URL test | PR **#235** (small web defect fix; web scope was frozen, so it needs your explicit OK) |
| Course with learner delivery cannot get new modules | HTTP 409 on add module | The Advanced course already has 5 modules (module 5 has a section); with #235 the physical steps are appended to it |
| **Edge telemetry did not reach the Web Twin** (no rule/worker consumed MQTT `telemetry`; the Twin ingests over private HTTP only) | `iot-feedback.service.ts`, `app.py`, IoT rule SQL | **Closed in code** by the telemetry bridge PR (status-embedded frames relayed by the feedback worker, no infra change); activation flag `VISTA_IOT_TELEMETRY_BRIDGE_ENABLED=true`; limit: relayed frames render as stale in the viewer (Twin window 0.5 s), physical telemetry is not relayed |
| Secrets Manager is read **only at deploy time** | `deploy-api.sh` lines 27–69 | editing the secret does not reload anything; a redeploy is required (§6) |
| Students get the Blockly control mode only via a per-membership safety profile (role default is `student-sandbox`, manual only) | role/profile query | Student 1 needs `student-blockly-demo` (§3, also a per-student boundary) |
| Dataset ready | R1126-1901: 5-module Advanced course, classroom `9c09e27d…` with Student 1 + instructor, module-4 Blockly assignment published, Student 1 passed the symbolic evaluation; eligibility API now answers `ROBOT_NOT_ALLOCATED` with `symbolicPassed:true` | only robot entitlement/allocation and the Edge are missing |

## 2. Release (one more release, no migration, no Terraform)
#234, #235 and #236 are merged. Merge the telemetry bridge PR (after CI), then the single final `develop`→`main` release containing all of them, with the usual `develop`→`main` release and the two `aws-demo` approvals. Verify afterwards: version SHA, health/ready, and with the flags still unset a student start is still refused.

## 3. Database changes (operator script; dry-runs refreshed against the deployed revision; `--confirm` NOT run)
| # | Exact change | Dry-run result |
|---|---|---|
| a | **Create** one `org_entitlements` row: org `597cd591-ba63-4a27-af5d-12fede921fad`, `resource_type='robot'`, robot `f1c066c4-b5f2-45c4-b933-f034f3824dd9`, `valid_from=now()`, `valid_to=NULL` | `entitlement: create`, `willRegister:false`, 2 existing allocations untouched |
| b | **Isolate**: set `valid_to=now()` on VISTA Academy's entitlement `e5739cc3-1572-4e8e-9bd1-cadab9735137` (flag `--isolate-others`); allocations `6fdd856a…` and `8052674c…` untouched | lists exactly that one row |
| c | **Student**: set membership `2f9b67ce-b1dc-4d47-a0ed-7691e075d772` (Student 1) `safety_profile_id` = existing `student-blockly-demo` (previous value NULL) (needs PR #234's script) | `blocklyStudent` as shown; Students 2–5 keep `student-sandbox` and cannot start anything |
No new robot row, no deletes, nothing else changes. Pending commands: `iot_command_lifecycles` has 0 rows; no running experiments (checked). Alternative command entry points: the only start route is `POST /me/attempts/:id/physical-executions/start` guarded as above; the Twin and recordings routes issue no commands.
Commands: `npm run provision:robot-entitlement -- --organization 597cd591-… --robot f1c066c4-… [--isolate-others] [--confirm]` and `… --organization 597cd591-… --blockly-student f9eb7496-… [--confirm]`.
**Restore (all reversible):** `… --restore e5739cc3-1572-4e8e-9bd1-cadab9735137 --confirm` (clears `valid_to`; SQL equivalent `UPDATE org_entitlements SET valid_to=NULL WHERE id='e5739cc3-…'`); end the new entitlement with `valid_to=now()`; `… --clear-blockly-student f9eb7496-… --confirm`.
After approval I then verify through the real UI: School Admin sees the robot and allocates it to "VISTA Advanced Simulation Class"; the instructor sees it; Student 1 reaches the Physical Experiment step (needs #235 deployed); org B and VISTA Academy students are refused (`ROBOT_ENTITLEMENT_INVALID`/not found). I will report any allocation conflict exactly and not bypass it.

## 4. Certificate (you, on the Edge machine; commands in `ROBOTICS_ACTIVATION_PLAN_20261126.md` §3)
Create inactive → attach Thing and `…-policy` → activate; key never leaves the machine. Policy verified scoped (own client id, own topics, own shadow). Rollback: deactivate, detach, delete.

## 5. Production configuration — simulation first (secret `vista/demo/education-api/env`)
| Key | Change | When |
|---|---|---|
| `VISTA_IOT_ENABLED` | `false`→`true` | only after §6 gates |
| `VISTA_IOT_START_MODE` | `simulation` | same time |
| `VISTA_IOT_THING_PREFIX` | `vista-demo` | same time |
| `VISTA_IOT_TELEMETRY_BRIDGE_ENABLED` | `true` (optional; simulation frames only) | same time; needs the telemetry PR deployed |
**Physical commissioning (tomorrow, separate approval, requires #234 deployed):** `VISTA_IOT_START_MODE=physical_commissioning` plus `VISTA_PHYSICAL_COMMISSIONING_ROBOT_ID=f1c066c4-b5f2-45c4-b933-f034f3824dd9`, `VISTA_PHYSICAL_COMMISSIONING_USER_IDS=f9eb7496-9369-449f-9b9f-9368122fa410`, `VISTA_PHYSICAL_COMMISSIONING_UNTIL=<ISO end of the supervised session>`, `VISTA_PHYSICAL_RUNTIME_MODES=<the Edge adapterMode, e.g. so101_follower>`. Without every key, or after the window, a physical start is refused; the Edge must also report `hardwareEnabled`, `armed`, `calibrationReady`, no fault, fresh heartbeat. Simulation ≠ physical: switching modes is a config change + redeploy.

## 6. Reload procedure (verified from `deploy-api.sh` and the workflow)
1. Write a new secret version: `CUR=$(aws secretsmanager get-secret-value --secret-id vista/demo/education-api/env --query SecretString --output text); NEW=$(printf %s "$CUR" | jq -c '. + {VISTA_IOT_ENABLED:"true",VISTA_IOT_START_MODE:"simulation",VISTA_IOT_THING_PREFIX:"vista-demo"}'); aws secretsmanager put-secret-value --secret-id vista/demo/education-api/env --secret-string "$NEW"` (values never printed; previous version stays `AWSPREVIOUS`).
2. **Reload = redeploy**: the host script reads the secret only when it runs, rewrites `/opt/vista/api.env` and recreates the containers (API, both workers, Twin). Run the workflow **Education CI → Run workflow on `main`, action `deploy`** for the current head (images exist, so it reuses them), with the `aws-demo` approval. A Secrets Manager edit alone does nothing to running containers.
3. Verify: `docker exec vista-education-api printenv` for the three flags (SSM, read-only), `/health/ready`, workers running, queues empty.
**Activation gates (all required before step 1):** release with #229 (deployed ✔) and #234/#235 deployed as needed; entitlement + isolation + student profile verified; Edge certificate and policy ready; Edge heartbeat verified (Codex, not yet implemented); hardware disabled/disconnected; API and workers healthy; rollback ready.
**Rollback:** `put-secret-value` with `VISTA_IOT_ENABLED=false` and the start-mode keys removed (or move `AWSCURRENT` back to `AWSPREVIOUS`: `aws secretsmanager update-secret-version-stage … --move-to-version-id <previous>`), redeploy the same way (or `action=rollback`); Edge: stop, deactivate certificate; DB: the three restores above.

## 7. Codex (see handoff §11)
Shadow heartbeat ≤10 s; `stopped` semantics; additive `adapterMode`, `armed`, `calibrationReady`, `fault`; local-only arming reset on reconnect; optional telemetry-in-status frame if you approve; Desktop sign-in and recording upload for the hardware phase.

## 8. Decisions for you
Approve/decline: #234 and #235 merges (web fix needs your OK); the three DB changes; the telemetry design (status-embedded frames, code only) or accept that the Web viewer shows no Edge telemetry tomorrow; the secret change and redeploys; the physical-commissioning configuration for tomorrow's session (separately, at the time).


## 9. FINAL ACTIVATION SEQUENCE (supersedes the order above where they differ)
Each step needs your explicit approval; none was executed.
1. **Final Production deployment** (one release: #234, #235, #236, #237 and the physical-twin PR). Because `deploy-api.sh` changed (Twin settings pass-through), first the owner-approved host-script refresh: `infra/terraform/scripts/refresh-host-deploy-script.sh --execute`, then the gated deploy (the deploy refuses a stale host script by design). Rollback: `action=rollback`; the previous host script stays in the host snapshot/`refresh` script history.
2. **WF01 entitlement provisioning** (§3a) and 3. **temporary VISTA Academy isolation** (§3b) and 4. **Student 1 Blockly profile** (§3c), then UI verification of WF01.
5. **Codex Edge implementation**: heartbeat ≤10 s, additive shadow fields, `armed` handling, simulation frames and `physical_telemetry` messages, single-follower mapping (handoff §11).
6. **Device certificate** created on the Edge machine and attached (§4).
7. **Shadow heartbeat verification** (read-only AWS `get-thing-shadow`: `connection`, `reportedAtMs` advancing ≤10 s, `hardwareEnabled=false`).
8. **MQTT simulation activation**: secret keys `VISTA_IOT_ENABLED=true`, `VISTA_IOT_START_MODE=simulation`, `VISTA_IOT_THING_PREFIX=vista-demo`, optional `VISTA_IOT_TELEMETRY_BRIDGE_ENABLED=true`, plus Twin settings `VISTA_TWIN_RELAY_STALE_AFTER_SECONDS=3.0`, `VISTA_TWIN_MAX_MEASUREMENT_AGE_SECONDS=5.0`; redeploy to reload (§6).
9. **Cloud simulation acceptance** on the R1126-1901 dataset (hardware disabled): WF01 allocation → student start → ack/status → SQS → worker → experiment completes → simulation telemetry in the Web viewer (labelled delayed, with measured transport delay) → evidence → instructor review. Record the measured `transport_delay_ms`; adjust the two freshness settings only from that measurement.
10. **Separate supervised physical commissioning** (tomorrow): second secret change to `VISTA_IOT_START_MODE=physical_commissioning` with `VISTA_PHYSICAL_COMMISSIONING_ROBOT_ID/USER_IDS/UNTIL`, `VISTA_PHYSICAL_RUNTIME_MODES=<adapterMode>`, `VISTA_IOT_PHYSICAL_TELEMETRY_BRIDGE_ENABLED=true`, and the Twin hardware-owner keys `VISTA_TWIN_PHYSICAL_OWNER_ID` (also in the API secret), `VISTA_TWIN_PHYSICAL_ORGANIZATION_ID=597cd591-ba63-4a27-af5d-12fede921fad`, `VISTA_TWIN_PHYSICAL_ROBOT_ID=f1c066c4-b5f2-45c4-b933-f034f3824dd9`; redeploy; then the runbook `PHYSICAL_COMMISSIONING_RUNBOOK_20261127.md`. **Single follower arm only**; dual-arm cloud acceptance is not supported.
**Rollback for 8–10:** remove the keys (or move `AWSCURRENT` back to `AWSPREVIOUS`) and redeploy; Twin settings removal disables the physical route; deactivate the certificate; restore entitlements/profile per §3.
