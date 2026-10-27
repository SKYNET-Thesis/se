# Activity Diagram — WF-01 — School Administration & Robot Resource Allocation

Source: draw.io page 04 (Report 4, Figure 04). Swimlanes are Mermaid subgraphs, one per actor / system.

```mermaid
flowchart TB
  subgraph lane0["School Admin"]
    n12(("Start"))
    n13["Open<br/>School Admin"]
    n16["Choose Robot<br/>and Allocate"]
  end
  subgraph lane1["VISTA Web"]
    n14["Select<br/>Classroom"]
    n15["Display Eligible<br/>Robot Resources"]
  end
  subgraph lane2["Backend API"]
    n17["Validate Scope,<br/>Entitlement, Conflict"]
    n18{"Valid?"}
    n19["Create Classroom<br/>Robot Allocation"]
    n21["Reject Request<br/>403 / 404 / 409"]
  end
  subgraph lane3["Instructor"]
    n20["View Allocated<br/>Robot"]
    n22((("End")))
  end
  n12 --> n13
  n13 -->|"Open classroom"| n14
  n14 -->|"Load data"| n15
  n15 -->|"Choose robot"| n16
  n16 -->|"Submit"| n17
  n17 --> n18
  n18 -->|"Yes"| n19
  n18 -->|"No"| n21
  n19 -->|"Allocation visible"| n20
  n20 --> n22
```
