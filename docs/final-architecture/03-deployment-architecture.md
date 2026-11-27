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
| Production state (verified 2026-11-27 late) | Web + API + Twin `430ad59` (`/api/v1/version`, `version.json`, container image tags); migration S **applied** (run `45962239320`); Phase A flags set (`VISTA_IOT_ENABLED=true`, `START_MODE=simulation`, telemetry bridge on, physical off). `develop` additionally holds #260/#262/#261/#258 (`2d0b260`), **merged but not yet released to `main` or deployed** |
| Digital Twin deployment | Built and pushed by the `deploy-api` job as `<ecr repo>:twin-<commit>` (immutable, skipped if it exists) and started by `infra/terraform/scripts/deploy-api.sh start_twin()`; no separate Twin pipeline or approval; a missing image fails the deployment |
| Pending infrastructure change | `aws_iam_role_policy.ec2` +`ExperimentEvidenceObjectAccess` (S3 Put/Get on `learning-media/experiments/*`): reviewed plan 0 add / 1 change / 0 destroy, **not applied** (owner approval) |
| Infrastructure as code | `infra/terraform` (no apply during the freeze) |
