# 3. Deployment architecture

```mermaid
flowchart LR
  DEV[Developer / Codex PR] --> GH[GitHub: SKYNET-Thesis/se<br/>develop → main release PR]
  GH --> CI[Education CI: api, web, docker, runtime,<br/>database-safety, fresh-bootstrap]
  CI --> AD[Auto Deploy → workflow_dispatch deploy]
  AD --> GATE{schema-gate<br/>read-only compat vs manifest}
  GATE -->|ok| APPR1[aws-demo approval]
  APPR1 --> ECR[(ECR image)] --> SSM[SSM RunShellScript<br/>vista-deploy-api on EC2]
  APPR1 --> S3[(web bucket) + CloudFront invalidation]
  RB[rollback dispatch] --> RG{rollback-guard<br/>refuses once migration S exists}
  RG --> SSM
  DBREL[Production Database Release<br/>plan → backup → apply → verify] -. only path for migrations .-> PG[(Supabase PostgreSQL)]
```

| Item | Fact (from repository / verified) |
|---|---|
| Region / account | ap-southeast-1; one EC2 host (`i-0fa8cb318ce21afa5`), one Elastic IP, nginx → API :3000 |
| Edge network | host docker bridge `vista-net`: API + feedback worker + Digital Twin; Twin published on 127.0.0.1:8767 only |
| Secrets | AWS Secrets Manager `vista/demo/education-api/env`, read only by the deploy script at deploy time |
| IoT | one Thing `vista-demo-<robot uuid>`, one scoped policy, one topic rule → SQS feedback (+DLQ), recordings queue (+DLQ); certificate created by the owner on the Edge machine (key never leaves it) |
| Gates | schema gate; `aws-demo` reviewer approval per job; superseded-commit refusal; version SHA verified after deploy; **rollback-guard** (read-only) for rollback dispatch; migrations only via the approval-gated *Production Database Release* (scopes D-I, J, K-L, N, O-Q, S) |
| Production state at freeze | Web + API `60d878d`; Phase A flags set (`VISTA_IOT_ENABLED=true`, `START_MODE=simulation`, telemetry bridge on, physical off); migration S **not yet applied** |
| Infrastructure as code | `infra/terraform` (no apply during the freeze) |
