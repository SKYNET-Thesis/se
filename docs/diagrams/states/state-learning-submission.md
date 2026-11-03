# State Machine — Learning Submission

Source: draw.io page 10 (Report 4, Figure 10). Entity: `learning_submissions / learning_assessments`.

```mermaid
stateDiagram-v2
  direction LR
  state "In Progress" as InProgress
  state "Under Review" as UnderReview
  state "Published Feedback" as PublishedFeedback
  [*] --> Draft
  Draft --> InProgress : student starts work
  InProgress --> Submitted : submit
  Submitted --> UnderReview : teacher opens review
  UnderReview --> Accepted : meets criteria
  UnderReview --> Returned : needs revision
  UnderReview --> Rejected : invalid / late
  Accepted --> PublishedFeedback : assessment released
  Returned --> InProgress : resubmit
  Rejected --> PublishedFeedback : feedback released
  PublishedFeedback --> [*]
```

> **Status: proposed.** State names are design-level. The code stores status as free-form strings (see `docs/review-2/05-tracking/repo-audit/CODE_AUDIT.md`); before sign-off, map each state here to the persisted value or rename it to match.
