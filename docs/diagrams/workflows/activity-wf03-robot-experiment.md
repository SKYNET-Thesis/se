# Activity Diagram — WF-03 — Robot Experiment Execution

Source: draw.io page 06 (Report 4, Figure 06). Swimlanes are Mermaid subgraphs, one per actor / system.

```mermaid
flowchart TB
  subgraph lane0["Student"]
    n72(("Start"))
    n73["Open<br/>Experiment"]
    n80["View Result"]
    n81["View Error"]
    n82((("End")))
  end
  subgraph lane1["VISTA Web"]
    n74["Send Run<br/>Request"]
  end
  subgraph lane2["Backend API"]
    n75["Validate Auth,<br/>Assignment, Robot"]
    n78["Store Result<br/>+ Evidence"]
    n79{"Success?"}
  end
  subgraph lane3["Robot Runtime"]
    n76["Execute<br/>Program"]
    n77["Return Status<br/>+ Telemetry"]
  end
  n72 --> n73
  n73 -->|"Run"| n74
  n74 --> n75
  n75 -->|"Authorized"| n76
  n76 --> n77
  n77 --> n78
  n78 --> n79
  n79 -->|"Yes"| n80
  n79 -->|"No"| n81
  n80 --> n82
  n81 --> n82
```
