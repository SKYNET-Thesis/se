# IoT / Robotics handoff — Claude Code and Codex workstreams (2026-11-28)

Companion to `IOT_READINESS_20261128.md` (AWS inventory, handover, commissioning) and the canonical `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` (P1–P4, §12–§14). Nothing here was executed tonight: no AWS change, no physical motion, no Desktop edit.

## 1. Ownership and conflict rules
| Area | Owner | Shared contract / file (change only by agreement + owner approval) |
|---|---|---|
| Education API, Web, AWS IoT/SQS/IAM (Terraform), Twin service, backend contracts | **Claude Code** (`SKYNET-Thesis/se`) | `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md`, `services/robot-runtime` message schemas, `services/education-api/src/modules/learning/{iot-*,physical-execution*}.ts` |
| Desktop Lab Station, Edge runtime, physical adapter, calibration, teleop, recording | **Codex** (`leduc121/vista_lab`, local `vistadesktop/vista-lab-station`) | same Edge Contract (read-only for Codex; changes via a proposal in the contract doc, approved by the owner) |
| R1 (`services/robot-runtime`) | Claude Code until the Desktop runtime replaces it; Codex may read it as the reference implementation | `iot.py`, `runtime.py _preflight` |
Rules: one writer per file; contract changes are made first in the contract doc, then in code; never edit the other agent's repository; preserve Codex's uncommitted Desktop work.

## 2. Hard rule — device identity
R1 and Desktop must **never** connect at the same time with the same MQTT client id (`vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9`). AWS IoT disconnects the older client, causing flapping and ambiguous Shadow data. Handover (owner-executed): (1) stop R1 + CHECKIK adapter; (2) confirm Shadow goes stale; (3) start Desktop runtime; (4) confirm Shadow `connected`, `adapterMode` from Desktop, `hardwareEnabled=false`, `armed=false`; (5) send one harmless simulated command and verify ack/status/telemetry; rollback = stop Desktop, restart R1 with `config/runtime.cloud-simulation.json`.

## 3. Claude Code workstream (backend / AWS)
| ID | Task | Existing location | Depends on | Acceptance | Test | Approval |
|---|---|---|---|---|---|---|
| CC-1 | Land the evidence + Twin fixes in Production (#260 IAM, #262 D-09) and retest WF03/WF04 evidence | PRs #260/#262 | owner merge, deploy, Terraform apply | artifact created, retrievable by student/instructor, 403 for others; viewer shows run frames (`robot_id` = robot UUID, matching sequence) | WF03 live + pytest/jest | merge, deploy, `terraform apply` |
| CC-2 | Accept late ACK without regressing state (D-04) | `iot-feedback` worker sequence check | none | `iot_ack_acknowledged` recorded exactly once whatever the SQS order; state never moves backwards | unit + replay of reordered messages | merge |
| CC-3 | MQTT lifecycle review: command expiry, `cancel`, duplicate commandId, offline Edge | `iot-command`, `physical-execution.service.ts`, EDGE §14 | CC-1 | each case ends in a defined terminal state; quarantine until the Edge confirms stop | DB specs + live with long fixture | none |
| CC-4 | Long-running controlled simulation fixture (≥10 s) to execute Stop, concurrent control, expiry, quarantine, disconnect on Production | `web/checkIk/wf03_command_adapter.py` (config only, **no Production timing change**) | CC-1 | cases flip from NOT RUN to PASS/FAIL | live | owner approval to run |
| CC-5 | Physical telemetry bridge enablement (`physical_telemetry`, ≤2 Hz, ≤120 frames) | `iot-telemetry.bridge.ts` | Codex CX-3, owner enabling flag | frames classified `LIVE_PHYSICAL`, never `SIMULATION`/`MOCK_RUNTIME` | contract tests | **owner approval for Production flag** |
| CC-6 | Device authorization review (policy per Thing, no wildcard), second Thing for Desktop only if the owner requests | Terraform `infra/terraform/iot` | owner | no new resource without approval | `terraform plan` | **owner approval** |
| CC-7 | Safety acceptance: arm only by local action, `edgeStopUnconfirmed`, Emergency Stop path | `lab-session.service.ts` | Codex CX-5 | API refuses start unless Shadow `armed=true` & fresh | DB specs + supervised live | owner on site |

## 4. Codex workstream (Desktop / Edge)
| ID | Task | Reuse | Acceptance |
|---|---|---|---|
| CX-1 | Desktop supervisor starts the Edge runtime with cert paths, robot UUID, Thing, endpoint (EDGE §1); hardware disabled by default | `edge-supervisor.js` | Shadow `connected`, `hardwareEnabled=false`, no keys in logs |
| CX-2 | Physical adapter `so101_follower` (R1 currently rejects all but `fake_follower`); steps `arm.select, home, gripper.open, gripper.close, wait` on ONE follower | `checkIk/` hardware safety controller | each step executes within calibrated limits; unknown step rejected |
| CX-3 | Shadow heartbeat ≤10 s; `armed` true only after local operator action, false after any (re)connect; telemetry ≤2 Hz, ≤120 frames | `iot.py` as reference | matches contract fields |
| CX-4 | Connect, motor detection, calibration (LeRobot/leLab references) | `audit_so101_hardware`, calibration tools | per-joint limits recorded before any motion |
| CX-5 | Safe arming, Stop (honours `cancel`), Emergency Stop, safe disconnect | | motion halts ≤ agreed time; Stop acked on MQTT |
| CX-6 | Leader–follower teleoperation (one pair) then trajectory recording/replay and evidence upload via the student's session (§8) | `recording-manager.js` | recording stored in recordings bucket; replay bounded to limits |
Codex must not change the backend, Twin or AWS; Desktop compatibility with the contract is **unverified** until CX-1…CX-3 pass against `se` Production.

## 5. One-pair SO-101 commissioning (before any dual-arm work)
Owner and operator present; E-stop reachable; clear workspace. Order: inventory & photo of serials → power/cabling check → motor ID detection → calibration → joint-limit verification (read-only) → torque-off dry run → arm locally → `home` at lowest speed → open/close gripper → verify Stop and Emergency Stop → leader–follower teleop at reduced gain → telemetry check (`LIVE_PHYSICAL`) → evidence recording → disarm and power down. Abort on any unexpected motion. Every physical test is NOT RUN until executed and signed by the operator.

## 6. Recommended order for 2026-11-28
1. Owner: approvals for CC-1 (merge/deploy/apply). 2. Claude: retest WF03/WF04 evidence. 3. Codex: CX-1..3 against a **different** client id only if the owner approves a second Thing; otherwise do the R1→Desktop handover (§2). 4. Claude CC-2/CC-4 in parallel. 5. Supervised commissioning (§5). 6. Only then CC-5/CC-7.

## 7. Source verification, inputs/outputs and conflict matrix (verified against the repository on `develop` `2d0b260`)
| Task | Verified source location | Inputs | Outputs | Interface contract | Blockers |
|---|---|---|---|---|---|
| CC-1 | PRs #260/#262 merged; IAM `infra/terraform/compute.tf` (`ExperimentEvidenceObjectAccess`); Twin `services/digital-twin/src/vista_digital_twin/{app,authorization}.py`; scope `learning/digital-twin-scope.service.ts` | owner: release to `main`, `deploy-api`/`deploy-web`, `terraform apply reviewed.plan` | deployed `430ad59`→new SHA; evidence artifact; attempt-viewer frames | EDGE §3–§6 (frame schema), `07-api-and-mqtt-contracts.md` | owner approvals |
| CC-2 | `learning/iot-feedback.repository.ts:49` (`event.sequence <= lifecycle.last_sequence` → "stale") | SQS ack/status order | exactly-once `iot_ack_acknowledged`, monotonic state | EDGE §7 (ACK/terminal rules) | none (code change on `develop`) |
| CC-3 | `learning/iot-command.service.ts`, `physical-execution.service.ts`, `iot-publish-recovery.{service,runner}.ts`, `lab-session.service.ts` | command TTL/dedupe rules | defined terminal state per failure | EDGE §2–§7, §14 cancel | CC-4 for live proof |
| CC-4 | `web/checkIk/wf03_command_adapter.py`, `services/robot-runtime/config/runtime.cloud-simulation.json` | adapter delay parameter (config only) | ≥10 s simulated run | none changed | owner OK to run on Production |
| CC-5 | `learning/iot-physical-telemetry.bridge.ts`; Production flag (unset) | Codex CX-3 frames (`physical_telemetry`) | `LIVE_PHYSICAL` classified frames | EDGE §6 | owner approval for the flag; Codex CX-3 |
| CC-6 | `infra/terraform/iot/*` (Thing, cert, policy, rule), `docs/operations/aws-iot-so101.md` | owner decision on a second Thing | none unless approved | policy: one client id per Thing | owner approval |
| CC-7 | `learning/lab-session.service.ts` (`edgeStopUnconfirmed`, quarantine), `physical-execution.service.ts` start gate | Shadow `armed`, `stopped`, `fault` | API refuses start unless armed+fresh | EDGE §1 Shadow fields | Codex CX-3/CX-5, hardware |
| CX-1…CX-6 | Desktop repo `leduc121/vista_lab` (local `vistadesktop/vista-lab-station`; **not touched tonight**); reference implementation `services/robot-runtime/src/{iot.py,runtime.py}` (`runtime.py:199,207` reject every adapter except `fake_follower`); runbooks `docs/operations/PHYSICAL_COMMISSIONING_RUNBOOK_20261127.md`, `DESKTOP_TWIN_AI_HANDOFF_20261124.md` | cert files in `~/vista-edge-certs/`, robot UUID, Thing, endpoint, `runtime.cloud-simulation.json` shape | Shadow, ack/status/telemetry per contract; recordings | `EDGE_CONTRACT_HANDOFF_20261126.md` (P1–P4, §12–§14) | hardware, operator, owner on site |

**File ownership (no simultaneous edits):** Claude Code edits only `services/education-api/**`, `services/digital-twin/**`, `web/robot-edu/**`, `infra/terraform/**`, `docs/**` except the Edge contract; Codex edits only the Desktop repository. **`docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` and `services/robot-runtime/**` are shared: change only via a written proposal appended to the contract doc, approved by the owner, then implemented by the owning agent.** R1 stays read-only for Codex.

**Commissioning:** the one-pair sequence in §5 follows the existing supervised runbook `PHYSICAL_COMMISSIONING_RUNBOOK_20261127.md` (which lists two pairs: use only one leader/follower pair first, e.g. L-A/F-A, before F-B/L-B). Nothing was executed.
