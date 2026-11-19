# Physical robotics reassessment (separate SO-101 project) and VISTA integration path

Date: 2026-11-19. Read-only inspection of work that lives **outside** the VISTA repository. No serial port was opened, no
robot, camera or GPU was used, no motion command was sent, no hardware setting or calibration file was changed. The only
code executed was offline unit tests. The earlier "Physical hardware acceptance 0 %" meant *no acceptance evidence in the
audited repository*; it did not measure the physical robotics implementation, which this document assesses separately.

## 1. What was found

| Location | What it is | State |
|---|---|---|
| `/home/quangduc/lerobot` + conda env `lerobot` | Hugging Face LeRobot source checkout (`22bd7a2f`, 2026-08-07, clean, 1 699 commits). Provides `so_follower`/`so_leader`/`bi_so_*`, Feetech STS3215 bus, `lerobot-calibrate/teleoperate/record/rollout/train` | Upstream, unmodified |
| `~/.cache/huggingface/lerobot/` | The operator's real LeRobot state: **14 calibration files** (8 follower + 6 leader profiles, 2026-08-09 … 2026-10-08, incl. bimanual `…_left/_right` leader and follower pairs), `robots/Teleop.json` (leader `/dev/ttyACM1`, follower `/dev/ttyACM0`, one USB "head" camera), 16 rollout logs, 3 imported training-job records | Real device artefacts |
| `~/Downloads/so101_bimanual_setup.md` | Vietnamese runbook for **2 leaders + 2 followers**: port discovery, motor ID setup, `bi_so_follower`/`bi_so_leader` calibrate and teleoperate (example ports ACM0-3) | Operator procedure |
| `/home/quangduc/Code/checkIk` (11 commits, 8 modified files, last 2026-09-07) and `se/web/checkIk` | CHECKIK: control plane + operator UI + VR/WebXR teleop for SO-101 (Python backend, React dashboard). The repo copy is **newer** (gesture-pick, phone protocol, WF-03 adapter) than the standalone folder, which has `runtime/` and `buildvr_repo/` that the repo copy lacks | Active, two diverging copies |
| `/home/quangduc/Code/molmoact2-so101` (8 commits, last 2026-10-09, 3 modified files) | MolmoAct2 zero-shot inference client for SO-101: two USB cameras + six joints → actions; laptop owns cameras/calibration/safety/motors; optional remote GPU server (no robot code); **dry-run default**, `--live` required, action step/age/watchdog limits | Software + mock tests |
| `~/.cache/huggingface/hub/models--nauq-hna--evo1-final-40k` | EVO-1 VLA-class policy (InternVL3-1B backbone, flow-matching head): inputs `observation.state` (6) + `cam_head`, `cam_right` (3×480×640); output `action` (6); chunk 50; `training_stage: stage1` | Weights cached locally; **dataset, training log and evaluation not found** |
| `/home/quangduc/Code/checkpo`, `VRTeleop`, `newuiarm`, `robot-ui`, `~/Downloads/unity_soarm` | UI/VR/visual prototypes (Next.js mission control, vuer teleoperator, Unity arm) | Not assessed in depth; not integration candidates |

## 2. Evidence — what it proves and what it does not

| Evidence | Proves | Does **not** prove |
|---|---|---|
| 14 LeRobot calibration JSONs (every file has 6 joints with realistic encoder spans 1 311–1 610 ticks) | Real motors were calibrated, for left/right followers and leaders, in at least 6 sessions between Aug and Oct 2026 | Current validity; calibration of the units currently on the bench; mapping to the URDF/MuJoCo frame |
| `bi_so_*` runbook + `Arm_Left`/`arm_right`/`my_awesome_bimanual_*` profiles | Bimanual (two leader–follower pairs) setup was prepared and the procedure written from real port/ID experience | That four arms were teleoperated simultaneously under evidence (no recording, video or log found) |
| 16 rollout logs under `inference_logs/` | **5** rollouts (Oct 4 ×3, Oct 11 ×2) connected a real `so_follower` and started an `evo1` policy loop at 30 FPS / 120 s; the other 11 logs are model loads that never reached the robot. Both Oct 11 runs ended with `Torque_Enable … Overload error` while disconnecting | Task success, safety margin, or repeatability — no outcome metric, video or dataset exists beside the logs. The overload is a physical fault signal that needs a root-cause note |
| `CHECKLIST.md` | Follower joint reading and one **guarded shoulder-pan move** passed on hardware; Cartesian motion is deliberately interlocked off until `wrist_roll` wrap-around is fixed; dual-arm phases unchecked | Anything beyond the ticked items |
| CHECKIK tests | `dual_arm_vr_teleop` **209 passed**, top-level **10 passed** (FK/IK, WebSocket, dashboard, VR LeKiwi safety contract, gesture pick) — all offline | Hardware behaviour |
| MolmoAct2 tests | **10 passed** (camera config, protocol schema/auth, mock remote server) | That the model ran on a GPU or the arm |
| `docs/reports/WF-07-WF-09_SO101_HARDWARE_AUDIT_REPORT.md` + `so101_hardware_readiness_audit.json` (2026-11-05, "READINESS_VERIFIED_STANDBY", signed by the hardware lead) | **Nothing about hardware — see below** | — |

### Important finding: the WF-07/WF-09 hardware audit report contains simulated data

`web/checkIk/audit_so101_hardware.py` falls back to a hard-coded "diagnostic simulation" payload when the live bus read does
not run or fails (lines ~249-268): positions `0, 12.5, −25, 15, 0, 85`, and for **every** motor voltage 11.8 V, 32 °C, load 45,
current 120 mA, torque off. The committed JSON/MD contain exactly those values (all six motors identical, round numbers) and
no "bus read failed" note is distinguishable. The report also says `os_platform: Windows 11`, `COM4`. It must not be cited as
hardware evidence in the thesis or acceptance package. The script silently *fails open to mock*; it should fail closed and
label output `SIMULATED` (recommended change, **not made** here because the existing robotics code is to be preserved). A real
run of the script without `--dry-run` on the bench (read-only, no motion) would give the intended evidence.

## 3. Interface comparison

| Concern | Separate robotics stack | VISTA today | Gap |
|---|---|---|---|
| Follower driver | LeRobot `SO101Follower`/`BiSOFollower` (`robot/controller.py`: guarded `move_joints`, `max_relative_target`, joint-limit/delta/workspace checks in `robot/safety.py`, FK/IK against `so101_new_calib.urdf`) | R1 `CheckikHttpAdapter` → HTTP `/status`, `/execute`, `/cancel`, `/stop` | **`/execute` exists only in the fake `Wf03CommandAdapter`.** The real dashboard exposes `/api/status`, `/api/tasks/*`, `/api/estop`, `/api/unlock`, not R1's contract |
| Commands | Joint targets, leader-follower mirroring, Cartesian IK (interlocked), policy action chunks | Canonical steps `arm.select, home, gripper.open, gripper.close, wait` | Need `home` safe-pose and gripper endpoint values per arm (R1 config `safeHomeJointDegrees`, `gripperOpen/Closed`) — not commissioned |
| E-stop / motion lock | Latched motion lock, Unlock, readiness recheck, deadman clutch, 250 ms watchdog (CHECKIK `CONTEXT.md`) | R1 `/stop` latch + cancel; API refuses real start unless runtime says fake | Real adapter must reuse the CHECKIK latch (authoritative) and map it into R1 `stopped` |
| Calibration | LeRobot JSON per arm id in `~/.cache/huggingface/lerobot/calibration` | `robot-hardware-adapter` (calibration workflow service, 19 tests) and Twin `VisualCalibrationStore` / `CalibrationProfile` | Two calibration notions: motor-encoder (LeRobot) vs frame/visual (Twin). Neither is tied to a VISTA `robots.id` yet |
| Joint-state reading | `get_observation()` → `*.pos` in degrees, gripper 0–100 | Twin `LeLabFollowerTelemetryAdapter.from_lelab_observation` accepts exactly this shape; `POST /internal/physical-telemetry` with owner/org/robot scope | **Compatible shape**; no running owner process publishes it |
| MuJoCo | none in the robotics project (URDF/GLB viewer, `so101_new_calib.urdf`) | `synchronize_simulation_state` deliberately rejects physical input; model file outside repo | Physical→MuJoCo path needs a separate, reviewed function using only `VERIFIED` calibrated radians; sign/offset/gripper mapping unverified |
| Cameras/VLA | `camera_worker`, MolmoAct2 two-camera client, LeRobot rollout with EVO-1 | `ai-integration` contract seam (`vla_contract.py`), no camera path | Action space mismatch: policies emit 6-DOF joint targets/chunks; VISTA's canonical program is five symbolic steps |
| Identity / authz | Local operator, ports `/dev/ttyACM*`, no tenant model | JWT + classroom + entitlement + control session; `VISTA_ROBOT_RUNTIME_MAP` robot→runtime | Robot id ↔ serial port ↔ calibration profile mapping must be configuration owned by the lab operator, not the browser |

## 4. Direct reuse (do not rewrite)

1. **LeRobot `SO101Follower`/`BiSOFollower`** and the existing calibration files as the only motor driver.
2. **CHECKIK safety model** (readiness, latched motion lock, Unlock, deadman, stale-input hold) and `robot/safety.py` validators.
3. **`robot/controller.py::RobotController.move_joints`** (guarded, measured-start check, limits, rate-limited) as the primitive behind `home` and gripper moves.
4. **`so101_new_calib.urdf` + `kinematics.py`** (FK for TCP checks) and the same URDF/MJCF lineage for the Twin.
5. **Twin owner bridge** (`LeLabFollowerTelemetryAdapter`, `lelab_owner_bridge.py`, `publisher_bootstrap.py`) — already accepts LeRobot observations and enforces owner/org/robot.
6. **`robot-hardware-adapter`** for the calibration/ownership workflow (WF-07), **`molmoact2-so101` safety limits** (step cap, observation age, action watchdog) as the template for any future policy executor.
7. **VISTA R1** unchanged: its validation, deadline, cancel and stop latch stay the contract boundary.

## 5. Integration path (design; nothing below is implemented or authorized to move hardware)

```
Browser ─(JWT)→ Education API ──(derive student/delivery/version/PASS/allocation/entitlement; control session)──┐
                                                                                                             ▼
                                              R1 Robot Runtime  (validates canonical steps, deadline, cancel, stop latch)
                                                                                                             │  private HTTP /status /execute /cancel /stop (loopback, bearer)
                                                                                                             ▼
                          NEW "CHECKIK real command adapter" (same HTTP contract as Wf03CommandAdapter, mode = real_follower)
                            • refuses unless CHECKIK readiness OK, motion authorized, no latched lock, profile + calibration present
                            • arm.select → binds the allocated left/right follower (port + calibration id from lab config)
                            • home / gripper.open / gripper.close → RobotController.move_joints to COMMISSIONED targets, guarded
                            • wait → sleep; cancel/stop → hold pose, disable torque per CHECKIK; E-stop = CHECKIK latch (mirrored to R1)
                                                                                                             │ get_observation() each step (owner process)
                                                                                                             ▼
                          Twin owner bridge → POST /internal/physical-telemetry (LIVE_PHYSICAL, calibration UNCALIBRATED|VERIFIED, signed publisher scope)
                                                                                                             ▼
                          Digital Twin WS (viewer scope 60 s) → browser viewer;  [NEW, reviewed] physical→MuJoCo sync for VERIFIED frames only
```

Order of work (each needs its own approval where hardware is involved):

1. **Reconcile the two CHECKIK copies** (standalone vs `se/web/checkIk`) and decide the source of truth; preserve both histories.
2. **Fix evidence honesty** in `audit_so101_hardware.py` (fail closed, `SIMULATED` label), then run it read-only on the bench and replace the WF-07/09 report. *(Hardware read-only, needs operator.)*
3. **Commission per-arm values**: safe home joints, gripper open/closed endpoints, `max_relative_target`, speed caps; record in a reviewed config (R1 `arms.*`). *(Operator + measurement.)*
4. **Implement the real adapter** behind a flag with a software-in-the-loop test against a fake LeRobot bus (extend `FakeFollower` tests) — contract-identical to `Wf03CommandAdapter`, plus latch/stop tests. *(Software only.)*
5. **Telemetry**: run the existing owner bridge in the process that owns the follower; verify `UNCALIBRATED` display first, then create a `CalibrationProfile` per `PHASE5A_HARDWARE_READINESS.md`. *(Supervised.)*
6. **Physical→MuJoCo**: add `synchronize_physical_state` accepting only `VERIFIED` calibrated radians; compare MuJoCo pose to measured pose at checkpoints. *(Needs 5.)*
7. **Supervised end-to-end run** per `SO101_PHYSICAL_TEST_RUNBOOK.md`: one student program (`home`, `gripper.open`, `wait`, `gripper.close`), operator at the E-stop, evidence recorded (video, telemetry JSON, CHECKIK log). Only then WF-03 physical acceptance.
8. **Dual arm**: independent per-arm sessions first (CHECKIK arm-mode model already separates them); simultaneous motion and inter-arm collision/workspace separation last (CHECKLIST Phase 7 is unchecked).
9. **Policies (VLA)**: out of the classroom critical path; reuse `molmoact2-so101` limits and the `vla_contract` seam; record datasets/eval before any claim.

## 6. Remaining work, stated plainly

* The robot-side **building blocks exist and are tested offline**; the **VISTA↔robot adapter does not**.
* The only hardware-derived evidence is calibration state and five rollout logs; there is **no** supervised-test report, video, E-stop test record, torque/temperature log, dataset, or policy evaluation in the files inspected.
* The "hardware audit" report is mock-derived (§2) and must be replaced.
* Known physical issues to clear: `wrist_roll` wrap-around (Cartesian interlock), `Overload` at torque disable on 2026-10-11, USB-hub bandwidth for four boards (per the runbook).
* Open decisions: source-of-truth CHECKIK copy; who owns the follower process (CHECKIK vs LeLab — upstream lock does not cross processes); Windows (COM) vs Ubuntu (ttyACM) host for the lab station.
