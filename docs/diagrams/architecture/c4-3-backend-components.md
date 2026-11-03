# C4 Level 3 — Backend API Components

Source: draw.io page 03 (Report 4, Figure 03). This version maps the
design-level component names used in Report 4 to the NestJS modules that exist
in `services/education-api/src/modules`.

The diagram uses a Mermaid flowchart instead of the experimental C4 renderer so
the grouping remains readable in GitHub previews and exported report images.

```mermaid
flowchart LR
  web["Web Application"]
  db[("PostgreSQL / Supabase")]
  external["External AI Service<br/>and Local Robot Runtime"]

  subgraph api["Backend API — NestJS"]
    direction TB
    entry["Controllers and Auth Guards"]
    identity["<b>identity</b><br/>Identity and Access"]
    admin["<b>education-admin</b><br/>Organization Management<br/>Resource allocation"]
    learning["<b>learning</b><br/>Learning Workflow · Progress and Reporting<br/>Experiment Orchestrator · Evidence and Audit<br/>Runtime Gateway"]
    metadata["<b>metadata</b><br/>Resource Registry<br/>AI metadata catalogue"]
    runtime["<b>runtime</b><br/>Read-only CHECKIK adapter"]
    operations["<b>health + status</b><br/>Operational endpoints"]
    aiAdapter["AI Service Adapter<br/><b>planned</b>"]

    entry --> identity
    entry --> admin
    entry --> learning
    entry --> metadata
    entry --> runtime
    entry --> operations
    learning -->|"model metadata"| metadata
    learning -->|"run / status"| runtime
  end

  web -->|"HTTPS / JSON"| entry
  identity --> db
  admin --> db
  learning --> db
  metadata --> db
  learning --> external
  runtime --> external
  aiAdapter -. "future inference / training integration" .-> external

  classDef planned fill:#fff7ed,stroke:#c2410c,stroke-dasharray:5 5,color:#7c2d12
  class aiAdapter planned
```

## Design-to-code mapping

| Report 4 component | Current code owner | Status |
|---|---|---|
| Identity and Access | `identity` | Implemented |
| Organization Management | `education-admin` | Implemented |
| Learning Workflow | `learning` | Implemented |
| Progress and Reporting | `learning` | Implemented |
| Resource Registry | `education-admin` for allocation; `metadata` for model, dataset and benchmark catalogues | Partially split across implemented modules |
| Experiment Orchestrator | `learning` (`experiment.service`, `physical-execution.service`) | Implemented |
| AI Service Adapter | No write/inference provider adapter; `metadata` exposes read-only AI metadata | Planned |
| Evidence and Audit | `learning` assessment/evidence queries; `metadata` provenance reads | Partial |
| Runtime Gateway | `learning/robot-runtime.client` for execution; `runtime` for read-only CHECKIK status | Implemented boundary |
| Operational endpoints | `health`, `status` | Implemented; not a separate Report 4 business component |
