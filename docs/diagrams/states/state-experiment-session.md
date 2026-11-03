# State Machine — Experiment Session

Source: draw.io page 08 (Report 4, Figure 08). Entity: `control_sessions / learning_experiments`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Requested
  Requested --> Authorized : scope OK
  Requested --> Rejected : invalid scope / permission
  Authorized --> Queued : robot allocated
  Queued --> Running : runtime available
  Queued --> Cancelled : cancel before run
  Running --> Completed : experiment finished
  Running --> Failed : runtime error
  Running --> Cancelled : stop / timeout
  Completed --> Archived : retention / close
  Cancelled --> Archived : record outcome
  Failed --> Archived : record outcome
  Archived --> [*]
  Rejected --> [*]
```

> **Status: proposed.** State names are design-level. The code stores status as free-form strings (see `docs/review-2/05-tracking/repo-audit/CODE_AUDIT.md`); before sign-off, map each state here to the persisted value or rename it to match.
