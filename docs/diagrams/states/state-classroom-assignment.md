# State Machine — Classroom Assignment

Source: draw.io page 11 (Report 4, Figure 11). Entity: `learning_classroom_assignments`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Draft
  Draft --> Scheduled : teacher schedules
  Scheduled --> Published : publish
  Published --> Open : available to class
  Open --> Closed : deadline reached
  Closed --> Archived : archive
  Scheduled --> Cancelled : cancel before publish
  Published --> Cancelled : withdraw assignment
  Cancelled --> Archived : record history
  Archived --> [*]
```

> **Status: proposed.** State names are design-level. The code stores status as free-form strings (see `docs/review-2/05-tracking/repo-audit/CODE_AUDIT.md`); before sign-off, map each state here to the persisted value or rename it to match.
