# P0 Physical Execution Safety Boundary

Date: 2026-10-18  
Scope: R1 single-arm Home / Gripper / Wait only.

## Non-negotiable ownership

| Layer | May do | Must not do |
| --- | --- | --- |
| Browser | author Blockly, validate, request an execution, display state and offer Stop through NestJS | contact CHECKIK, choose serial ports, supply joint targets or bypass confirmation |
| VISTA NestJS | authenticate, authorize, prove ProgramVersion ownership/scope, create audit records, request/cancel runs through one adapter | control serial hardware or invent safe poses |
| Robot runtime adapter | canonical-step validation, single-run queue/lock, cancellable sequencing, bounded profiles, result normalization | trust browser data or bypass CHECKIK readiness/lock |
| CHECKIK | device assignment, calibration/readiness, exclusive ownership, Stop/E-stop/Unlock and hardware lifecycle | decide student/course authorization |
| LeRobot driver | validated interpolation, motor communication and feedback | expose raw commands over a public HTTP API |

## Required physical gate

All checks must pass immediately before a run starts, and relevant checks must remain valid during the run:

1. Authenticated VISTA user has `learning.experiment.execute` and active classroom scope.
2. Request references that user's submitted immutable ProgramVersion.
3. Program is canonical v1 and contains only R1 steps.
4. A server-side confirmation binds this exact version, selected arm and profile.
5. Runtime `/health` and `/status` are reachable.
6. CHECKIK reports assigned, calibrated, available hardware; motion is enabled and its motion lock is not latched.
7. No VR/teleop/gesture-pick/program execution currently owns the follower.
8. Safe home target and gripper open/closed calibration exist for that specific arm.
9. A Stop path is already available before any command is issued.

If any gate is false, the run becomes `preflight_failed`; no hardware command is attempted.

## Stop and failure semantics

- **Cancel run**: stop scheduling later steps, signal the worker, release the run lock, and report `cancelled` only after the hardware/control-plane cleanup result is known.
- **Stop**: use CHECKIK's controlled session stop behavior and retain the reason in the VISTA experiment event stream.
- **E-stop**: invoke CHECKIK's E-stop path. It must latch the motion lock and requires explicit operator Unlock plus a new readiness check. VISTA cannot auto-unlock it.
- **Runtime crash or timeout**: fail closed; no retry of a physical step without a new user confirmation.
- **Lost feedback/connection**: fail closed and delegate hardware cleanup to CHECKIK; never mark the run successful merely because a command was accepted.

## Motion profiles

Profiles are server-side named configurations, never client numeric inputs.

| Profile | Use | Rule |
| --- | --- | --- |
| `commissioning` | supervised hardware verification | lowest bounded speed; one arm; restricted home/gripper actions |
| `lesson` | normal Cấp 1 run | conservative bounded values validated by commissioning |
| `demo` | supervised presentation | may be quicker but cannot expand joint/workspace limits or bypass readiness/stop |

The current CHECKIK controller includes smooth cubic interpolation and feedback convergence for joint targets, but R1 has no commissioned VISTA home target yet. Do not choose velocity, acceleration, home joints or gripper calibration values until the physical commissioning checklist is completed.

## Required audit trail

For every run, persist: actor, classroom/attempt/submission/program-version IDs, profile, selected arm, full canonical snapshot/hash, confirmation time, preflight result, runtime run ID, ordered step events, terminal state, sanitized error code, start/end times and operator stop/E-stop attribution when applicable.

## R1 commissioning exit criteria

R1 may be enabled only after a supervised test verifies, per arm:

1. read-only status and calibration identity;
2. Stop and E-stop, including latched-lock behavior and explicit Unlock;
3. gripper open/close direction and bounded command range;
4. a configured safe-home trajectory with measured convergence;
5. cancellation during a wait and during an arm-dependent action;
6. exclusive ownership when VR/another run is active;
7. a full R1 sequence produces a persisted VISTA result without exposing a raw control endpoint.
