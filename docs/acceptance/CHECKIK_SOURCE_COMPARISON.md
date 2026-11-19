# CHECKIK source comparison — `se/web/checkIk` (REPO) vs `~/Code/checkIk` (ORIG)

Method: `diff -rq` of both trees (excluding `node_modules`, `.git`, `__pycache__`, `dist`, caches, `.venv`, vendored builds),
then per-file diffs of every differing source file, plus `git log`/`git status` in both. **Nothing was modified, copied,
merged or deleted in either copy.** The offline test suites were run only in REPO (running them in ORIG would have written
caches into the original working tree). Hardware was not touched.

## 1. Identity and history

| | REPO `se/web/checkIk` | ORIG `~/Code/checkIk` |
|---|---|---|
| Git | part of `SKYNET-Thesis/se` (history from 2026-09-08 phone teleop → 2026-11-17 WF-03) | own repo `leduc121/checkIkForVR`, branch `feature/vr-lekiwi-integration`, 11 commits (2026-08-14 … 09-07), **5 commits ahead of its remote (unpushed)** |
| Tracked files | 340 | 3 342 on disk, of which ~3 000 are ignored Unity builds |
| Python (excl. vendored) | 15 696 lines | same core, fewer features (see §2) |
| Uncommitted work | none | 8 modified files: `VRTeleop` submodule pointer + 7 frontend styling files (E-stop button label responsiveness, sidebar/header/page-header/AppShell/Overview layout, `index.css`) — cosmetic, no safety logic change |

Neither copy is a pure ancestor of the other in git terms (separate repositories), but by content **REPO is a superset of
ORIG's tracked source** for every Python and TypeScript module that differs; the only ORIG-only items are ignored/binary or
secret material (§3).

## 2. Divergent implementations (REPO ahead unless stated)

| File | ORIG lines | REPO lines | Nature of difference |
|---|---|---|---|
| `dual_arm_vr_teleop/backend/dashboard_server.py` | 985 | 1 487 | REPO adds the whole **gesture-pick** control flow (`GesturePickDashboard`, `GuardedGestureFollower`, `_GuardedGestureRobot`, `_gesture_pick_authorize`, `_require_exclusive_task`), camera probing cache, `/api/gesture-pick/*` and `/api/cameras/stream`; ORIG-only lines are earlier versions of the same functions (e.g. a duplicate-task check later folded into `_require_exclusive_task`) |
| `…/backend/real_vr_teleop_server.py` | 437 | 519 | REPO adds **phone teleop** (ARKit messages: hello/pose/recenter/control_disabled), session binding, timestamp (±1 s) and sequence validation |
| `…/backend/phone_protocol.py`, `gesture_pick/*` (config, models, calibration, localizer, executor, calibrate_overhead_camera) | — | present | REPO only |
| `VRTeleop/lekiwi-vr-teleop/lekiwi_vr_teleop/process.py` | 260 | 326 | ORIG: "Ticket 02" **fake-follower-only** startup; REPO: real control loop (`config.real`), per-arm `HoldLatch`, STOP latch on tick failure, telemetry publishing |
| `…/state.py`, `relay.py`, `follower_adapter.py`, `arm.py`, `cli.py`, `config.py`, `local_teleop.py`, web UI | smaller | +76 / +43 / +23 / +6 … | REPO: real-follower factory (`make_real_follower`), phone input, extra relay endpoints; ORIG-only lines are docstrings/earlier fake-only code |
| `…/lekiwi_vr_teleop/phone.py`, `tests/test_phone_motion.py` | — | present | REPO only |
| `tests/test_wf03_command_adapter.py`, `wf03_command_adapter.py` | — | present | REPO only (VISTA WF-03 fake HTTP adapter used by R1) |
| `audit_so101_hardware.py`, `BIG-UPDATE-PHASE0-AUDIT.md` | — | present | REPO only. The audit script **falls back to hard-coded values** (see Safety review F-12) |
| Frontend (`frontend/818ac92f-…/src`) | older pages | + `GesturePick.tsx`, `gesture-pick/*`, `ObservationRail/Row`, `CommandDock`, `dashboardOverview`, `gesturePickMonitor`, `recordingCameras` | REPO ahead; ORIG has 7 uncommitted styling edits that REPO does not have |
| `dual_arm_vr_teleop/requirements.txt` | 3 deps | + `opencv-python-headless==4.13.0.92` | REPO needs OpenCV for camera/gesture-pick |
| `README.md` files | — | updated | REPO documents phone teleop/gesture-pick |

Identical in both: `robot/` (`controller.py`, `ik.py`, `kinematics.py`, `safety.py`), `so101_new_calib.urdf`, `leader_teleop_worker.py`,
`single_leader_teleop_worker.py`, `vuer_real_teleop_worker.py`, `direct_calibration_worker.py`, `camera_worker.py`,
`offline_teleop_server.py`, `mock_teleop_server.py`, the Quest WebXR assets, `CHECKLIST.md`, `CONTEXT.md`.

## 3. Items that exist only in ORIG

| Item | Size | Tracked? | Comment |
|---|---|---|---|
| `buildvr_repo/`, `unity_build/`, `unity_assets/`, Unity `.unity`/`.asset`, `tools/*.cs`, panorama/gaussian scripts | 553 MB + 2.1 GB + 29 MB | ignored by `.gitignore` by design ("Unity development is kept in its own repository") | not source of the control plane; keep out of VISTA |
| `dual_arm_vr_teleop/runtime/` | 4 files | ignored | `dashboard_state.json` (assignments: right-leader `/dev/ttyACM0`, right-follower `/dev/ttyACM1`, **no latched lock**, 2026-09-04), `leader_telemetry.json` (real follower observation, 2026-09-05), **`vuer-cert.pem` and `vuer-key.pem` (TLS private key)** |
| `VRTeleop/lekiwi-vr-teleop/certs`, `VRTeleop/lerobot_teleoperator_so101_vuer/{cert,key}.pem` | — | ignored (`**/*-key.pem`; `key.pem`) | private keys: **never copy into VISTA**; regenerate per host |
| `.venv`, `.pytest_cache`, egg-info | 106 MB | ignored | local |
| `webxr/public/assets/command_center_360_hq.jpg`, `gaussian_faces/` | large | ignored | visual assets |

## 4. Dependencies, safety behaviour, calibration

* **Dependencies**: identical except OpenCV (REPO). Both rely on LeRobot ≥ 0.6.x in the Python 3.12 conda env `lerobot`
  (`LEROBOT_BIN` defaults to `~/miniconda3/envs/lerobot/bin`; the base Python 3.14 is explicitly unsupported).
* **Safety behaviour**: the core safety model (latched E-stop persisted in `runtime/dashboard_state.json`, `--enable-motion`
  + literal confirmation, unlock + readiness re-check, 250 ms stale-packet clutch release, ±5° startup tolerance, workspace box)
  is identical. REPO **adds** safer behaviours: gesture-pick **keeps torque on at cancel** (`disable_torque_on_disconnect=False`),
  checks cancellation before every actuator write, reads torque read-only before moving, refuses ambiguous/stale/off-table
  targets, and the lekiwi path uses a hold latch plus STOP latch on tick failure. REPO also **adds attack surface**: camera MJPEG
  stream and gesture-pick routes on the same unauthenticated, `Access-Control-Allow-Origin: *` HTTP API (finding F-04).
* **Calibration**: neither copy stores calibration; both read LeRobot JSON from `~/.cache/huggingface/lerobot/calibration`
  using the hard-coded `my_awesome_bimanual_<role>_<side>.json` naming in `calibration_path()` (device ids
  `left/right-leader/follower`). There is therefore **no calibration divergence between copies**; the divergence is between
  the profile names the code expects and the 14 profiles that exist on disk (`Arm_Left`, `arm_right`, `Teleop`, `so_follower`,
  `so101_vr_follower`, `my_awesome_*`), see the integration map.
* **Bug fixes**: REPO contains the later fixes (gesture-pick denial of reset on every monitor route, Quest proxy/startup
  lock, hardware-safe preview/cancellation, phone session/timestamp validation). ORIG contains none that REPO lacks.

## 5. Test comparison (offline, REPO only)

| Suite | Result |
|---|---|
| `dual_arm_vr_teleop/tests` (FK/IK, offline teleop, real-VR bridge with fake robot, dashboard, VR LeKiwi safety contract, phone protocol, 6 gesture-pick suites) | **209 passed** |
| `tests/` (FK, IK, WebSocket offline, WF-03 adapter) | **10 passed** |
| `VRTeleop/lekiwi-vr-teleop/tests` (arm, frames, relay, state, CLI, process readiness, follower adapter, local teleop, phone motion) | **129 passed, 1 skipped (needs `placo`), 1 failed** |

The single failure, `test_process_emits_readiness_payload_only_after_runtime_is_ready`, is **test drift, not a safety
regression**: REPO's `process.py` now calls `runtime.relay.publish_telemetry(...)` on every control tick but the test's
`RecordingRelay` stub has no such method, so the tick raises and the code takes its fail-closed branch (`trigger_stop()`).
Fix the stub (test only). The ORIG suites were not executed.

## 6. Recommendation — source of truth

**Use REPO (`se/web/checkIk`) as the single source of truth**, on implementation and safety grounds, not timestamps:

1. It contains every tracked module in ORIG plus the real lekiwi control loop, phone teleop and the most safety-conscious
   flow (gesture-pick with torque-hold, per-write cancellation, read-only attach).
2. It is the copy under CI/review in the team repository and already carries the VISTA WF-03 adapter and tests.
3. Its 348 offline tests pass (one stale stub).

Actions (none performed): (a) port ORIG's 7 cosmetic frontend edits only if wanted (they are UI-only); (b) push or archive
ORIG's 5 unpushed commits before retiring the folder (they are already reflected in REPO content, but history would be lost);
(c) keep `runtime/`, certs and Unity builds out of the repo; (d) fix `RecordingRelay`; (e) retire ORIG as a *development*
copy to avoid a third divergence. Any change to either copy must be an explicit, reviewed merge.
