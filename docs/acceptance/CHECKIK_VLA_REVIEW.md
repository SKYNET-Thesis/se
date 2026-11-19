# VLA review — MolmoAct2, EVO-1, CHECKIK inference UI, VISTA seam

Read-only. No model was loaded, no GPU used, no camera or robot opened, no network call made. Claims below come from source,
configs and logs on this workstation. **A statement about real inference is made only where a log shows a policy actually
loaded and a loop started; no success claim about manipulation is made anywhere because no evidence of it exists.**

## 1. Four different things called "VLA"

| System | Location | What it really is | Real model inference? |
|---|---|---|---|
| **MolmoAct2 SO-101 client** | `~/Code/molmoact2-so101` | Laptop-side camera + safety + motor client for the public `allenai/MolmoAct2-SO100_101` model; optional remote GPU server | Code path for real inference exists; **no log or output shows it ever ran** (tests use a mock server) |
| **EVO-1 policy via LeRobot** | `~/.cache/huggingface/hub/models--nauq-hna--evo1-final-40k`, `…/lerobot/inference_logs` | A trained LeRobot policy (`type: evo1`, InternVL3-1B backbone, flow-matching action head, 40 000 steps, dataset `MinhDuk/final_dataset_annotated`) driven by `lerobot_rollout` | **Yes — real inference ran** on 2026-10-04 (3 runs) and 2026-10-11 (2 runs), at 0.1–0.4 Hz |
| **CHECKIK frontend Models / Inference / Training / Datasets pages** | `se/web/checkIk/frontend/…/src/pages` | React UI; only `GesturePick` and `Integrations` call the backend; `Inference.tsx` selects mode `simulation|preview|hardware` from local state, uses `SimulatedBadge`; `LabContext` marks data `simulated: !backendOnline` | **No** — presentation layer, no inference endpoint exists in `dashboard_server.py` |
| **VISTA `ai-integration/vla_contract.py`** | this repo | contract seam + `ScriptedBaselinePolicy` (keyword → canonical steps), `learned_model:false` | **No** — scripted baseline, explicitly labelled |

Also present but not VLA: gesture-pick (`dual_arm_vr_teleop/backend/gesture_pick`) is **classical perception + scripted control**
(AprilTag localisation → hover/descend/grasp/lift/place with IK); it must not be presented as a learned policy.

## 2. MolmoAct2 SO-101 (`~/Code/molmoact2-so101`, 8 commits, 3 uncommitted edits: README, `model/policy.py`, `requirements-server.txt`)

| Aspect | Implementation (file) | Notes |
|---|---|---|
| Model loading | `model/policy.py`: `MolmoActPolicy.from_pretrained(REPO_ID="allenai/MolmoAct2-SO100_101", device, dtype)`, `norm_tag`, mixed-dtype patch for non-float32 | Hugging Face remote code; weights are not on disk here |
| Vision inputs | `setup/usb_camera.py` (`UsbCamera`, rotation/flip, MJPEG request), **exactly two** RGB images, slots `head,side` (order configurable, "only head,side or side,head"); JPEG-encoded for the wire | README admits the slot semantics are unproven ("bundled code does not prove the semantic slot order") |
| Language | `--prompt` string passed straight to the model (`predict_chunk(images, state, prompt, num_steps, …)`) | no instruction validation; free text |
| State input | 6 joints from `FollowerArm.get_state()`; model frame = `signs * arm + offsets` (v3→v2.1 conversion: sign flip and +90° on shoulder_lift/elbow_flex) | `frame_transforms.py`; configurable via `--joint-signs/--joint-offsets` |
| Action output | continuous **joint-position chunk** `(N,6)`, played at `ACTION_FPS=30`; `action_arm = (model_action − offsets)·signs`, clipped to `joint_min/max` | no Cartesian/gripper-semantic action; gripper is the 6th joint value |
| Runtime | `model/runtime.py`: async producer/consumer, ring of chunks, ensemble weight `exp(−m·age)`, `exec_hz` 30 | requires fresh observation each inference |
| Safety validation | `clip_action` (max step 15° default, proportional scaling), `max_observation_age_ms` 500, response-age check, `watchdog_s` 1.0, chunk ring cleared on any failure, `--live` explicit, live refuses simulation, `validate_actions` on the wire | best safety design among the VLA components; torque is requested off at exit (arm goes limp) |
| Remote mode | `model/protocol.py`, `backends.py`: bearer token (`MOLMOACT_API_TOKEN`), UUID request/response matching, duplicate/out-of-order rejection, JPEG serialisation; `scripts/bootstrap_gpu_server.sh`, `run_gpu_server.sh` | README: Ubuntu 24.04, RTX 3090/A10/L4-class ≥24 GB VRAM, ≥50 GB disk, Python 3.12; GPU/model support "requires runtime verification" |
| Tests | `tests/`: camera config, protocol, mock remote server — **10 passed** (run offline, no GPU/robot) | proves transport/schema only |
| Evaluation evidence | **none**: no success-rate log, video, dataset or benchmark in the project; commit messages mention warm-up and latency diagnostics only | no claim possible |

## 3. EVO-1 (`nauq-hna/evo1-final-40k`, cached 2026-10-11)

| Aspect | Evidence |
|---|---|
| Config (`config.json`) | `type: evo1`, `training_stage: stage1`, `chunk_size 50`, `n_action_steps 50`, `max_state_dim/max_action_dim 24` (SO-101 uses 6), `image_resolution [448,448]`, `max_views 3`, `binarize_gripper false` |
| Vision/state inputs | `observation.state` shape 6; `observation.images.cam_head` and `cam_right`, each 3×480×640 |
| Action output | `action` shape 6 (joint-space chunk of 50) |
| Backbone | `OpenGVLab/InternVL3-1B-hf` (loaded in logs; `lm_head.weight` reported UNEXPECTED, "can be ignored") |
| Training | `train_config.json`: 40 000 steps, batch 8, seed 1000, dataset `MinhDuk/final_dataset_annotated` (teammate dataset, **not on this machine**); LeRobot job records `evo1_imported_*` (state `done`, `runner: imported`, `hf_repo_id: nauq-hna/evo1-final-40k`) and `act_imported_2026-08-23` ("Imported · ACT_120K") — imported *records*, no training logs or loss curves |
| Language handling | no language field in `input_features`; any instruction conditioning is **not evidenced** in the config |
| Real runs | `inference_logs/1791100789`, `…101064`, `…101164` (2026-10-04) and `…705345`, `…705937` (2026-10-11): policy loaded on `cuda`, follower connected (`Robot connected: so_follower`), `Rollout strategy: base`, FPS target 30, duration 120 s. Every run warns *"Record loop is running slower (0.1–0.4 Hz) than the target FPS (30.0 Hz) … robot control might be unstable"* (flash-attn missing → eager attention). Two runs end in the gripper overload (CHECKIK_SAFETY_REVIEW F-02) |
| Outcome | **unknown**: no episode outcome, video, telemetry or task success record; robot type logged as `so100_follower`, camera set is one `head` in `robots/Teleop.json` while the policy expects `cam_head` + `cam_right` |
| Evaluation | `env_eval_freq: 0`, `eval_n_episodes: 10` are defaults of an imported record — **no evaluation evidence** |

## 4. Real versus scripted — summary for the thesis

* Real learned-policy inference on hardware **was attempted** (EVO-1, 5 runs) but at ≤0.4 Hz, i.e. not real-time control, with
  no recorded outcome. It must be described as "executed, performance unevaluated".
* MolmoAct2 is **implemented and safety-instrumented but not demonstrated** in any artefact found.
* Nothing in VISTA calls either model. `vla_contract.py` is a scripted contract seam; its output is a *proposal*, not model output.
* No dataset (the 40 k-step dataset is remote), no GPU run log, no success-rate table, no ablation, no real-vs-simulated comparison
  exists in the files inspected.

## 5. Mapping VLA actions to VISTA

| VLA output | CHECKIK/LeRobot representation | VISTA representation | Compatibility |
|---|---|---|---|
| 6-joint position chunk @30 Hz (MolmoAct2, EVO-1) | `robot.send_action({"<joint>.pos": deg})`, degrees, gripper 0–100 | canonical `robot_program` steps (`arm.select, home, gripper.open/close, wait`) | **Incompatible granularity**: a policy's continuous chunks cannot be expressed as five symbolic steps |
| frame conventions | LeRobot v3 vs training v2.1 (sign/offset on two joints) | Twin `JointState` per-joint units; calibrated radians only when `VERIFIED` | needs one explicit conversion table per policy, reviewed |
| language | MolmoAct2 free-text prompt | VISTA instruction ≤500 chars (contract seam) | compatible as input |
| safety clamps | MolmoAct2 `clip_action`, age/watchdog | R1 deadline/cancel/stop; CHECKIK bridge step caps | must be applied *below* the policy, not trusted from it |

A VLA path into VISTA therefore needs either (a) a **separate, explicitly authorised "policy run" mode** in R1/CHECKIK with
joint-space limits, 30 Hz control, watchdog and stop, kept out of the classroom critical path, or (b) a planner that converts policy
intent into canonical steps (not what these models emit). Neither exists.

## 6. Requirements to run inference (not done)

GPU ≥24 GB (MolmoAct2) or CUDA GPU with flash-attn for acceptable EVO-1 latency (logs: eager attention, 0.1–0.4 Hz); Python 3.12;
Hugging Face access (logs warn about unauthenticated hub requests); two calibrated USB cameras with stable `/dev/v4l/by-id` paths;
calibrated follower and the F-01…F-06 safety gate satisfied.

## 7. Gaps

No evaluation protocol; dataset not local and not documented in this repo; no camera-to-robot calibration; no policy-run safety
supervisor in R1; no recording of rollouts (video/telemetry) to support thesis claims; CHECKIK inference UI is simulated.
