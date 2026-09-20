# VISTA Software Requirements Specification

## Purpose and application

VISTA supports robot operators in arranging light tabletop objects: pick a cube or pen and place it fully inside a plastic box. It is a local-first pipeline from safe bimanual teleoperation and dataset collection to MuJoCo/gym-aloha simulation, SmolVLA fine-tuning and safety-gated inference.

The product includes a local control host, web dashboard, phone teleop app, Quest/WebXR surface, teleoperation/safety control plane, dataset pipeline, simulation environment and SmolVLA pipeline. It is not Internet robot control, multi-user RBAC, ACT/Diffusion benchmarking or a general-purpose manipulation system.

## Scope and actor

The human actor is the Local Operator. The control host owns USB serial to two SO-101 followers. Teleoperation supports web, phone and VR; observation uses two wrist cameras and two overview head cameras. See [B4](requirements/04-stakeholders-and-actors.md) and [B5](requirements/05-scope-and-subsystems.md).

## Requirements and acceptance

Functional requirements: [B10](requirements/10-functional-requirements.md). NFR/constraints: [B11](requirements/11-non-functional-requirements.md). Rules: [B6](requirements/06-business-rules.md). Data/lifecycle: [B7](requirements/07-entity-catalog.md), [B8](requirements/08-conceptual-erd.md), [B9](requirements/09-state-models.md).

- Dataset: 150 real episodes, split 105/15/30.
- Safety: timeout >1 second causes Hold; E-stop locks motion; recovery requires reconnect, recenter and preflight.
- SmolVLA: 10 cube and 10 pen trials; at least 7 PASS per object type, without safety violation.
- PASS: object is picked and completely placed inside the box without outside intervention.

## Evidence and traceability

- VR teleop: `../references/7307978483558391289.mp4` (25.3 s).
- Dual-follower teleop: `../references/8689445351821956196.mp4` (17.9 s).
- Dataset manifest, simulation run, model evaluation and safety timeout/E-stop evidence remain required before acceptance.

See [B12](requirements/12-traceability-matrix.md). Registration changes remain subject to GVHD approval in [v1.1](requirements/03-registration-v1.1.md).
