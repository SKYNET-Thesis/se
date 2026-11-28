# Desktop ↔ Backend integration matrix (2026-11-28)

Backend revision: `develop` `eceb8d1` (local). Desktop revision: `codex/final-overnight-completion` `12fd55b83b8540489a69cb7df7d8ff4a359064ef`, working tree clean (`git status` empty), read-only inspection.
Codex owns the Desktop repository and the physical commissioning. **This cycle did not modify the Desktop repository, did not start any Desktop or R1 runtime against a robot, did not connect to MQTT/AWS IoT and did not command any motor.**

## Evidence run this cycle
| Check | Result | Method |
|---|---|---|
| Desktop Node contract tests (`npm test`: API/IPC contract 26 + runtime/supervisor/provisioning/teleop/port-forwarder/recording/playback/policy 22) | **48/48 PASS** | clean `git archive 12fd55b` export in scratch, `npm ci --ignore-scripts`, original repo untouched |
| Desktop Edge Python tests (`edge/tests`, 100 tests) | **100/100 PASS** with `mujoco 3.17.0`, `paho-mqtt 2.2.0`, `pyserial 3.5` (`uv run --python 3.12`) | same export. With system Python 3.14 and no MuJoCo: 3 FAIL + 1 ERROR (MuJoCo absent) — environment, not product |
| Desktop packaging / installer build | **NOT RUN** | Desktop report states the same |
| Web download entry points | Linux `.deb` button is enabled only when a published, verified file exists; otherwise "unavailable". Windows and macOS: disabled "Coming Soon" | `DesktopDownloadChapter.tsx` |
| Docs-vs-repo revision | Desktop report quotes `c5f4bce`; actual HEAD is `12fd55b` (descendant, docs-only commits plus recording/replay work); reconcile when Codex closes out | `git log` |

Status vocabulary: PASS / FAIL / BLOCKED / NOT RUN / DEFERRED. "MOCK-VERIFIED" in Desktop documents is **not** PASS for a physical requirement.

## Contract matrix
| # | Integration item | Backend side (this repo) | Desktop side | Status | Notes / owner |
|---|---|---|---|---|---|
| 1 | Desktop installation and launch | download entry point (Web) | packaged installers | **NOT RUN** (installer build). Web Linux button is gated on a published file. Windows/macOS show "Coming Soon"; no owner document defers them, so they are NOT RUN, not DEFERRED | Codex builds, owner publishes |
| 2 | Robotics Python environment | n/a | locked `edge/robot-runtime/.venv` (py 3.12.14, LeRobot 0.6.1, Torch 2.7.1+cpu) installed on the workstation per Desktop report | **NOT RUN here** (reported by Codex; not re-verified, venv not touched) | hardware owner |
| 3 | Backend authentication | Supabase JWT bearer, device provisioning (`/device-provisioning`, migration R staged) | student bearer session in `api.js` | API contract tests PASS (Desktop 26/26; backend jest suites green) ; live auth **NOT RUN** | — |
| 4 | Device identity | `DEVICE_PROVISIONING_ENABLED`, `DEVICE_TOKEN_SECRET`; staged migration R (not in release manifest) | `device-provisioning.js` | local PASS (backend DB specs, Desktop `device-provisioning.test.cjs`); **Production: migration R not released → BLOCKED** | owner decision on R |
| 5 | Session and attempt binding | physical-execution requires an open Lab Session for the classroom (`LAB_SESSION_NOT_ACTIVE`), attempt, submission; `runId = wf03-<experiment uuid>` | MQTT envelope has `runId` only, no attempt/session field | **OPEN contract gap** | Desktop handoff says Claude must define the authorization bridge; the Edge contract (§12–§13) says no Desktop change is needed. **Contradiction — not resolved here; owner/Codex+Claude decision** |
| 6 | Runtime registration / MQTT identity ownership | one runtime per robot UUID; Shadow `connection/runtimeKind/hardwareEnabled/stopped/reportedAtMs`; start modes `simulation` / `physical_commissioning` (off by default, allowlisted users, expiring window) | Desktop `EdgeRuntime` default-deny authorizer, no `mqtt_command_executor` by default | local contract tests PASS both sides; live **NOT RUN** | Never run R1 and Desktop on the same identity (runbook step 16) |
| 7 | Execution commands (`kind:"run"`) | `iot-command.service` envelope (schemaVersion 1, commandId, sequence, TTL 10 s) | validated, deduped, persistent dedupe | local PASS; physical **NOT RUN** | — |
| 8 | Stop / cancel (`kind:"cancel"`) | **implemented** (`iot-command.service.ts:136`, `lab-session-stop.spec`); R1 implements it for simulation | Desktop answers `command_identity…` rejection until implemented (EDGE contract §14, task for Codex) | Backend **PASS (local)**; Desktop **FAIL/OPEN (not implemented)** | contradiction: Desktop handoff says remote-stop semantics are undefined; EDGE contract §14 defines them. Codex to implement §14 |
| 9 | Expiry | backend session-expiry/end-lab-session cancels and quarantines (safety specs 4/4, D-17 fix) | local watchdog stops locally; remote in-flight expiry not defined in Desktop-visible contract | Backend PASS (local); Desktop **OPEN** | same as 8 |
| 10 | Measured telemetry | Twin accepts publisher-scoped frames; physical form defined in EDGE contract | transport tested for `SIMULATION` only (2 Hz / 120 frames); no live physical telemetry forwarding | **NOT RUN / OPEN**: owner of physical telemetry forwarding undecided | Handoff question open |
| 11 | Digital Twin synchronisation | attempt-bound viewer scope, no fixture fallback (#262), six joints, freshness | `renderer/twin-viewer.js` six-joint parser, freshness | Backend local PASS (Playwright twin specs: see `DIGITAL_TWIN_EVIDENCE_ACCEPTANCE.md`); physical **BLOCKED** | — |
| 12 | Recording and replay | evidence upload endpoints (`/me/experiments/:id/recordings/uploads`, manifest last) | local sealing, replay preview | Desktop local PASS (mock); backend S3 persistence of Desktop recordings **NOT RUN** | a local hash is not S3 persistence |
| 13 | Evidence persistence | experiment evidence JSON in S3 under `learning-media/experiments/*` (needs IAM, D-03) | — | Local PASS (real object storage, jest S3 + Playwright); **Production FAIL until IAM applied and retested** | — |
| 14 | Instructor review | evidence retrieval, rubric grading | n/a | local PASS (see WF-04) | — |
| 15 | Runtime classification | `MOCK_RUNTIME` / `SIMULATION` / `PHYSICAL_ROBOT` / `UNVERIFIED_RUNTIME` kept distinct in readiness + evidence | Desktop labels fake/simulation as non-physical | PASS (code + tests); no substitution observed | — |
| 16 | Physical one-pair commissioning (Gate H) | — | Codex, owner-supervised, runbook 20 steps | **NOT RUN / BLOCKED** (no hardware evidence supplied; safety profile file absent, owner must approve) | no mock substitute accepted |
| 17 | Physical WF-03 integration (Gate I) | requires 5, 8, 9, 10 closed first | — | **BLOCKED** | — |

## What Claude (backend/web) can still do without hardware
Nothing in this table is independently fixable by backend alone except item 5 (needs a contract decision) and a documentation reconciliation for items 5, 8 and 9. No new endpoint/topic was added (not in scope, and the Desktop handoff itself forbids inventing one).
