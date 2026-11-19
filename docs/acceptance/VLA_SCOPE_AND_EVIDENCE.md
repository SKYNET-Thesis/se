# VLA thesis scope — what exists, what does not, and the evidence

Thesis title (from project context): *Vision-Language-Action System for Tabletop Manipulation with Dual Robot Arms* (SEP490
capstone). Intended setup: two leader arms and two follower arms (two leader–follower pairs), cameras, local control/safety.

**Status: no VLA model, dataset, training run, inference service or evaluation exists in this repository. No performance
number is claimed anywhere. Nothing here was run on a GPU or a physical arm.**

## Component audit

| Thesis element | Repository state | Classification |
|---|---|---|
| Vision input | No camera capture pipeline in `services/`; `web/checkIk` has WebXR/VR and teleop code, not a model input path. The new contract can *reference* a frame (`image_ref`, `sha256`, `captured_at`) and records that it was not used. | NOT IMPLEMENTED |
| Language instruction handling | `services/ai-integration/src/vla_contract.py` validates and bounds instructions (≤ 500 chars). A deterministic keyword baseline maps a small verb set to steps. | MOCKED (baseline, `learned_model:false`) |
| Action output | Canonical `robot_program` v1 (`arm.select, home, gripper.open, gripper.close, wait`) – identical to what R1 accepts. Drift test imports the R1 validator. Cartesian/joint-level actions are **not** model-controllable in this contract. | IMPLEMENTED (contract) |
| Model inference | None. `src/main.py` is a stub that prints a line. | NOT IMPLEMENTED — BLOCKED on a model/provider |
| SO-101 action mapping | R1 → CHECKIK adapter executes canonical steps; Twin maps six joints to MuJoCo (simulation). Learned-policy joint-space action mapping (e.g. chunked joint targets at 30 Hz) does not exist. | PARTIAL (execution side only) |
| Datasets | `learning_dataset_versions` metadata tables exist for WF-04 review; no dataset content, recording tool for leader–follower demonstrations, or LeRobot-format export exists here. The LeLab reference lives outside the repo. | NOT IMPLEMENTED |
| Evaluation methodology | Symbolic rule evaluator (`ordered_actions`, `object_*`, `final_gripper_state`) scores **student programs** in the schematic simulator. It is a candidate harness for model proposals but has never been run on model output. | PARTIAL (harness only) |
| Real vs simulated execution | Every telemetry frame carries `source_mode`; the API stores `schematic` vs physical experiments separately; fake-follower evidence is labelled `SIMULATION`. | IMPLEMENTED |
| Dual leader–follower arms | Schema is per robot; `arm` left/right exists in the program; no leader-arm ingestion, no two-pair synchronization, no collision handling. | NOT IMPLEMENTED |

## What was added in this sprint (development side only)

* `services/ai-integration/src/vla_contract.py`: `VlaRequest`, `Observation`, `VlaPolicy` protocol, `validate_canonical_program`,
  `ScriptedBaselinePolicy`, `propose()`. `propose()` re-validates **any** provider's program and refuses a plan unless it is marked
  `not_executed` and carries provenance, so a future model cannot bypass the canonical action space or claim execution.
* `services/ai-integration/tests/test_vla_contract.py` (6 tests, passing): supported/unsupported instructions, observation
  handling (referenced, never "used"), hostile provider output (raw joint commands, missing arm, oversized wait, wrong schema,
  falsely "executed"), and a cross-check that R1's own validator accepts/rejects exactly the same programs.

Proposed programs are *suggestions*: they must pass the existing ProgramVersion → symbolic evaluation → classroom/robot
authorization → R1 path. The contract adds no endpoint, no network call and no robot access.

## Precise blockers

1. **Model/provider**: no checkpoint (e.g. a pretrained VLA policy), no hosting decision, no API credential. Needed from the team.
2. **Data**: no demonstration dataset for tabletop pick-and-place with the SO-101 pair; collecting one needs the physical
   leader–follower rig, a recording tool and operator time.
3. **Compute**: fine-tuning/inference needs a GPU environment; none was used or provisioned (no AWS/GPU action authorized).
4. **Evaluation protocol**: success criteria, trial counts and baselines for the thesis are not written down in the repo.
5. **Hardware**: real-vs-simulated comparison and any demonstration require commissioned SO-101 follower(s) and a supervised session.
6. **Learning-platform fit**: project context states students are not expected to train foundation models in the core flow;
   Courses 2–3 VLA experiences are roadmap only.

## Suggested next steps once unblocked (not started)

1. Choose a policy provider; implement it behind `VlaPolicy`, returning canonical programs (or a reviewed extension of the
   action space with R1/CHECKIK changes and a safety review).
2. Add `POST /internal/vla/plan` in `ai-integration` with the same validation, auth and audit rules as the Twin ingest.
3. Evaluate proposals in the schematic simulator against the symbolic rules for a fixed instruction set; publish raw counts.
4. Only then consider a supervised physical trial under `SO101_PHYSICAL_TEST_RUNBOOK.md`.
