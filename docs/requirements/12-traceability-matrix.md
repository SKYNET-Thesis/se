# B12 — Traceability Matrix

| FR | P source | Actor | Rules | Entities | NFR / test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-01 | P-15, P-26 | Local Operator | BR-01–04,08 | Arm, PortAssignment, CalibrationProfile, ReadinessCheck, ControlSession | NFR-02; lifecycle test | `references/8689445351821956196.mp4` (to classify) | VERIFIED workflow / implementation partial |
| FR-02 | P-08,15,22 | Local Operator | BR-05,06,10 | ControlSession, Arm, SafetyEvent | NFR-01; dual-arm test | `references/8689445351821956196.mp4` | VERIFIED evidence exists |
| FR-03 | P-24,28 | Local Operator | BR-05–10 | SafetyEvent, ControlSession | NFR-01,02; SAF tests | pending timeout/E-stop clip | NEEDS_CONFIRMATION evidence mapping |
| FR-04 | P-08,16,17 | Local Operator | BR-11–13,15 | Episode, DatasetVersion | NFR-04,05 | pending dataset manifest | NEEDS_CONFIRMATION |
| FR-05 | P-09,20 | Local Operator | BR-15,16 | SimulationScenario, Episode | NFR-05 | pending sim run | NEEDS_CONFIRMATION |
| FR-06 | P-18,19,21,23 | Local Operator | BR-10,13,14,16 | TrainingRun, Checkpoint, EvaluationRun | NFR-03,06 | pending model evaluation | NEEDS_CONFIRMATION |

## Orphan check

- Future/Out-of-scope P-14, ACT/Diffusion parts of P-10/P-33/P-34 are deliberately excluded through ROC-01/ROC-02.
- All active FR link at least one P source, actor, BR and entity.
- Evidence gaps are marked NEEDS_CONFIRMATION, not passed.
