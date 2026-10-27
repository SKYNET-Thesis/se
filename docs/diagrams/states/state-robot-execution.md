# State Machine — Robot Execution

Source: draw.io page 09 (Report 4, Figure 09). Entity: `runtime execution`.

```mermaid
stateDiagram-v2
  direction LR
  state "Ready Check" as ReadyCheck
  state "Uploading Evidence" as UploadingEvidence
  state "Not Ready" as NotReady
  [*] --> Idle
  Idle --> ReadyCheck : run command
  ReadyCheck --> Reserved : safety OK
  ReadyCheck --> NotReady : safety fail
  Reserved --> Executing : begin execution
  Executing --> UploadingEvidence : task finished
  UploadingEvidence --> Completed : artifacts stored
  Executing --> Stopped : emergency stop
  Executing --> Failed : execution error
  NotReady --> Idle : reset / retry
  Stopped --> Idle : release robot
  Failed --> Idle : recover / release
  Completed --> Idle : session closed
  Completed --> [*]
```

> **Status: proposed.** State names are design-level. The code stores status as free-form strings (see `docs/review-2/05-tracking/repo-audit/CODE_AUDIT.md`); before sign-off, map each state here to the persisted value or rename it to match.
