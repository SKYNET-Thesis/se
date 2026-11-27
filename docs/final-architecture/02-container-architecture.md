# 2. Container architecture

```mermaid
flowchart TB
  subgraph Browser
    WEB[Web SPA<br/>React + Vite, web/robot-edu]
  end
  subgraph AWS_edge[AWS edge]
    CF[CloudFront<br/>/ → S3 web, /api/v1/* → API origin]
    S3W[(S3 web bucket, private, OAC)]
    S3M[(S3 media + evidence bucket)]
  end
  subgraph EC2[EC2 t-class host, single instance, docker]
    NGX[nginx :80/443<br/>/api/v1/ → 127.0.0.1:3000]
    API[vista-education-api<br/>NestJS + Prisma :3000]
    FW[vista-iot-feedback-worker<br/>SQS consumer]
    RW[vista-recordings-worker<br/>SQS consumer]
    TWIN[vista-digital-twin<br/>FastAPI :8767, private vista-net, mode mock/relay]
  end
  PG[(PostgreSQL 17<br/>hosted Supabase)]
  AUTH[Supabase Auth]
  subgraph IoT[AWS IoT Core + SQS]
    BROKER[MQTT broker]
    RULE[Topic rule → SQS feedback]
    SHADOW[Device Shadow]
    Q1[(feedback queue + DLQ)]
    Q2[(recordings queue + DLQ)]
  end
  subgraph Edge[Edge machine]
    R1[R1 runtime<br/>services/robot-runtime<br/>+ CHECKIK fake follower]
    DESK[Desktop Edge runtime<br/>vista_lab edge/runtime.py<br/>physical owner, Codex]
  end
  WEB --> CF --> S3W
  CF --> NGX --> API
  WEB -. wss /ws/twin .-> NGX
  API --> PG & AUTH & S3M
  API -->|publish run/cancel| BROKER
  API -->|GetThingShadow| SHADOW
  BROKER <-->|mTLS| R1
  BROKER <-->|mTLS, never both at once| DESK
  BROKER --> RULE --> Q1 --> FW --> PG
  FW -->|/internal telemetry relay| TWIN
  API -->|scoped viewer tokens| TWIN
  Q2 --> RW --> S3M
```

| Container | Source | Notes |
|---|---|---|
| Web SPA | `web/robot-edu` | Static bundle in S3 behind CloudFront; roles: admin, school_admin, teacher/TA, student |
| Education API | `services/education-api` | 25 controllers, 251 routes (`generated/api-routes.md`); Supabase JWT guard; SQL via Prisma raw queries |
| IoT feedback worker | `services/education-api/scripts/iot-feedback-worker.ts` | Consumes ack/status/telemetry events; simulation telemetry bridge → Twin when enabled |
| Recordings worker | same image | Physical recording events (S3 → DB) |
| Digital Twin | `services/digital-twin` | Private network only; viewer WebSocket `/ws/twin` with scoped tokens |
| R1 runtime | `services/robot-runtime` | HTTP + MQTT; fake follower via `web/checkIk/wf03_command_adapter.py`; reports `MOCK_RUNTIME` |
| Desktop Edge runtime | `leduc121/vista_lab` (Codex) | SO-101 adapter, Safety Controller, MQTT mTLS; **physical stop/execute integration pending (handoff §12, §14)** |
Only one runtime may hold the Thing's MQTT client identity at a time.
