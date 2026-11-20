# CHECKIK full codebase audit

Date 2026-11-19. Subject: the SO-101 control plane "CHECKIK" and its satellites. Read-only: no hardware, serial port, torque,
calibration, AWS or deployment was touched; only offline tests were run (in the REPO copy). Companion documents:
[source comparison](CHECKIK_SOURCE_COMPARISON.md) · [VISTA integration map](CHECKIK_VISTA_INTEGRATION_MAP.md) ·
[safety review](CHECKIK_SAFETY_REVIEW.md) · [VLA review](CHECKIK_VLA_REVIEW.md).

Directories verified to exist: `se/web/checkIk` (REPO, 340 tracked files), `~/Code/checkIk` (ORIG, 3 342 files of which ≈3 000 are
ignored Unity builds), `~/.cache/huggingface/lerobot`, `~/Code/molmoact2-so101`, `~/lerobot` (LeRobot checkout 22bd7a2f, conda env
`lerobot`). Not assumed identical — they are not (REPO is a superset of ORIG's tracked source).

## 1. Architecture

```
 Meta Quest (WebXR) / phone (ARKit) ──ws──► real_vr_teleop_server.py ─┐       operator browser (React dashboard, :5173)
 leader arms (SO-101 leader) ───────────► leader_teleop_worker.py ────┤                │ HTTP JSON (no auth, CORS *)
 gesture-pick (overhead cam + AprilTag) ─► PickPlaceExecutor ─────────┤                ▼
 lekiwi_vr_teleop (vr_lekiwi process) ────────────────────────────────┤     dashboard_server.py  Controller (control plane)
                                                                      ▼       • assignments, readiness, latched E-stop (JSON file)
                                         LeRobot SO101Follower / BiSOFollower      • spawns ONE worker process, SIGINT→TERM→KILL
                                         (Feetech STS3215 bus, /dev/ttyACM*)       • /api/status snapshot incl. follower telemetry file
                                                                      ▼
                                              physical SO-101 follower(s) (+ leaders for teleop)
 Offline path: offline_teleop_server / mock_teleop_server + so101_new_calib.urdf (FK/IK) + WebXR twin (arm.glb)
 Verification path: wf03_command_adapter.py (fake follower HTTP adapter used by VISTA R1)
```

Roles (from `CONTEXT.md`): CHECKIK is the **control plane** (readiness, motion authorisation, session lifecycle, Stop/E-stop/Unlock);
VR implementations (`vr_control`, `vr_lekiwi`) are *operator surfaces* behind an adapter. Left/right arm pairs and arm modes
`left-only | right-only | dual-arm` are first-class.

## 2. Module inventory (REPO; lines of Python unless noted)

| Area | Module | Lines | Purpose / what the code actually does |
|---|---|---|---|
| Control plane | `dual_arm_vr_teleop/backend/dashboard_server.py` | 1 487 | `Controller`: device/port assignment, camera probe cache, task lifecycle (`_start`, `stop`, `emergency_stop`, `readiness_check`, `unlock`), calibration orchestration, VR/leader/single-leader/gesture start methods, `Handler` HTTP API (see §3) |
| Real teleop | `…/backend/real_vr_teleop_server.py` | 519 | `RealVRBridge` (IK→joint targets, smoothing, step cap, workspace box, feedback re-seed), `run_client` (WebSocket, VR **and** phone, 250 ms stale release, single client), `main` (connect `SOFollower`, `calibrate=False`) |
| Phone | `…/backend/phone_protocol.py` | 153 | pydantic ARKit protocol (hello, pose, recenter, control_disabled) → controller packet |
| Offline teleop | `offline_teleop_server.py`, `backend/mock_teleop_server.py` | 476, 320 | clutch/relative-pose maths, quaternion tools, deadzone, `OfflineTeleop` used by the real bridge |
| Leader teleop | `leader_teleop_worker.py`, `single_leader_teleop_worker.py` | 142, 114 | `BiSOLeader`→`BiSOFollower` mirroring; `exhibition` (2° clamp, zero-jump) vs `project` profile; follower observation → `runtime/leader_telemetry.json` |
| Vuer | `vuer_real_teleop_worker.py` | 200 | single-follower Vuer/Quest worker |
| Calibration | `direct_calibration_worker.py` | 188 | headless homing + range sweep (targets ≈2 150–2 400 ticks), wrap detection, JSON event stream, disables torque in `finally` |
| Cameras | `camera_worker.py` | 81 | OpenCV probe/stream workers |
| Gesture-pick | `backend/gesture_pick/{config,models,calibration,localizer,executor,calibrate_overhead_camera}.py` | 79+76+106+67+310+34 | frozen pydantic config; `TableCalibration` (table polygon/plane); `AprilTagLocalizer`; `PickPlaceExecutor` (`TaskPhase`, hover/descend/close/lift/place stages, `_Hold` on any doubt, cancel before every move) |
| Kinematics | `robot/{kinematics,ik,safety,controller}.py` (duplicated in `dual_arm_vr_teleop/robot/`) | 182, 191, 29, 118 | URDF-parsed FK (`SO101Kinematics`), bounded IK with continuity and FK verification, limit/workspace/delta validators, `RobotController` (LeRobot follower adapter, guarded `move_joints`) |
| Hardware scripts | `read_motor_diagnostics.py`, `read_robot_pose.py`, `audit_so101_hardware.py`, `solve_target.py` | 73, 102, 482, 74 | read-only diagnostics / offline solver; **`audit_so101_hardware.py` falls back to simulated data** |
| Hardware tests (move the arm) | `test_small_motion.py` (shoulder-pan +3° and back), `test_cartesian_motion.py` | 133, 82 | the first is a real-motion script (seeds Goal_Position before torque, slow interpolation, torque off at exit); the second raises on entry (wrist_roll interlock) |
| VISTA adapter | `wf03_command_adapter.py` | 182 | `FakeFollower`, `Wf03CommandAdapter`, threaded HTTP handler (`/status /execute /cancel /stop`, bearer) — fake only |
| lekiwi package | `VRTeleop/lekiwi-vr-teleop/lekiwi_vr_teleop/*` | ≈3 300 | `process.py` (vr_lekiwi runtime), `relay.py` (HTTPS relay/operator surface), `state.py` (XR state/STOP latch), `arm.py` (`ArmController`, `HoldLatch`), `follower_adapter.py` (`FakeSOFollower`, `make_real_follower`, `DualSO101FollowerRobot`), `so101_chain.py` (closed-form FK/IK), `teleop.py`, `local_teleop.py`, `phone.py`, `frames.py`, `operator.py`, `cli.py`, `config.py` |
| Vuer teleoperator | `VRTeleop/lerobot_teleoperator_so101_vuer/*` | ≈800 | `So101VuerTeleop` (LeRobot `Teleoperator`), pyroki IK, `run_real_follower.py` (`clamp_action`, `smooth_action`, `connect_robot` retries) |
| Frontend (React/Vite/TS) | `frontend/818ac92f-…/src` | ≈3 000 (pages) | 17 pages; **only `GesturePick` and `Integrations` call the backend**, status via `lib/backend.ts` (`/api/status`, `/api/gesture-pick/cancel`, generic `POST`); `LabContext.tsx` (981 lines) mixes live status with local/simulated state (`simulated: !backendOnline`, 26 `SimulatedBadge` uses); Models/Inference/Training/Datasets/Recording are presentation only |
| WebXR | `webxr/src/main.js`, `dual_arm_vr_teleop/frontend/src/{main.js,gesturePick.js}` | — | Quest operator surface, digital twin (`arm.glb`), IWER emulator |
| Assets | `so101_new_calib.urdf`, `arm.glb` | — | kinematics source (URDF) and visual-only mesh |

## 3. Control-plane API (`dashboard_server.py::Handler`)

GET `/api/status`, `/api/health`, `/api/gesture-pick/{status,detections}`, `/api/cameras/stream`; POST `/api/ports/assign`,
`/api/tasks/{find-port,find-cameras,vr-offline,vr-lekiwi,vr-real,calibrate,input,leader-teleop[/recover],single-teleop[/recover],stop}`,
`/api/estop`, `/api/unlock`, `/api/gesture-pick/{select,confirm,cancel}`. No shell endpoint (allow-listed commands). No authentication.

## 4. Configuration and environment

| Item | Where | Notes |
|---|---|---|
| `LEROBOT_BIN` | `dashboard_server.py` | defaults to `~/miniconda3/envs/lerobot/bin`; base Python 3.14 explicitly unsupported (draccus `str \| None`) |
| CLI flags | `dashboard_server.py` `--host --port --enable-motion --hardware --gesture-pick-config` | real motion needs `--hardware` + `--enable-motion`; `run.md` shows `--host 0.0.0.0 --enable-motion` |
| Calibration root | `~/.cache/huggingface/lerobot/calibration` | hard-coded names `my_awesome_bimanual_<role>_<side>.json` |
| State | `dual_arm_vr_teleop/runtime/{dashboard_state,leader_telemetry}.json`, TLS pem files | ignored by git |
| Example configs | `teleop_config.example.json`, `gesture_pick_config.example.json` | ports `/dev/ttyACM0/1`, follower ids |
| Frontend | `VITE_BACKEND_URL` (default `http://127.0.0.1:8000`) | |
| Env in VISTA adapter | `VISTA_CHECKIK_MODE`, `VISTA_CHECKIK_ADAPTER_TOKEN` | fake mode only |
| Dependencies | `requirements.txt` (numpy, pydantic, websockets, opencv-headless), lekiwi `pyproject` (numpy, aiohttp, **lerobot ≥0.6.1**, optional placo) | LeRobot 0.6.2 per `CHECKLIST.md` |

## 5. Existing capabilities (code exists + offline tests pass)

* **FK/IK/safety maths** against the SO-101 URDF with verification — tested (`test_fk`, `test_ik`).
* **Quest/phone → follower teleoperation** with clutch, filtering, step/workspace limits, 250 ms stale release.
* **Leader–follower mirroring** for one or two pairs, with telemetry export.
* **Headless calibration** with range-sweep acceptance and wrap detection.
* **Gesture-pick** pick-and-place with AprilTags and a guarded executor (offline-tested only).
* **Operator dashboard** with readiness, assignments, E-stop latch/unlock.
* **VR LeKiwi** process with relay, hold latch and STOP latch (fake driver tested; real factory present).
* **VISTA fake adapter** for WF-03.

Not present: any inference endpoint, dataset recording/export (UI only), motion planning beyond IK interpolation, collision
avoidance, auth, safe-home routine, cross-process port locking, hardware E-stop integration, real `/execute` for VISTA.

## 6. Tests (offline; REPO)

| Suite | Result | Hardware risk check |
|---|---|---|
| `dual_arm_vr_teleop/tests` (209) | passed | dashboard tests redirect `STATE_FILE` to a temp dir; ports are strings; gesture/VR tests inject fake followers; no serial open |
| `tests/` (10, incl. WF-03 adapter 7) | passed | fake follower |
| `VRTeleop/lekiwi-vr-teleop/tests` (131) | 129 passed, 1 skipped, **1 failed** (stale `RecordingRelay` stub, see comparison §5) | `FakeSOFollower`; run with `-p no:cacheprovider`, no `lerobot` hardware path |
| Frontend `*.test.mjs` (4 files) | not run | pure JS helpers |
| MolmoAct2 `tests/` (10) | passed | mock server, no GPU/camera/robot |

Before running, test sources were grepped for `FeetechMotorsBus`, `serial.`, real `SO101Follower(`/`connect(`: the only hits are
string port names in assertions or fake-object `connect()` calls. No dashboard test wrote state into the worktree. Offline
passing is **not** hardware verification.

## 7. Hardware evidence

See `CHECKIK_SAFETY_REVIEW.md` §3. Genuine: one 2026-09-05 follower observation, 14 calibration profiles, two assignment records,
5 real-follower EVO-1 rollouts (≤0.4 Hz, 2 overload endings), `CHECKLIST` items (joint read, one guarded shoulder-pan move).
Not evidence: the WF-07/09 audit report (simulated). Absent: videos, E-stop test records, motor temperature/voltage logs,
supervised-session reports, teleop recordings, datasets.

## 8. Missing functionality (ranked)

1. Real command adapter (`real_follower`) for R1 and the two gates (API G-A, R1 G-B).
2. `wrist_roll` circular handling; safe-home and gripper endpoints; stop policy; auth; port ownership (Safety F-01…F-09).
3. Owner telemetry publisher and physical→MuJoCo/evidence paths.
4. Robot identity binding (serial by-id ⇄ calibration profile ⇄ `robots.id`).
5. Dual-arm collision/workspace separation (`CHECKLIST` Phase 7 unchecked) and four-arm operation evidence.
6. Backend for the dashboard's Models/Inference/Training/Datasets/Recording pages, if they are to be real.
7. Fix the stale lekiwi test stub; reconcile ORIG's unpushed commits.

## 9. Integration dependencies

Python 3.12 + LeRobot 0.6.x env; Feetech STS3215 at 1 Mbaud; stable serial identities; two calibrated arms for dual mode; OpenCV +
cameras for gesture-pick; HTTPS certs for Quest (per host, not shared); R1 `VISTA_RUNTIME_TOKEN`; Twin publisher scope and
`VISTA_TWIN_AUTH_SECRET`; for policies, GPU + HF access.

## 10. Progress reassessment (same methodology as `VISTA_90_PERCENT_AUDIT.md` §4/§4a)

The deeper audit surfaced capability that the previous pass had not counted (guarded gesture-pick executor with torque-hold,
phone teleop, headless calibration worker, real lekiwi loop with hold/STOP latches, 348 passing offline tests) and also
confirmed gaps already assumed (no VISTA adapter, no evidence reports). Only the physical-robotics **code** input moves:

| Component G (weight 10) | Before this audit | After | Evidence for the change |
|---|---|---|---|
| Code | 70 | **75** | gesture-pick executor/guard, calibration worker, phone/lekiwi real loops, 348 offline tests — but unresolved wrap, no auth, no safe-home (kept below 80) |
| Hardware testing evidence | 40 | 40 | new item (real follower telemetry sample) is consistent with the existing calibrations/logs; rollouts at ≤0.4 Hz and overloads offset it; no reports/videos |
| Integration with VISTA | 20 | 20 | two explicit gates and the missing `/execute` confirm the gap; no new integration exists |
| E2E hardware acceptance | 0 | 0 | nothing run end to end |

VLA component I is unchanged (code 50, hardware evidence 20): the review confirms the earlier picture (real EVO-1 inference ran at
≤0.4 Hz with unknown outcome; MolmoAct2 never shown to run; UI pages simulated; no evaluation).

| Dimension | Previous | **Now** | Change |
|---|---|---|---|
| Code | 78.1 | **78.6** | +0.5 (G code +5 × weight 10 / 100) |
| Integration | 62.6 | 62.6 | 0 |
| E2E (software) | 55.9 | 55.9 | 0 |
| Hardware testing evidence | 12.4 | 12.4 | 0 |
| Thesis readiness | 58.5 | 58.5 | 0 |
| **Software composite** | 65.5 | **65.7** | +0.2 |
| **Five-dimension composite** | 53.5 | **53.6** | +0.1 |
| Final end-to-end hardware acceptance | 0 | 0 | — |

The change is deliberately tiny: the audit found real, tested robotics code but also that the decisive items (adapter, safety gate,
bench evidence) are still absent. Scores remain judgement-anchored, not measurements.
