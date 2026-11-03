# C4 Level 2 — Container Diagram

Source: draw.io page 02 (Report 4, Figure 02).

```mermaid
C4Container
  title VISTA — Containers
  System_Boundary(vista, "VISTA Learning Platform") {
    Container(web, "Web Application", "Student / Instructor / Admin UI")
    Container(api, "Backend API", "REST / authorization / orchestration")
    ContainerDb(db, "PostgreSQL (Supabase)", "Business data / experiment metadata")
    Container(storage, "Evidence Object Storage", "Video / images / run artifacts")
    Container(runtime, "Local Robot Runtime", "Safety checks / device execution / telemetry")
  }
  System_Ext(robot, "Robot Arms and Cameras", "SO-101 / USB camera")
  System_Ext(ai, "AI / Model Service", "Metadata / eligibility / inference")
  Rel(web, api, "HTTPS / JSON")
  Rel(api, db, "SQL")
  Rel(api, storage, "artifact URLs / storage API")
  Rel(api, runtime, "commands / status")
  Rel(runtime, robot, "local device interfaces")
  Rel(api, ai, "HTTPS / model metadata")
```

> **Open decision:** verify whether Local Robot Runtime is deployed inside or outside the VISTA system boundary, and distinguish intended architecture from currently running components.
