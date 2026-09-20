# Component Architecture

| Module | Responsibility | Status |
| --- | --- | --- |
| Lifecycle | Find Port, assignment, calibration, preflight, Start/Stop | VERIFIED workflow; implementation varies by runtime |
| Teleop gateway | Web/phone/VR input normalization | VERIFIED code path |
| Safety + kinematics | clutch, stale rejection, limits, Hold, E-stop lock | VERIFIED code/docs; acceptance evidence incomplete |
| Recorder | episode/provenance metadata | NEEDS_CONFIRMATION E2E |
| Simulation | benchmark scene + sim-data | NEEDS_CONFIRMATION |
| SmolVLA | train, checkpoint, inference/evaluation | NEEDS_CONFIRMATION |

