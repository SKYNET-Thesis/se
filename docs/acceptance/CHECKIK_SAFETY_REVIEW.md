# CHECKIK safety review (static, read-only)

Scope: `se/web/checkIk` (REPO, recommended source of truth), cross-checked against `~/Code/checkIk`, the LeRobot checkout
(`~/lerobot`, 22bd7a2f), `~/Code/molmoact2-so101` and the LeRobot logs. **Nothing was executed against hardware**: no serial
port opened, no torque or calibration changed, no motion commanded, no startup script run. Findings come from reading code
and logs; none was reproduced on a robot, so severities are engineering judgement. P0 = can injure/damage immediately in a
plausible use; P1 = must be fixed or fenced before any VISTA-driven motion; P2 = fix before unattended/classroom use;
P3 = hygiene.

## 1. Safety architecture that exists (credit where due)

| Mechanism | Where | Behaviour |
|---|---|---|
| Motion off by default | `dashboard_server.py` `--enable-motion`, `--hardware` | Real VR start needs both flags and the literal confirmation `ENABLE VR MOTION`; offline by default |
| Persisted E-stop latch | `Controller.emergency_stop`, `load_state/save_state` (`runtime/dashboard_state.json`) | Survives restart; `_require_motion_unlatched()` guards every motion start |
| Unlock + readiness re-check | `Controller.unlock` | needs `UNLOCK MOTION`; re-checks assignment, calibration file, device presence; re-latches on failure |
| One task at a time | `_require_exclusive_task`, `ManagedTask` | a second task or gesture-pick while one runs is refused |
| Stale-input clutch release | `real_vr_teleop_server.run_client` | no packet for 250 ms ⇒ `release_clutches()` ⇒ no new commands (arm holds last set-point, torque stays on) |
| Command shaping | `RealVRBridge.process` | smoothing, per-frame joint-step cap (≤3°), deadband, joint-limit + workspace box (x .08-.42, y ±.28, z −.04-.42 m), LeRobot `max_relative_target` |
| Startup pose guard | `_seed_from_robot` | refuses a start pose >5° outside URDF limits or outside the workspace; never auto-recovers; seeds IK from the measured pose (no jump on clutch-in) |
| Packet validation | bridge | sequence monotonic, |timestamp−now| ≤ 1 s, pydantic schema, one client at a time |
| Guarded gesture-pick | `GuardedGestureFollower`, `gesture_pick/executor.py` | cancel checked before every actuator write; torque **kept** on cancel (`disable_torque_on_disconnect=False`); read-only attach (refuses unless torque already enabled and calibration ready); `_Hold` on stale/ambiguous/off-table tag, hover/descent geometry, 10° joint-delta and 3 °/s caps |
| Hold latch (lekiwi) | `arm.py::HoldLatch`, `process.py` | idle ⇒ latches one pose instead of re-commanding measured joints (avoids gravity ratchet); control-tick exception ⇒ `trigger_stop()` |
| Cartesian hardware interlock | `test_cartesian_motion.py` raises | disabled until `wrist_roll` wrap is fixed |
| MolmoAct2 runtime | `molmoact_so101/model/runtime.py` | dry-run default, `--live` explicit, live refuses simulation fallback, per-tick `clip_action` (15° default), observation age ≤500 ms, response age check, 1 s action watchdog, chunk ring cleared on any failure, no stale replay |

## 2. Findings

### F-01 `wrist_roll` wrap-around (P1; known, partly interlocked)
* `direct_calibration_worker.py` treats `wrist_roll` as the **full-turn motor** (`FULL_TURN_MOTOR`, range forced to 0…4095); LeRobot
  then reports it in degrees across −180…+180. The author's own note in `test_cartesian_motion.py` states LeRobot's
  *linear* relative-goal limiter (`ensure_safe_goal_position`, `max_relative_target`) "interpreted the wrap as ~360°" in a live test.
* Only that one test is disabled. `RobotController.move_joints`, `RealVRBridge` (JOINTS includes `wrist_roll`) and any VISTA
  `home` that includes `wrist_roll` in `safeHomeJointDegrees` still command it. In the bridge, a wrapped *measured* value falls
  outside `validate_joint_limits`, so the periodic feedback re-seed is **silently skipped** and the IK state drifts from reality.
* Evidence of exposure: calibration profiles and the 2026-09-05 sample show roll near 0, so normal poses are safe; the hazard is at
  the ±180° seam.
* Needed: circular angle difference for roll in every delta/limit check, unit tests at ±180°, read-only validation, then lift the
  interlock. Until then **R1 must not command `wrist_roll`** (use a safe-home that keeps roll at its measured value).

### F-02 Servo overload on gripper torque disable (P1; root cause unknown)
* `~/.cache/huggingface/lerobot/inference_logs/1791705345.log` and `…705937.log` (2026-10-11, EVO-1 rollouts) end with
  `Failed to write 'Torque_Enable' on id_=6 with '0' after 6 tries. [RxPacketError] Overload error!`, then
  `FATAL: exception not rethrown`. Motor 6 is the gripper.
* LeRobot's `SOFollower.configure()` sets `Max_Torque_Limit 500`, `Protection_Current 250`, `Overload_Torque 25` for the gripper;
  the Feetech overload flag latches when the gripper stalls (closing on an object or end stop) and then rejects the torque write.
  This is a hypothesis, not a diagnosis. `teardown` aborted at motor 6, so **the torque state of the other motors after the
  crash is unknown**.
* Needed: operator-verified root cause (read-only status registers), a gripper-safe closing policy (current/stall limits,
  no sustained closed command against an object), and a shutdown path that disables torque per motor and continues on error.

### F-03 Stop/E-stop = process kill + limp arm (P1)
* `Controller.stop` sends SIGINT, waits 5 s, SIGTERM, 2 s, SIGKILL to the worker's process group; workers' `finally` blocks call
  LeRobot `disconnect()`, whose default `disable_torque_on_disconnect=True` is also set explicitly in `make_real_follower`.
  **Stop/E-stop therefore de-energises the arm**; a gravity-loaded SO-101 can drop onto the table/operator. The only flow that
  holds position on cancel is gesture-pick.
* There is no hardware E-stop integration; software E-stop depends on the worker honouring signals. A hung serial call can
  delay the stop by up to 7 s (the SIGKILL leaves torque in whatever state it had).
* The UI E-stop button shows "Confirm stop" (two-step) in both copies; an emergency control should act on the first press.
* Needed: documented stop policy per context (hold vs limp), prefer hold-then-release for loaded poses, direct torque-disable
  fall-back from a separate watchdog, first-press E-stop in the UI, and a physical power cut-off procedure.

### F-04 Unauthenticated control API and network-exposed teleop socket (P1)
* `Handler._json` sends `Access-Control-Allow-Origin: *`; no token, origin check or CSRF defence. Any web page open on the
  operator's machine can `POST /api/estop`, `/api/unlock`, `/api/tasks/*`. Defences are only the `--enable-motion` flag and
  **fixed, source-visible** confirmation strings (`ENABLE VR MOTION`, `UNLOCK MOTION`). Default bind is 127.0.0.1, **but the project's own `run.md` documents starting it as `dashboard_server.py --host 0.0.0.0 --port 8000 --enable-motion`** (and the Vite UI with `--host 0.0.0.0`), i.e. the unauthenticated API with real motion unlocked on every network interface.
* `start_vr_real` launches the bridge with `--host 0.0.0.0 --port 8765`: a plain `ws://` server, no TLS, no authentication, reachable
  from the whole LAN; the first connecting client owns the arm (one-client lock). A valid-schema packet stream with a fresh
  timestamp and the clutch bit can drive the follower.
* The camera MJPEG stream (`/api/cameras/stream`, gesture-pick) is on the same open API.
* Needed: bearer token + strict origin allow-list (VISTA R1 already sends a bearer), bind loopback by default, TLS + pairing for
  Quest/phone, remove CORS `*`.

### F-05 Watchdogs are partial (P1/P2)
* Bridge: 250 ms stale-packet clutch release — holds position, does not cut torque; good hold semantics.
* **Leader–follower teleop (`leader_teleop_worker.py`) has no watchdog** and, in the default `project` profile, `max_relative_target=None`,
  a 5 ms loop, and `zero_jump` off ⇒ at start the follower is commanded straight to the leader's pose at full servo speed. Only the
  `exhibition` profile clamps 2° and offsets the start. A leader read exception exits the loop → limp (F-03).
* No process-level liveness (R1 does not currently get a CHECKIK heartbeat); Feetech servos have no motion time-out.

### F-06 No cross-process serial ownership (P1)
* One dashboard `ManagedTask` prevents two CHECKIK tasks, but nothing prevents LeLab, `lerobot-teleoperate/rollout`, MolmoAct2
  `FollowerArm`, `read_robot_pose.py` or a second dashboard from opening the same `/dev/ttyACM*`. No `flock`, no udev/by-id path
  (the bimanual runbook itself warns that ports renumber on replug). `docs/…/LELAB_INTEGRATION.md` already flags that LeLab's
  `follower_lock` is in-process only.
* Needed: stable `/dev/serial/by-id/*` identities bound to a VISTA `robots.id`, an exclusive `flock` per port taken by the single
  owner process, and refusal when another process holds it.

### F-07 Joint-limit model vs measured reality (P2)
* URDF limits are conservative (shoulder_lift ±100°, elbow ±96.8°). The real right-follower sample (`leader_telemetry.json`,
  2026-09-05) read shoulder_lift **−104.9°** and elbow **+97.4°**. The bridge therefore carries a "measured-limit-extension" mode
  that widens the IK box to the measured pose (within a 5° tolerance). Accepted by design but it means session limits are not constant.
* Needed: one authoritative per-arm limit table derived from calibration (not the URDF) and a documented tolerance.

### F-08 Calibration consistency (P2)
* Code looks for `my_awesome_bimanual_<role>_<side>.json` only (`calibration_path`); on disk there are 14 profiles under 8 other
  names. `readiness_check` verifies only that the file **exists** — not that it matches the physical unit, side, firmware homing
  offsets or date. Swapping left/right followers is undetectable.
* The calibration worker accepts a calibration only if the swept range meets fixed targets (≈2 150–2 400 ticks, 98 % tolerance) — good —
  but there is no recorded calibration evidence (date, operator, photo) per profile.
* Needed: profile ↔ `robots.id`/serial binding, hash + timestamp in the readiness check, re-calibration workflow tied to VISTA WF-07.

### F-09 No safe-home implementation (P2)
* CHECKIK never moves to a defined safe pose; it refuses a bad start instead (good) but VISTA's `home` step requires
  `safeHomeJointDegrees`/gripper endpoints per arm that nobody has commissioned. The R1 example config (`[0, −35, 70, −35, 0]`)
  is an uncommissioned placeholder: with `wrist_roll` included it also touches F-01.

### F-10 Inconsistent torque policy between tools (P2)
* `SOFollower.connect()` → `configure()` enables torque at the current position and writes P/torque/protection registers;
  gesture-pick avoids this (read-only attach); MolmoAct2 `FollowerArm` enables torque at construction and disables it at exit;
  calibration disables torque and rewrites homing offsets. A shared documented policy is missing.

### F-11 EVO-1 rollouts ran far below control rate (P1 for any repeat)
* The five logged real-follower runs report **0.1–0.4 Hz** against a 30 Hz target ("control might be unstable"). At that rate action
  chunks are executed stale. The logged robot type is `so100_follower` while the hardware is SO-101. No clamp configuration is visible.
  Any repeat needs a GPU, an async engine and `clip_action`-style limits (MolmoAct2 has them).

### F-12 Audit script fails open to mock evidence (P2, evidence integrity)
* `audit_so101_hardware.py` lines ≈249-268 substitute hard-coded telemetry when the live read is skipped or fails; the committed
  WF-07/09 report/JSON contain exactly that payload. See `PHYSICAL_ROBOTICS_REASSESSMENT.md`. Must fail closed and label `SIMULATED`.

### F-13 Smaller items (P3)
* `Controller.emergency_stop` sets the latch *after* stopping the task, and `unlock` writes `latched=false` before the readiness
  re-check (non-atomic window if the process dies between the two writes).
* Packet freshness uses wall-clock `|now − timestamp| ≤ 1 s`, sensitive to Quest/phone clock skew.
* TLS private keys (`vuer-key.pem`, `key.pem`) live in the ORIG working tree (ignored by git); never copy them to VISTA.
* MolmoAct2 `FollowerArm` silently flips to `simulate=True` if the serial connect fails; `inference.py` guards `--live`, other callers must too.
* `Teleop.json` robot config in LeRobot cache lists a single "head" camera, 640×640; MolmoAct2 expects two cameras (head, side).

## 3. Hardware evidence available (for severity context)

| Artifact | Date | What it shows |
|---|---|---|
| `dual_arm_vr_teleop/runtime/leader_telemetry.json` (ORIG) | 2026-09-05 | one real **follower observation** (non-round values, e.g. wrist_roll 14.813186813…, `source: follower_observation`), right arm; shoulder_lift/elbow beyond URDF limits |
| `dashboard_state.json` (ORIG) | 2026-09-04 | right pair assigned ACM0/ACM1; no latched lock |
| 14 calibration JSONs | 2026-08-09…10-08 | real calibrations (6 joints, spans 1 311–1 610 ticks) |
| 16 inference logs | 2026-08-23…10-11 | 5 real-follower rollouts at ≤0.4 Hz, 2 ending in the F-02 overload |
| `CHECKLIST.md` | — | read-only joint read and one guarded shoulder-pan move passed on hardware; Cartesian interlocked |
| WF-07/09 audit report | 2026-11-05 | **simulated** (F-12) — not evidence |

## 4. Pre-integration safety gate (what must be true before VISTA may command an arm)

1. F-01 circular roll handling implemented, tested at ±180°, read-only validated; or `wrist_roll` excluded from VISTA commands.
2. F-03 stop policy decided and implemented (hold vs limp), first-press E-stop, independent torque-disable fall-back.
3. F-04 authentication/origin/bind fixed on the adapter VISTA will call; no `0.0.0.0` unauthenticated teleop socket during class use.
4. F-06 per-port exclusive ownership bound to a robot identity.
5. F-08/F-09 profile binding and commissioned safe-home/gripper endpoints, recorded and reviewed.
6. F-02 gripper overload understood; shutdown path continues past a failing motor.
7. A written supervised-test plan (operator at power switch, workspace clear, speed ≤3 °/s, single arm first) using the existing
   `SO101_PHYSICAL_TEST_RUNBOOK.md`. **No step above was executed by this audit.**
