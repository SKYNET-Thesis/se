# LeLab integration decision — Phase 1 source inspection

Inspected official `huggingface/leLab` checkout at commit
`84b6251cec3471195dfa35119827fbd1da2a801e` on `main`. Its repository
license is Apache-2.0, and `pyproject.toml` requires Python >=3.12. The
checkout remains outside `se/`; it was neither installed nor started.

## Verified integration points

| Area | Source in reference checkout | Observation |
| --- | --- | --- |
| Server | `lelab/server.py:196-318,359-395,582-610` | FastAPI; `/move-arm` starts teleop, `/ws/joint-data` broadcasts, and `/joint-positions` queries the active session. Joint frames use a latest-wins slot. |
| Teleop | `lelab/teleoperate.py:109-242` | `follower_lock` guards session start; LeRobot SO101Follower and SO101Leader are instantiated and connect to serial buses; the worker sends leader actions and reads follower observation around 30 Hz. |
| Joint conversion | `lelab/teleoperate.py:45-97` | Six motor keys map to URDF names. The helper converts values to radians and returns zero for missing keys or read errors. VISTA must **not** treat these fallback zeros as measured feedback. The gripper's 0–100 meaning needs separate verification. |
| Disconnect | `lelab/teleoperate.py:229-255,264-286` | Worker owns disconnect; stop signals the worker and waits up to five seconds. |
| Recording | `lelab/record.py:203-219,236-274,780-843` | Uses LeRobotDataset at `HF_LEROBOT_HOME / repo_id`; recording also claims `follower_lock`. |
| Dataset browse | `lelab/datasets.py:41-75,741-757` | Finds local datasets by `meta/info.json` and exposes per-episode motion data. |
| Viewer | `frontend/src/components/UrdfViewer.tsx`, `frontend/public/so-101-urdf/` | URDF/STL viewer. `git ls-files '*.glb' '*.gltf'` returned no GLB/GLTF in this revision. |

The upstream lock coordinates operations **within LeLab**. It does not prove
exclusive ownership across LeLab and CHECKIK processes or authorize LeLab
sessions as VISTA ControlSessions. That boundary remains unresolved.

## Integration choices

| Approach | Decision | Reason |
| --- | --- | --- |
| A. Isolated LeLab service behind an authenticated VISTA gateway | **Recommended for later phases** | Preserves LeLab teleop/record/replay implementation and its lifecycle. The future gateway must require VISTA authorization and a single local follower owner; it must not expose LeLab control routes directly to browsers. |
| B. Import LeLab modules into Robot Runtime | Defer | Hardware-capable imports and LeRobot dependencies would expand the private runtime's fault and dependency surface. |
| C. Extract a minimal backend subset | Defer | Duplicates upstream teleop lifecycle, calibration, safety and recording logic. A small read-only adapter may still be appropriate after ownership is resolved. |

No LeLab process, hardware driver, teleoperation session, or gateway was added
in Phase 1. The new mock service only establishes a versioned read-only frame
contract. For physical telemetry later, measured observations must be
published by whichever **authorized process already owns the follower**.
