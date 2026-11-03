# Proposed State Transition Test Inventory

This inventory supports the BM01 proposal. It contains 40 valid transitions
from the four design state machines plus eight representative invalid
transitions that must be rejected. The proposed count is not evidence that the
tests have run, and design labels still require mapping to persisted values.

## Experiment session

| Test ID | Transition | Expected |
|---|---|---|
| ST-EXP-01 | Requested → Authorized | Allowed when scope and permission pass |
| ST-EXP-02 | Requested → Rejected | Allowed when scope or permission fails |
| ST-EXP-03 | Authorized → Queued | Allowed after resource allocation |
| ST-EXP-04 | Queued → Running | Allowed when runtime is available |
| ST-EXP-05 | Queued → Cancelled | Allowed before run |
| ST-EXP-06 | Running → Completed | Allowed on successful terminal result |
| ST-EXP-07 | Running → Failed | Allowed on runtime error |
| ST-EXP-08 | Running → Cancelled | Allowed on stop or timeout |
| ST-EXP-09 | Completed → Archived | Allowed by retention/close action |
| ST-EXP-10 | Failed → Archived | Allowed after outcome recording |
| ST-EXP-11 | Cancelled → Archived | Allowed after outcome recording |
| ST-EXP-12 | Requested → Completed | Rejected because authorization/execution were skipped |
| ST-EXP-13 | Archived → Running | Rejected because archived is terminal |

## Robot execution

| Test ID | Transition | Expected |
|---|---|---|
| ST-RUN-01 | Idle → Ready Check | Allowed on run command |
| ST-RUN-02 | Ready Check → Reserved | Allowed when safety checks pass |
| ST-RUN-03 | Ready Check → Not Ready | Allowed when safety checks fail |
| ST-RUN-04 | Reserved → Executing | Allowed when execution begins |
| ST-RUN-05 | Executing → Uploading Evidence | Allowed after task completion |
| ST-RUN-06 | Uploading Evidence → Completed | Allowed after artifact persistence |
| ST-RUN-07 | Executing → Stopped | Allowed on emergency stop |
| ST-RUN-08 | Executing → Failed | Allowed on execution error |
| ST-RUN-09 | Not Ready → Idle | Allowed after reset/retry |
| ST-RUN-10 | Stopped → Idle | Allowed after resource release |
| ST-RUN-11 | Failed → Idle | Allowed after recovery/release |
| ST-RUN-12 | Completed → Idle | Allowed when session closes |
| ST-RUN-13 | Idle → Executing | Rejected because readiness/reservation were skipped |
| ST-RUN-14 | Completed → Executing | Rejected because a new authorized session is required |

## Learning submission

| Test ID | Transition | Expected |
|---|---|---|
| ST-SUB-01 | Draft → In Progress | Allowed when learner starts work |
| ST-SUB-02 | In Progress → Submitted | Allowed on eligible submission |
| ST-SUB-03 | Submitted → Under Review | Allowed when authorized teacher opens review |
| ST-SUB-04 | Under Review → Accepted | Allowed when criteria are met |
| ST-SUB-05 | Under Review → Returned | Allowed when revision is requested |
| ST-SUB-06 | Under Review → Rejected | Allowed for invalid/late submission under agreed rule |
| ST-SUB-07 | Accepted → Published Feedback | Allowed when assessment is released |
| ST-SUB-08 | Returned → In Progress | Allowed for resubmission |
| ST-SUB-09 | Rejected → Published Feedback | Allowed when rejection feedback is released |
| ST-SUB-10 | Draft → Accepted | Rejected because submission/review were skipped |
| ST-SUB-11 | Published Feedback → In Progress | Rejected unless a new attempt is created |

## Classroom assignment

| Test ID | Transition | Expected |
|---|---|---|
| ST-ASG-01 | Draft → Scheduled | Allowed when teacher schedules work |
| ST-ASG-02 | Scheduled → Published | Allowed on publish action |
| ST-ASG-03 | Published → Open | Allowed when availability begins |
| ST-ASG-04 | Open → Closed | Allowed when deadline/close time is reached |
| ST-ASG-05 | Closed → Archived | Allowed by archival action |
| ST-ASG-06 | Scheduled → Cancelled | Allowed before publication |
| ST-ASG-07 | Published → Cancelled | Allowed on withdrawal under agreed rule |
| ST-ASG-08 | Cancelled → Archived | Allowed after record retention |
| ST-ASG-09 | Draft → Open | Rejected because scheduling/publication were skipped |
| ST-ASG-10 | Archived → Published | Rejected because archived is terminal |

## Count used by BM01

| Category | Count |
|---|---:|
| Valid transitions | 40 |
| Invalid transitions that must be rejected | 8 |
| Proposed transition tests | 48 |

