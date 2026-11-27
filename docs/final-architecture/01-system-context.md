# 1. System context

```mermaid
flowchart LR
  subgraph People
    SA[System Administrator]
    SCH[School Administrator]
    INS[Instructor / Teaching Assistant]
    STU[Student]
    OPS[Edge operator]
  end
  VISTA[["VISTA platform<br/>Education Platform + Digital Twin + Edge runtimes"]]
  SUPA[(Supabase Auth<br/>hosted, project ovijut…)]
  AWSIOT[AWS IoT Core<br/>MQTT 8883 mTLS + Device Shadow]
  S3[(S3 / CloudFront<br/>web + media + evidence)]
  DESK[VISTA Lab Station Desktop<br/>leduc121/vista_lab, Codex]
  ROBOT{{SO-101 follower arm<br/>physical, supervised only}}
  SA & SCH & INS & STU -->|HTTPS skynex.best| VISTA
  VISTA -->|JWT verification, admin API| SUPA
  VISTA -->|publish run/cancel, read Shadow, SQS| AWSIOT
  AWSIOT <-->|MQTT mTLS| DESK
  OPS --> DESK
  DESK -->|exclusive serial| ROBOT
  VISTA --> S3
```

**Actors and trust boundaries.** The Education API is authoritative for organization entitlement, classroom allocation, Classroom Lab Session, student eligibility and experiment authorization. The Edge runtime is authoritative for hardware safety, exclusive physical control, watchdog, emergency stop and safe termination. Browsers never talk to AWS IoT or the robot. **Phase A (accepted configuration):** the Edge is R1 + CHECKIK fake follower (`MOCK_RUNTIME`, `hardwareEnabled=false`); physical commissioning is disabled.
