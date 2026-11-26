# Robotics Production readiness — WF01–WF04 closure and commissioning preparation (2026-11-26)

Read-only inspection of AWS (profile `vista`, `ap-southeast-1`) and the repository. **Nothing was changed in Production or AWS**: no Terraform, no certificate, no secret, no MQTT, no deployment, no migration, no robot connection. Production serves `0b77ad2`.

**Target status: NOT YET "READY FOR SUPERVISED PHYSICAL ROBOT COMMISSIONING".** Everything that can be prepared without approval is prepared; the remaining gates are owner approvals and one deployment (section 11).

## 1. Release state
PRs #225 (True/False IDs), #226 (roster label), #227 (login accessibility), #228 (Production E2E docs): CI green, mergeable, not merged. New: **#229** (simulation-only IoT start mode + robot-entitlement provisioning script). `develop` = `43d7f10`, `main` = `0b77ad2` (= Production). Test entities of run R1126-1901 are untouched (`docs/acceptance/PRODUCTION_E2E_TEST_DATA_MANIFEST.md`).

## 2. Status of WF01–WF04
| Workflow | Status | Basis |
|---|---|---|
| WF01 resource management | **Implemented; Production blocked only by provisioning.** Local E2E passed earlier (entitlement, allocation, authorization, instructor visibility). The R1126-1901 organization simply has no entitlement | Production E2E P05-04/05; operator mechanism = `seed:wf01-demo-robot` (hard-wired to VISTA Academy), generalized in #229 as `provision-robot-entitlement` (dry-run first). No WF01 source defect was found, none changed |
| WF02 | **PASS** in Production (run R1126-1901) | Production E2E |
| WF03 | **Browser/schematic simulation PASS in Production. Cloud transport to an Edge: BLOCKED by a backend defect, fixed in #229 (not deployed)** | section 5 |
| WF04 | **PASS** within the registered scope in Production | Production E2E |

## 3. AWS inventory (read-only, 2026-11-26)
| Item | State |
|---|---|
| EC2 | `i-0fa8cb318ce21afa5` t3.medium running (single instance; none added) |
| Containers | API, Digital Twin (`/health` ok, mode mock), IoT feedback worker, recordings worker; 0 restarts; images `0b77ad2…` and `twin-0b77ad2…` (ECR) |
| IoT endpoint (ATS) | `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com` |
| Thing | exactly one: `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` (robot `f1c066c4-…`, `VISTA-WF01-DEMO-ROBOT-01`); **0 principals, 0 certificates**, no Device Shadow exists yet (GET → ResourceNotFound): the identity has never connected |
| IoT policy | `<thing>-policy`, already tightly scoped: Connect only as client `<thing>`; Publish only `…/<robot>/{telemetry,status,ack}`; Subscribe/Receive only `…/<robot>/commands`; Shadow update/get topics of this Thing only. No wildcards across robots, no `iot:*`. Attached to no certificate |
| IoT rule | `<thing>_feedback`, enabled: `SELECT *, topic() … FROM 'vista/demo/robots/<robot>/+' WHERE (topic(5)='ack' OR 'status') AND isUndefined(commandId)=false` → feedback SQS |
| SQS | feedback, feedback-DLQ, recordings-events, recordings-DLQ: all 0 messages, SSE enabled |
| S3 | `vista-demo-robot-recordings-…-sg`: AES256, public access fully blocked, object-created notification on `episodes/` to the recordings queue |
| EC2 role | `iot:Publish` on this one command topic, `iot:GetThingShadow` on this one Thing, SQS receive/delete on this robot's two queues, S3 put/get on `episodes/*` and media prefixes: **wired for exactly one robot identity** |
| Production API env (names; values not read) | `VISTA_IOT_ENABLED=false`, endpoint/prefix/queue/worker keys present, `VISTA_IOT_FEEDBACK_WORKER_ENABLED=true`, publish recovery `false`, TTL 10000, `VISTA_TWIN_ENABLED`, `DIGITAL_TWIN_*`, `ROBOT_RECORDINGS_*` present |
| Twin socket | `wss://api.skynex.best/ws/twin` accepts the upgrade (token enforced after); local-only `/health` ok |
| CloudWatch | log group `/vista/demo/education-api` |
| Terraform drift | **NOT RUN** (a plan needs backend credentials and was not requested to run read-only here); the 2026-11-24 review found no drift on the IoT root |

## 4. Device identity mapping (recommended)
The code, IAM, queues, bucket and Terraform root are all single-robot (one `robot_id`). A second Thing would need a second Terraform instance, new EC2-role statements, backend multi-queue/multi-bucket support and a host-script change — **not achievable safely before tomorrow**. Recommended: use the already-provisioned, **never-connected** identity, which the 2026-11-24 handoff already designates as the future physical device.
| Item | Value |
|---|---|
| Application robot UUID | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` (`robots.id`) |
| Serial number | `VISTA-WF01-DEMO-ROBOT-01` (resource record; its notes say it is a demo allocation resource, not hardware readiness) |
| IoT Thing / MQTT client id | `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| Topics | `vista/demo/robots/f1c066c4-…/{commands,ack,status,telemetry}`; shadow `$aws/things/<thing>/shadow/*` |
| Organization entitlement | VISTA Academy (existing) **plus** R1126-1901 (to provision) |
| Classroom allocation | existing: VISTA Academy "Robotics Class A" (6 active members) and "Class B" (0); to add: "VISTA Robotics Acceptance Class" (via the School Admin UI) |
| Edge runtime config | `iot.robotId`, `thingName`, endpoint above; certificate on the Edge host only |
| Leader/follower arms | the cloud identity is **one per independently controlled robot**. The two passive leader arms do not get cloud identities; whether the two followers are one dual-arm robot (one identity, as the runtime's left/right arm model suggests) or two robots is decided by the Edge architecture on commissioning day (default: one identity, two arms) |

**Risk to decide:** the same robot is allocated to a real demo organization's class. An eligible VISTA Academy student with a physical activity could start a run while the Edge is armed. Mitigations: simulation start mode refuses any runtime with `hardwareEnabled=true` (so no physical start through the student path at all); the Edge is hardware-disabled until the owner arms it; the owner supervises. If the owner wants stronger isolation, temporarily remove the two VISTA Academy allocations (an explicit owner decision; they were left untouched here).

## 5. WF03 over real cloud transport — the blocking defect (fixed in #229, not deployed)
Findings from the code:
1. With `VISTA_IOT_ENABLED=true`, `PhysicalExecutionService.start` threw `LOCAL_FAKE_RUNTIME_REQUIRED` unconditionally, so the IoT publisher (lifecycle `pending_publish→publishing→queued`, feedback worker, recovery) was unreachable from a student start.
2. With IoT off, the preflight calls a **loopback** R1 runtime (`VISTA_ROBOT_RUNTIME_MAP`, localhost only) that does not exist on the EC2 host; an Edge on a laptop is never consulted.
Fix (#229): new default-off `VISTA_IOT_START_MODE=simulation` (+ `VISTA_IOT_THING_PREFIX`, `VISTA_IOT_SHADOW_MAX_AGE_MS`): the preflight reads the robot's **Device Shadow** (IAM already allows it) and accepts only `connection=connected`, fresh (≤30 s), `stopped!=true`, `runtimeKind=MOCK_RUNTIME`, `hardwareEnabled=false`; anything else, a missing shadow or a read failure is refused. The run is persisted as `fake_follower` → provenance **MOCK_RUNTIME**; PHYSICAL_ROBOT can never be produced by this path. Production config validation rejects any other mode value. Tests: physical-execution 62/62 (9 new), iot-command 7/7, production-config 33/33, provisioning 12/12. Provenance rules and the recording provenance checks are unchanged.

## 6. Device Shadow
Existing contract (Edge `services/robot-runtime/src/iot.py`, schema v1, **reported only**): `connection`, `runtimeKind` (`MOCK_RUNTIME`/`UNVERIFIED_RUNTIME`, never PHYSICAL_ROBOT), `hardwareEnabled`, `stopped`, `activeRunId`, `lastCommandSequence`, `reportedAtMs`; MQTT last-will marks `disconnected`. No desired-state control, no replay on reconnect (commands carry TTL and sequence; unknown outcomes are never replayed). Gaps against the requested semantics (Edge-owned, additive and schema-compatible): firmware/runtime version, calibration readiness, hardware readiness beyond `hardwareEnabled`, armed/disarmed, fault state, periodic heartbeat (only on change/connect). Stale detection is now implemented on the API side (#229). Handoff to Codex: `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md`. Shadow GET/reported update/reconnect/cross-device denial: **NOT RUN against AWS** (needs a certificate; the cross-device denial follows from the policy above and is verified by policy inspection only).

## 7. MQTT command and feedback pipeline
Contract (existing, unchanged): command envelope `{schemaVersion, kind:"run", commandId, robotId, sequence, issuedAtMs, expiresAtMs, payload}` on `<prefix>/<robot>/commands` (QoS1, TTL 1–60 s); Edge ACK/status with `commandId`, `eventId`, `sequence`, `occurredAtMs`; rule → feedback queue → worker (commit before delete; idempotent; DLQ). Unit/DB tests cover duplicates, out-of-order, expiry and unknown-outcome handling. **Production MQTT stays OFF** (`VISTA_IOT_ENABLED=false`); no live end-to-end run exists yet in Production.

## 8. Digital Twin, evidence, recordings
Twin container healthy and reachable; telemetry boundary, scoped tokens (60 s HMAC), joint mapping, revocation: verified earlier on the local stack (`WF03_ACCEPTANCE_REPORT.md`, Twin specs) — **not yet with a real Edge in Production**. Anonymous mock frame (`so101-mock`) must not be mistaken for Edge telemetry. Recording upload (presign → manifest last → S3 event → queue → worker verifies size and SHA-256 → artifacts) exists and is enabled in Production (worker running, queues empty); first real use is blocked on a signed-in Desktop/Edge.

## 9. Simulation E2E evidence
Production: Blockly → ProgramVersion → schematic simulation → symbolic evaluation → submission → grading → release (R1126-1901, `SIMULATION`). Cloud-transport E2E (API → IoT → Edge → feedback → Twin → evidence): **NOT RUN** (needs approvals in section 11). Local-stack mock-runtime evidence (not Production): WF03 spec ×4.

## 10. Desktop
v0.1.0 published and download verified; Desktop-to-Web integration NOT RUN. Codex owns Desktop/Edge; contract in the handoff file.

## 11. What still needs the owner (nothing was executed)
See `ROBOTICS_OWNER_APPROVAL_CHECKPOINT_20261126.md`: merge #225–#229 and a web+API deploy; provisioning of the R1126-1901 entitlement; one Secrets Manager change (`VISTA_IOT_ENABLED=true`, `VISTA_IOT_START_MODE=simulation`, `VISTA_IOT_THING_PREFIX=vista-demo`); a device certificate created by the owner at the Edge; tomorrow's supervised hardware steps.

## 12. Remaining blockers
Deploy of #229; WF01 provisioning; MQTT enablement approval; certificate; Edge-side additions (shadow fields, heartbeat) by Codex; physical commissioning itself (tomorrow, supervised); D01 (staff e-mail) is unrelated to robotics but affects onboarding.
