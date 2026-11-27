# 6. Activity flows

## Student provisioning and first login
```mermaid
flowchart TD
  A[System/School Admin opens student import] --> B[Select school SA only]
  B --> C[Upload .xlsx/.csv]
  C --> D{Server parse: size, rows, formulas, injection?}
  D -- refused --> E[Row-1 error, Confirm disabled]
  D -- ok --> F[Preview: Ready / Duplicate / Needs review]
  F --> G{All Ready?}
  G -- yes --> H[Confirm import]
  G -- partial --> I[Import N ready only + explicit confirmation]
  H & I --> J[Create Auth identity + profile + membership + student role + random temp password]
  J --> K[One-time credentials shown, never stored]
  K --> L[Student login: school code + student code + password]
  L --> M[Restricted session: change-password only]
  M --> N[New password 12+ chars, differs from temporary, confirmed]
  N --> O[Replacement session, My Learning]
```

## Classroom Lab Session lifecycle
```mermaid
stateDiagram-v2
  [*] --> active: Instructor Start (robot allocated, entitled, available, free)
  active --> active: Extend (bounded) / Stop Execution (run only)
  active --> terminating: End / Force End / expiry / entitlement revoked / robot disabled
  terminating --> released: no unfinished control session AND stop confirmed by the Edge
  terminating --> quarantined: runtime unreachable or stop unconfirmed
  quarantined --> released: Edge confirms (terminal status or fresh idle Shadow)
  released --> [*]
```

## Experiment command lifecycle (iot_command_lifecycles)
```mermaid
stateDiagram-v2
  [*] --> pending_publish --> publishing --> queued: published
  publishing --> publish_failed: definite failure
  publishing --> reconciliation_required: outcome unknown (never replayed)
  queued --> acknowledged: ack accepted
  acknowledged --> executing: status executing
  executing --> completed: Edge terminal
  executing --> failed: Edge terminal / rejected
  queued --> timed_out: cloud gave up (NOT a safety proof)
```

## Safe release rule
```mermaid
flowchart TD
  X[End / expiry / force end] --> Y[state = terminating: no new student runs]
  Y --> Z[request stop of the active run: R1 cancel / MQTT cancel]
  Z --> V{unfinished control session?}
  V -- yes --> Y
  V -- no --> U{last command timed_out / reconciliation_required?}
  U -- yes --> T{fresh connected idle Edge Shadow after the timeout?}
  T -- no --> Q[quarantined: robot blocked, Retry release]
  T -- yes --> R[released]
  U -- no --> R
```
