# IoT readiness for 2026-11-28 (read-only inventory, 2026-11-27)

Private keys and certificate bodies are never recorded. Inventory taken with read-only `aws iot` / `aws sqs` calls. **No resource was created or changed.**

## 1. AWS IoT inventory
| Item | Value |
|---|---|
| Account / region | `157098813811` / `ap-southeast-1` |
| Data endpoint (ATS, 8883, mTLS) | `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com` |
| Thing | `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` (attrs: environment=demo, robot_model=SO-101, robot_id) |
| MQTT client id | same as Thing name (the only id the policy allows) |
| Robot id | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` (`VISTA-WF01-DEMO-ROBOT-01`) |
| Certificate | id `17bac724…` **ACTIVE**, created 2026-11-27 10:12 +07, attached to the Thing |
| Policy | `vista-demo-f1c066c4-…-policy` (Connect own client id; Publish `…/telemetry,status,ack`; Subscribe/Receive `…/commands`; classic Shadow get/update for this Thing only) |
| Topic prefix | `vista/demo/robots/f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| Rule | `vista_demo_f1c066c4_…_feedback`, enabled; `SELECT *, topic() as iotTopic … WHERE (topic(5)='ack' OR 'status') AND isUndefined(commandId)=false` → SQS feedback queue |
| Queues | `…-feedback`, `…-feedback-dlq`, `…-recordings-events`, `…-recordings-dlq` (all 0 messages) |
| Workers | `iot-feedback-worker`, `recordings-worker` healthy on EC2 `i-0fa8cb318ce21afa5` (image `43dcb60`) |
| Twin relay | `digital-twin` `{"status":"ok","mode":"mock"}`; telemetry accepted 202 |
| Edge certificate files | `~/vista-edge-certs/` on the Edge machine only (dir 0700, key 0600) |
| Production flags | `VISTA_IOT_ENABLED=true`, `START_MODE=simulation`, telemetry bridge on, physical telemetry/commissioning **unset** |
| Shadow (today) | connected, `MOCK_RUNTIME`, `hardwareEnabled=false`, `adapterMode=fake_follower`, age ≈2 s |

## 2. Runtime and contract handoff
Canonical contract: `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` (P1–P4 priorities and §14 cancel/safe-stop contract are **unchanged**). Implemented on the backend: command lifecycle, `cancel`, feedback worker, correlated simulation/physical telemetry bridges, freshness gate, safe-stop confirmation. Known gap: R1 `_preflight` rejects every `adapterMode` except `fake_follower`; the physical adapter `so101_follower` is a Codex task. Known defect D-04 (late ACK dropped as stale) to be handled alongside.

## 3. Desktop integration handoff for Codex (no compatibility claimed)
Desktop repo `leduc121/vista_lab` is Codex-owned and was not modified. Compatibility of the Desktop runtime with this contract is **unverified**. Required of Desktop: connect with the identity above using the cert files; subscribe `…/commands`; honour `cancel`; publish `ack`/`status`/`telemetry` with `commandId`; refresh Shadow ≤10 s; `armed=false` after every connect; ≤2 Hz telemetry, ≤120 frames/run.

## 4. Safe runtime handover R1 → Desktop
1. Owner stops R1 and CHECKIK adapter (pids in the Edge `/tmp` dir, or `ps`). 2. Verify Shadow goes stale (>15 s) — this proves no second client with the same identity. 3. Start the Desktop runtime with the same cert/client id. 4. Verify Shadow `connected` and `adapterMode` reported by Desktop. 5. **Never run both**: AWS IoT disconnects the older client on a duplicate client id, causing flapping. 6. Rollback = stop Desktop, restart R1 from `se` branch with `config/runtime.cloud-simulation.json`.

## 5. Physical SO-101 commissioning checklist (one leader/follower pair, owner present)
1. Power off; inspect cabling and E-stop access. 2. Calibrate with `checkIk` audit tools (Desktop repo). 3. Dry run with torque disabled. 4. Edge starts with `hardwareEnabled=false`; verify Shadow. 5. Operator arms **locally**; Shadow `armed=true`. 6. Owner approves enabling commissioning flag in Production (not done). 7. First motion: `arm.select`, `home` only, low speed. 8. Add `gripper.open/close`. 9. Verify Stop Execution and Emergency Stop physically before any student run. 10. Disarm and power down. Abort on any unexpected motion.

## 6. IoT test matrix
| Test | Status |
|---|---|
| Cert ACTIVE, policy attached, rule enabled, queues empty | PASS (read-only) |
| Edge connect + Shadow freshness | PASS |
| Simulated run correlation (status/telemetry) | PASS; ACK ordering D-04 open |
| Reconnect after reboot | PASS (observed) |
| Desktop runtime connect | NOT RUN |
| Physical adapter, calibration, arm, motion, recording | NOT RUN |
| Stop Execution / Emergency Stop on hardware | NOT RUN |
