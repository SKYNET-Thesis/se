# Robot 3D / MuJoCo / Digital Twin — discovery and handoff (2026-11-20)

Read-only discovery. Nothing in `/home/quangduc/Code/vista/se`, `/home/quangduc/Code/vistadesktop/*`, `/home/quangduc/Code/checkIk` or any other worktree was modified or copied.
Statuses: **VERIFIED** (executed here, evidence below), **SOURCE-ONLY** (source located and read, not executed), **NOT VERIFIED**.
Roots used below: `WT` = `/home/quangduc/Code/vista/se-sprint-90` (branch `sprint/vista-90`), `MEN` = `/home/quangduc/Code/vista/mujoco-menagerie-reference` (outside the repository).

## 1. What each thing actually is (do not conflate them)

| Concept | Meaning in this codebase |
|---|---|
| **MuJoCo physics** | Only `services/digital-twin/src/vista_digital_twin/mujoco_sync.py` (sets `qpos` from SIMULATION telemetry on a loaded MJCF; no stepping, no rendering) and the Menagerie MJCF it is tested against. There is **no physics-stepped simulation and no MuJoCo rendering** anywhere in the repo. |
| **Three.js rendering** | Browser viewers that load the SO-101 **URDF + STL** with `urdf-loader`/`STLLoader` (Digital Twin viewer, Studio Blockly preview). Not MuJoCo. |
| **Blockly preview** | The Studio/Practice page: a top-down **schematic SVG** (`SimulationView`) plus a Three.js SO-101 viewer (`So101Viewer3D`) posed from the program's kinematic `SimState`. Server-side `evaluate-symbolic` grades the program. No physics. |
| **Telemetry-driven twin** | `DigitalTwinPanel` → `So101DigitalTwinViewer` receives frames over `WS /ws/twin` from the Python Twin service and applies them to the URDF joints. |
| **Static viewer** | `So101Viewer3D` (Studio) is state-driven, not telemetry-driven. |
| **Mock** | `services/digital-twin/src/vista_digital_twin/mock.py` generates a synthetic stream when no real source publishes. |

## 2. Inventory

| Component | Absolute path | Technology | Status | Reuse recommendation |
|---|---|---|---|---|
| SO-101 URDF (web) | `WT/web/robot-edu/public/assets/so101/urdf/so101_new_calib.urdf` | URDF, 6 revolute joints, 13 STL refs | VERIFIED (parsed: 6 joints, 13 mesh refs, 0 missing) | **Reuse** (Apache-2.0, see §8) |
| SO-101 STL meshes (web) | `WT/web/robot-edu/public/assets/so101/meshes/*.stl` (13 files) | STL | VERIFIED present; byte-identity to LeLab recorded in `services/digital-twin/ASSET_PROVENANCE.md` | **Reuse** with `NOTICE.md` + `LICENSE` beside them |
| SO-101 MJCF (MuJoCo) | `MEN/robotstudio_so101/so101.xml`, `scene.xml`, `scene_box.xml`, `assets/*.stl` | MJCF, Menagerie rev `98a70c569c4c1b6da467a20012f766ee1f8dc521` | **VERIFIED**: MuJoCo 3.3.6 loads all three and `mj_forward` succeeds (§6) | **Reuse for physics/IK reference** with its Apache-2.0 LICENSE; **not copied into this repo** |
| SO-101 URDF (CHECKIK) | `WT/web/checkIk/so101_new_calib.urdf`, `WT/web/checkIk/dual_arm_vr_teleop/so101_new_calib.urdf` | URDF | SOURCE-ONLY | Reference for IK only; prefer the web URDF |
| SO-101 GLB | `WT/arm.glb` = `WT/web/checkIk/arm.glb` = `WT/apps/mobile/assets/models/arm.glb` (48,567,044 B, sha256 `a0e0478f…ab6f30a`); `WT/apps/mobile/assets/models/SO-Arm101.glb` (different file) | glTF binary | SOURCE-ONLY (parsed offline per ASSET_PROVENANCE: 49 nodes, 34 meshes) | **DO NOT REUSE / DO NOT COPY**: author, source and license unknown |
| Twin viewer (web) | `WT/web/robot-edu/src/components/digital-twin/So101DigitalTwinViewer.tsx` (+ `DigitalTwinPanel.tsx`, `so101Model.ts`, `twinTelemetry.ts`, `useTwinTelemetry.ts`, `useDigitalTwinViewerScope.ts`) | React + Three.js + urdf-loader + STLLoader | SOURCE-ONLY render (jsdom has no WebGL); logic VERIFIED by Vitest 33/33 (digital-twin + studio dirs) | **Reuse** as the browser reference for the Desktop twin |
| Blockly 3D preview (web) | `WT/web/robot-edu/src/components/studio/So101Viewer3D.tsx`, `so101Assets.ts`, `SimulationPanel.tsx`, `SimulationView.tsx`; used by `src/pages/Practice.tsx:22` | React + Three.js + `urdf-loader/src/urdf-manipulator-element.js` | SOURCE-ONLY render; Blockly flows VERIFIED by Playwright (`blockly-simulation` 3/3 repeated, `lms-beginner-lab`, `platform-from-scratch`) | Reuse the asset loader; the preview is kinematic, not physical |
| Python Twin service | `WT/services/digital-twin/src/vista_digital_twin/{app,authorization,contracts,mock,mujoco_sync,physical,iot_telemetry,calibration,…}.py` | FastAPI + uvicorn; optional `mujoco==3.3.6` extra | **VERIFIED**: pytest 59/59; real service driven by real WebSocket clients (§6) | **Reuse as is** |
| Joint-state fixture | `WT/services/digital-twin/fixtures/so101_joint_states.json` | JSON | SOURCE-ONLY | Reuse for offline pose tests |
| Home-lab scene | `WT/web/robot-edu/src/components/home-lab/{robotScene,RobotCanvas,envWorker}.ts*` | Three.js marketing/home scene | SOURCE-ONLY | Not an SO-101 twin; do not reuse for control |
| CHECKIK teleop twin | `WT/web/checkIk/frontend/818ac92f-06fa-424a-b907-69fdf7b4c564/src/components/teleoperation/SO101DigitalTwin.tsx` | React + GLB | SOURCE-ONLY | Reference only; animates 5 joints (no gripper), axis assumptions unverified |
| `se` (primary checkout) copies | `/home/quangduc/Code/vista/se/{arm.glb,web/checkIk/…,services/digital-twin/fixtures}` | same files | not inspected beyond listing | Do not use; branch `rc/checkpoint-2026-11-16` |
| LeLab reference | `/home/quangduc/Code/vista/lelab-reference` | external reference checkout | NOT inspected in this pass | Source of the URDF/STL (see provenance doc) |

## 3. Entry points and dependencies

* **Web twin:** `DigitalTwinPanel` (rendered by `src/pages/RobotLab.tsx:145`) → `useTwinTelemetry` opens `new WebSocket(url, ['vista.twin.<scope>'])` → `So101DigitalTwinViewer` loads `SO101_URDF` and `resolveSo101Mesh()` meshes. NPM deps: `three ^0.186.1`, `urdf-loader ^0.13.1` (`web/robot-edu/package.json`).
* **Studio preview:** `Practice.tsx` / `SimulationPanel.tsx` → `So101Viewer3D` → `loadSo101Geometry` (`so101Assets.ts`) fetching `/assets/so101/meshes/<file>`.
* **Twin service:** `cd WT/services/digital-twin && VISTA_TWIN_AUTH_SECRET=<secret≥…> PYTHONPATH=src uv run --frozen uvicorn vista_digital_twin.app:app --host 127.0.0.1 --port 8767`. Python 3.12; `uv sync --locked --extra dev --extra simulation` creates `.venv` (MuJoCo 3.3.6 + numpy 2.3.3 only with the `simulation` extra). No LeRobot, torch, CUDA or serial port.

## 4. Loading the model (exact)

* **Three.js (reference):** `new URDFLoader(manager)`; map every `package://`/relative STL reference through `resolveSo101Mesh(path)` to `/assets/so101/meshes/<basename>` (rejects names outside the allow-list of 13); `up = Z`; after load call `robot.setJointValue('<urdf joint>', radians)`.
* **MuJoCo (headless):** `mujoco.MjModel.from_xml_path('<…>/robotstudio_so101/so101.xml')` then `mujoco.MjData(model)` and `mujoco.mj_forward(model, data)`. Resolve qpos addresses with `model.jnt_qposadr[mj_name2id(model, mjOBJ_JOINT, name)]`; never hardcode 0..5.
* **Offline MJCF mesh path:** the MJCF resolves `assets/*.stl` relative to itself; keep the folder intact.

## 5. Joint mapping

| VISTA / LeRobot name | Web URDF joint | MJCF joint = actuator | URDF limits (rad) | MJCF limits (rad) | Unit conversion in VISTA |
|---|---|---|---|---|---|
| shoulder_pan | `Rotation` | `shoulder_pan` | ±1.91986 | -1.9199 … 1.9199 | rad as-is, deg→rad |
| shoulder_lift | `Pitch` | `shoulder_lift` | ±1.74533 | ±1.7453 | same |
| elbow_flex | `Elbow` | `elbow_flex` | -1.74533 … 1.5708 | **±1.69** | same |
| wrist_flex | `Wrist_Pitch` | `wrist_flex` | ±1.65806 | ±1.6581 | same |
| wrist_roll | `Wrist_Roll` | `wrist_roll` | ±2.79253 | **-2.7438 … 2.8412** | same |
| gripper | `Jaw` | `gripper` | -0.174533 … 1.74533 | -0.1745 … 1.7453 | `percent` only displayed in the viewer; `mujoco_sync` skips `percent` (no approved transfer function). `rad`/`deg` accepted |

**Known mismatches:** elbow and wrist_roll limits differ between URDF and MJCF; the unit-less LeRobot `gripper` 0–100 value has no verified calibration to a jaw angle; no motor sign/zero offset is verified (all six URDF axes are local Z). Physical motion must not be derived from these tables.

## 6. Verification evidence (this session, local, no hardware)

| Check | Result |
|---|---|
| MuJoCo 3.3.6 (`services/digital-twin/.venv`) `MjModel.from_xml_path` + `mj_forward` on `MEN/robotstudio_so101/so101.xml` | **PASS**: nbody 9, njnt 6, nu 6, ngeom 50, nmesh 18 |
| same on `scene.xml` | **PASS**: nbody 9, njnt 6, nu 6, ngeom 51 |
| same on `scene_box.xml` | **PASS**: nbody 10, njnt 7 (free-joint box), nu 6, ngeom 52 |
| Joints/actuators enumerated | `shoulder_pan, shoulder_lift, elbow_flex, wrist_flex, wrist_roll, gripper` (all hinge, actuators 1:1) |
| Web URDF static check | 6 revolute joints (`Rotation, Pitch, Elbow, Wrist_Pitch, Wrist_Roll, Jaw`), 13 mesh refs, 0 missing in `public/assets/so101/meshes` |
| Twin pytest (`PYTHONPATH=src uv run --frozen pytest`) | **59 passed** (includes `test_mujoco_sync.py` 2/2, which loads the Menagerie MJCF via the hardcoded absolute path `MEN/…/so101.xml`) |
| Vitest `src/components/digital-twin` + `src/components/studio` (single fork) | **33/33** in 8 files |
| `tsc --noEmit` (web) | clean |
| Real WebSocket revocation (`web/robot-edu/tests/e2e/digital-twin-websocket-revocation.spec.ts`): real uvicorn Twin on 8767, Node `WebSocket` viewers with `vista.twin.<scope>`, real API actions | **11/11 PASS, twice**: frames really received; submission, membership suspension, account disable, organization suspension, classroom removal, classroom archive and robot reassignment each close the viewer with **4403 `attempt revoked`**; sibling attempt unaffected; idempotent re-revoke; retried revoke lands after a Twin restart (restarted Twin refuses the attempt's frames with 403) |
| **NOT VERIFIED** | any pixel-level rendering (no WebGL in the test runners); MuJoCo offscreen rendering (no GL context attempted); physics stepping; Desktop (Electron/Qt) hosting of the viewers; real motor frames |

### Defect found and fixed by the real-client test

`/ws/twin` accepted the socket **without selecting the offered `vista.twin.<scope>` subprotocol**. RFC 6455 clients (every browser, Node `WebSocket`) abort the handshake in that case, so the web viewer could never have connected to a real Twin; the earlier ASGI-level tests did not enforce this. Fixed in `services/digital-twin/src/vista_digital_twin/app.py` (`websocket.accept(subprotocol=<offered vista.twin.*>)`) with regression test `test_accept_selects_the_offered_viewer_subprotocol_so_browsers_do_not_abort_the_handshake`.

## 7. API / WebSocket contract (Twin)

* `GET /health`.
* `POST /internal/simulation-telemetry` (202) and `POST /internal/physical-telemetry` (202): `Authorization: Bearer v1.<payload>.<hmac>` signed with `VISTA_TWIN_AUTH_SECRET` (publisher audience `vista-digital-twin-simulation-publisher`, ≤60 s, `kind: simulation_publisher`, `org`, `robots`). Body `{organization_id, robot_id, experiment_id, attempt_id, telemetry}`; telemetry `{schema_version:1, robot_id, source_mode:"SIMULATION", controller_id, sequence (strictly increasing per stream), measured_at (UTC ISO), connection:"connected", measured:[{name, position, unit}×6]}`, units `rad` except `gripper` `percent`. Revoked attempts: 403.
* `POST /internal/revoke-attempt` (202; 403 on bad token): body `{organization_id, robot_id, attempt_id}`; idempotent; clears buffers; the revocation lives for the Twin process lifetime.
* `WS /ws/twin[?heartbeat=0.25–10]`, subprotocol `vista.twin.<viewer scope>`; accept echoes that subprotocol. Closes `4403` with reasons `viewer scope required | viewer scope expired | attempt revoked`. A scope that matches no buffered stream while streams exist is refused during the handshake (client sees an aborted connection, not a close code).
* Viewer scope is issued by the Education API: `POST /me/attempts/:attemptId/digital-twin/viewer-scope` (404 on every failure; 60 s TTL).

## 8. Licensing and redistribution

| Asset | Status |
|---|---|
| `public/assets/so101/**` (URDF adapted, STL unmodified) | Apache-2.0 from TheRobotStudio/SO-ARM100 per `NOTICE.md` and `LICENSE` in the folder. `ASSET_PROVENANCE.md` notes the intermediate LeLab URDF `package.xml` says "BSD" (LycheeAI) without license text — confirm before any **new** distribution outside this repo. |
| `MEN/robotstudio_so101/**` | Apache-2.0 (model-local `LICENSE`); outside this repo, **not copied**. If vendoring, copy `LICENSE` and keep the Menagerie commit id. |
| `arm.glb` (3 byte-identical copies) | **Unknown author, source and license.** Do not copy into Desktop or any other repository. `SO-Arm101.glb` likewise unverified. |
| `web/checkIk/**` third-party sources | Not audited here. |

## 9. Known bugs / limits

1. (fixed above) subprotocol not selected on accept.
2. URDF vs MJCF limit mismatch (elbow, wrist_roll).
3. `test_mujoco_sync.py` depends on the absolute path `/home/quangduc/Code/vista/mujoco-menagerie-reference/…`; it fails on any machine without that checkout.
4. A fresh Twin with no buffered simulation stream accepts an unscoped viewer and serves the **mock** stream (no attempt data).
5. Twin revocation memory is per process: restart forgets revocations (the API's retry and the 60 s scope TTL bound exposure).
6. No verified gripper percent → jaw-angle transfer function; no motor sign/zero calibration.

## 10. Asset dependency tree

```
web/robot-edu/public/assets/so101/
 ├─ LICENSE, NOTICE.md
 ├─ urdf/so101_new_calib.urdf ──refs──► meshes/*.stl (13)
 └─ meshes/ (base_so101_v2, base_motor_holder_so101_v1, motor_holder_so101_base_v1, motor_holder_so101_wrist_v1,
              rotation_pitch_so101_v1, upper_arm_so101_v1, under_arm_so101_v1, wrist_roll_pitch_so101_v2,
              wrist_roll_follower_so101_v1, moving_jaw_so101_v1, sts3215_03a_v1, sts3215_03a_no_horn_v1,
              waveshare_mounting_plate_so101_v2)
MEN/robotstudio_so101/{so101.xml, scene.xml, scene_box.xml, assets/*.stl (18 meshes), LICENSE}
```

## 11. Suggested integration order for the Desktop

1. Start from the web URDF + STL (licensed, present); load with urdf-loader/Three.js exactly as `so101Model.ts` does.
2. Connect to the Twin with a viewer scope from the Education API; honour `4403` by tearing the view down.
3. Convert incoming `rad`/`deg` per joint; show gripper `percent` as a value only until a calibration exists.
4. Add MuJoCo (optional extra) only for kinematic checking, resolving joint ids by name; do not mix with Three.js rendering.
5. Never ship `arm.glb`.

## COPY-PASTE HANDOFF FOR CODEX

```
Verified paths (branch sprint/vista-90, worktree /home/quangduc/Code/vista/se-sprint-90):
  SO-101 URDF (licensed, load this):   /home/quangduc/Code/vista/se-sprint-90/web/robot-edu/public/assets/so101/urdf/so101_new_calib.urdf
  SO-101 STL meshes (13, Apache-2.0):  /home/quangduc/Code/vista/se-sprint-90/web/robot-edu/public/assets/so101/meshes/
  Asset licence + notice:              /home/quangduc/Code/vista/se-sprint-90/web/robot-edu/public/assets/so101/{LICENSE,NOTICE.md}
  SO-101 MuJoCo MJCF (VERIFIED load):  /home/quangduc/Code/vista/mujoco-menagerie-reference/robotstudio_so101/so101.xml  (+ scene.xml, scene_box.xml, assets/)
  Twin viewer (Three.js + urdf-loader):/home/quangduc/Code/vista/se-sprint-90/web/robot-edu/src/components/digital-twin/So101DigitalTwinViewer.tsx
  Joint map + unit conversion:         /home/quangduc/Code/vista/se-sprint-90/web/robot-edu/src/components/digital-twin/so101Model.ts
  Twin WS hook:                        /home/quangduc/Code/vista/se-sprint-90/web/robot-edu/src/components/digital-twin/useTwinTelemetry.ts
  Blockly 3D preview:                  /home/quangduc/Code/vista/se-sprint-90/web/robot-edu/src/components/studio/{So101Viewer3D.tsx,so101Assets.ts,SimulationPanel.tsx}
  Python Twin service:                 /home/quangduc/Code/vista/se-sprint-90/services/digital-twin/src/vista_digital_twin/app.py
  MuJoCo sync (qpos only):             /home/quangduc/Code/vista/se-sprint-90/services/digital-twin/src/vista_digital_twin/mujoco_sync.py
  Provenance / licensing details:      /home/quangduc/Code/vista/se-sprint-90/services/digital-twin/ASSET_PROVENANCE.md
  Real-WebSocket revocation test:      /home/quangduc/Code/vista/se-sprint-90/web/robot-edu/tests/e2e/digital-twin-websocket-revocation.spec.ts

Run the Twin:  cd /home/quangduc/Code/vista/se-sprint-90/services/digital-twin && VISTA_TWIN_AUTH_SECRET=<secret> PYTHONPATH=src uv run --frozen uvicorn vista_digital_twin.app:app --host 127.0.0.1 --port 8767
Viewer WS:     ws://127.0.0.1:8767/ws/twin  with subprotocol  vista.twin.<scope from POST /me/attempts/:id/digital-twin/viewer-scope>
Close 4403 = revoked/expired/unauthorised -> drop the view.

Do NOT use: arm.glb (unknown licence), CHECKIK GLB viewer axes (unverified), any pixel-rendering claim (not verified), gripper percent->angle (no calibration).
Do NOT copy the Menagerie folder without its LICENSE; do not copy anything into vista-lab-station from this repo without the NOTICE.
```
