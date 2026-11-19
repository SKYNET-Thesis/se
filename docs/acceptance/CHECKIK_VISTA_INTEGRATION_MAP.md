# CHECKIK ↔ VISTA integration map

Chain under study: **Student Lab → Education API → Robot Runtime (R1) → CHECKIK → LeRobot follower → joint-state telemetry →
Digital Twin → MuJoCo → execution evidence.** Design only; no physical control is implemented or authorised. Paths are relative to the
repo root (`se/…`) unless prefixed `ORIG:` (`~/Code/checkIk`) or `LR:` (`~/lerobot/src/lerobot`).

## 1. Hop-by-hop map

| # | Hop | VISTA side (exists) | CHECKIK / LeRobot counterpart (exists) | Contract / status |
|---|---|---|---|---|
| 1 | Student Lab UI | `web/robot-edu/src/pages/ActivityReader.tsx` physical panel (3-box simulation checklist), `src/lib/robotExecution.ts` (`createRobotExecutionClient`, `PhysicalExecution`) | — (CHECKIK has its own operator UI, not for students) | Browser sends IDs only; never executable program or robot identity ✔ |
| 2 | Authorisation & session | `services/education-api/.../physical-execution.controller.ts` routes `GET me/attempts/:id/physical-execution-eligibility`, `POST …/physical-executions[/start]`, `GET/POST me/physical-executions/:id[/stop]`; `physical-execution.service.ts` (`probeReadiness`, start preflight, control session) | — | Re-derives student, delivery, immutable version, symbolic PASS, allocation, entitlement ✔. **Gate G-A** (`LOCAL_FAKE_RUNTIME_REQUIRED`, line ≈290): refuses any `checkik.snapshot.mode !== "fake_follower"` ✘ must become mode-aware |
| 3 | Robot ↔ runtime mapping | `robot-runtime.client.ts` `RobotRuntimeClient.run/status/cancel/stop`, env `VISTA_ROBOT_RUNTIME_MAP` (loopback URL + `logicalIdentity`), `VISTA_RUNTIME_TOKEN` | — | ✔ (HTTP, bearer, loopback) |
| 4 | Runtime | `services/robot-runtime/src/runtime.py` `Runtime.submit/_validate_request/_preflight/_execute/cancel_run/stop`, `server.py` routes `/health /status /runs /runs/{id}[/cancel] /stop` | — | Canonical steps only ✔. **Gate G-B** `_preflight`: `adapterMode != "fake_follower"` ⇒ `adapter_mode_not_supported`; telemetry accepted only if `source_mode == "SIMULATION"` (`_valid_simulation_telemetry`) ✘ |
| 5 | Checked-command adapter | `runtime.py::CheckikHttpAdapter` calls `GET /status`, `POST /execute {runId,robotId,step,timeoutMs}`, `/cancel`, `/stop` (bearer) | **Only the fake** `web/checkIk/wf03_command_adapter.py::Wf03CommandAdapter` implements this contract; the real dashboard (`dual_arm_vr_teleop/backend/dashboard_server.py`) exposes `/api/status`, `/api/tasks/*`, `/api/estop`, `/api/unlock` | **Missing adapter A1** (real `/execute`) |
| 6 | Readiness / E-stop state | API reads `snapshot.backend.motionEnabled`, `backend.latchedMotionLock`, `readiness.ready` (`probeReadiness`); R1 requires the same in `_preflight` | `Controller.snapshot()` already returns `backend{motionEnabled, latchedMotionLock, simulated}` and `readiness{ready,checks}` (`dashboard_server.py` 677-704), `Controller.readiness_check`, `emergency_stop`, `unlock` | **Shape already compatible**; missing `snapshot.mode` (`"real_follower"`), auth, and a stop call from R1 into CHECKIK's latch |
| 7 | Motion primitives (reuse) | — | `robot/controller.py::RobotController` (`connect(calibrate=False)`, `get_joint_positions`, `move_joints(target_q, start_q, gripper, max_total_delta_deg=10, speed_deg_s=3, rate_hz=20)` with measured-start check, URDF limits, delta cap, quintic profile, 0.75° convergence requirement), `robot/safety.py` (`validate_finite/joint_limits/workspace/joint_delta`), `robot/kinematics.py::SO101Kinematics` FK, `robot/ik.py::solve_ik` | ✔ tested offline; `wrist_roll` wrap unresolved (Safety F-01) |
| 8 | Guarded follower (reuse as template) | — | `dashboard_server.py::GuardedGestureFollower` / `_GuardedGestureRobot` (cancel before each write, torque kept, read-only attach), `arm.py::HoldLatch`, `gesture_pick/executor.py::PickPlaceExecutor` (`_Hold` on any doubt) | ✔ best existing pattern for a VISTA executor |
| 9 | Driver | — | LR: `robots/so_follower/so_follower.py` `SO101Follower(SO101FollowerConfig(port,id,use_degrees=True,max_relative_target,disable_torque_on_disconnect))`, `connect(calibrate=False)`, `get_observation()`, `send_action()`, `bus.read("Torque_Enable")`; `BiSOFollower` for pairs | ✔ stock LeRobot (`lerobot` env, Python 3.12) |
| 10 | Calibration | `services/robot-hardware-adapter/src/robot_hardware_adapter/*` (`/v1/ports`, `/v1/detection`, `/v1/calibrations/*`, ownership, rate-limit; 19 tests); Twin `calibration.py` (`CalibrationProfile.transform`, `VisualCalibrationStore.active`) | `direct_calibration_worker.py` (homing offsets, range sweep, targets ≈2150-2400 ticks), LeRobot JSON in `~/.cache/huggingface/lerobot/calibration/{robots/so_follower,teleoperators/so_leader}` | Three calibration concepts (motor, workflow service, visual/URDF) — **missing binding** to `robots.id` |
| 11 | Joint-state telemetry | `services/digital-twin/.../physical.py::LeLabFollowerTelemetryAdapter.from_lelab_observation(observation, measured_at)` (expects `"<joint>.pos"`, gripper 0-100, degrees), `lelab_owner_bridge.py::NonBlockingLeLabOwnerPublisher.publish_observation`, `publisher_bootstrap.py::issue_publisher_scope_file`, endpoint `POST /internal/physical-telemetry` | `RobotController.get_joint_positions()` / `robot.get_observation()` (same `"*.pos"` keys); `leader_teleop_worker.py` writes `runtime/leader_telemetry.json` `{timestamp, source:"follower_observation", left{joint:deg}, right{…}}` (no `.pos` suffix) | **Compatible data**, no process publishes it. Needs owner publisher in the process that owns the follower |
| 12 | Twin viewer | `useTwinTelemetry` (+ heartbeat), viewer scope `POST /robots/:id/digital-twin/viewer-scope` | — | ✔ |
| 13 | MuJoCo | `mujoco_sync.py::synchronize_simulation_state` (**raises for non-SIMULATION**) | `so101_new_calib.urdf` (CHECKIK kinematics source) vs MJCF `robotstudio_so101/so101.xml` (outside repo) | **Missing** `synchronize_physical_state` (VERIFIED calibrated radians only) and URDF↔MJCF equivalence check |
| 14 | Evidence | `experiment-evidence.service.ts` stores `vista.experiment.telemetry.v1` JSON in the private S3 bucket (sourceMode `SIMULATION`), WF-04 teacher download | CHECKIK logs / `leader_telemetry.json` (volatile) | **Missing** physical variant (`LIVE_PHYSICAL`, calibration status, operator, E-stop events, video ref) and retention |

## 2. Missing contracts and adapters

| ID | Item | Shape | Reuse |
|---|---|---|---|
| A1 | **Real command adapter** (`real_follower` mode) | same HTTP contract as `Wf03CommandAdapter`; adds `mode:"real_follower"`, bearer auth, loopback bind | wrap `RobotController`/`GuardedGestureFollower`, `HoldLatch`, `Controller.readiness_check` |
| A2 | Step → motion mapping | `arm.select` → bind follower by robot identity; `home` → staged `move_joints` to **commissioned** safe pose (10° delta cap ⇒ multi-stage, roll excluded until F-01 fixed); `gripper.open/close` → commissioned endpoints; `wait` → sleep; **no** `preview.move_xyz` | `move_joints`, `validate_joint_delta` |
| A3 | Robot identity map | `robots.id` → `{by-id serial path, calibration profile id+hash, side, commissioned values}` owned by the lab operator, injected via config/secret, never by the browser | R1 `VISTA_ROBOT_RUNTIME_MAP`, hardware-adapter `ownership.py` |
| A4 | Exclusive serial ownership | `flock` per port held by the single owner process; refuse if held | none exists (Safety F-06) |
| A5 | E-stop propagation | R1 `/stop` ⇄ CHECKIK `emergency_stop` (latch persisted) ⇄ API `estopActive`; stop policy hold-vs-limp decided | `Controller.emergency_stop/unlock` |
| A6 | Owner telemetry publisher | poll `get_observation()` at 10–30 Hz in the owner process → `NonBlockingLeLabOwnerPublisher` (signed publisher scope) | Twin bridge classes (exist) |
| A7 | Physical telemetry validation in R1 | accept `LIVE_PHYSICAL` frames with `calibration_status` and an explicit `source_mode` check per adapter mode | extend `_valid_simulation_telemetry` into a mode-aware validator |
| A8 | Physical → MuJoCo | `synchronize_physical_state` (VERIFIED, `calibrated` rad, limits from MJCF) with checkpoint comparison | `mujoco_sync.py` |
| A9 | Physical evidence schema | `vista.experiment.telemetry.v2` with `sourceMode`, calibration id, adapter mode, stop events | `experiment-evidence.service.ts` |
| A10 | Gate changes | API G-A and R1 G-B accept `real_follower` **only** when an explicit server-side flag + operator-approved robot id are set | `physical-execution.service.ts`, `runtime.py::_preflight` |
| A11 | Adapter auth & origin | bearer + loopback; remove `Access-Control-Allow-Origin: *`; no `0.0.0.0` teleop socket | Safety F-04 |
| A12 | Alternative cloud path | `IotCommandService` (AWS IoT `…/commands`, ack/status → SQS → worker) with R1 `iot.py` fake robot; not required for a single-lab LAN deployment and needs infrastructure approval | existing, unapplied |

## 3. Ownership and process model (decision needed)

Exactly **one process** may own a follower. Candidates: (a) the new A1 adapter (recommended, wraps CHECKIK primitives, publishes
telemetry itself); (b) the CHECKIK dashboard task (leader/VR) — then VISTA runs must be refused while a task owns the arm
(`_require_exclusive_task` already refuses a second CHECKIK task); (c) LeLab — in-process lock only. VISTA should treat CHECKIK
operator tasks (teleop, VR, gesture-pick, calibration) and VISTA student runs as **mutually exclusive modes** of the same
owner, selected by the operator, never by a student.

## 4. Identity mapping needed (calibration ↔ robot ↔ port)

| Item | Today | Needed |
|---|---|---|
| Port | `/dev/ttyACM0/1` (unstable; `ports/follower_port.txt` = ACM0, leader = ACM1; ORIG state: right leader ACM0, right follower ACM1) | `/dev/serial/by-id/…` stored per robot |
| Calibration | `my_awesome_bimanual_<role>_<side>.json` expected; present: `Arm_Left`, `arm_right`, `Teleop`, `so_follower`, `so101_vr_follower`, `my_awesome_*` | profile id + SHA-256 + date bound to `robots.id`, checked in readiness |
| Side | left/right by file name | verified against measured pose/sign test during commissioning |

## 5. Recommended implementation order

1. **Housekeeping (no hardware):** make REPO the source of truth, fix the stale `RecordingRelay` stub, fix `audit_so101_hardware.py` to fail closed.
2. **Safety gate (software):** F-01 circular roll + tests, F-03 stop policy and first-press E-stop, F-04 auth/origin/bind, F-06 `flock`.
3. **Adapter A1/A2 in fake-bus mode (software):** implement against a fake LeRobot follower, contract-test against R1 (`Wf03CommandAdapter` tests as template), including stop latch, cancel, timeouts, readiness mapping.
4. **VISTA changes behind flags (software):** A7, A10, A9; keep `fake_follower` as default; Playwright WF-03 must still pass unchanged.
5. **Read-only bench session (operator):** run a corrected audit (no torque), record joint reads, verify identity/calibration mapping A3, produce real evidence.
6. **Commissioning (operator):** safe-home, gripper endpoints, speed caps; review.
7. **Telemetry + Twin (supervised):** A6 with `UNCALIBRATED` first, then CalibrationProfile; A8 MuJoCo comparison.
8. **First supervised motion** per `SO101_PHYSICAL_TEST_RUNBOOK.md`: one arm, one `gripper.open` then `home`, E-stop in hand.
9. **Student-path acceptance (WF-03 physical)**, then dual-arm sessions, then (separately) policy-run mode (`CHECKIK_VLA_REVIEW.md`).
