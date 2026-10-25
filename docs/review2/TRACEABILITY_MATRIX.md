# Review 2 traceability matrix

Current Registration FR-01…FR-06 do not identify education WF-01…04; no IDs are invented.

| FR | Workflow/actor | UI | API/service | Entity/transition | Test/evidence | Status |
|---|---|---|---|---|---|---|
| NO_FORMAL_FR_ID | WF-01 Admin | school classrooms | allocation service | absent→allocated/replaced | API/web | VERIFIED |
| NO_FORMAL_FR_ID | WF-02 Teacher | classroom detail | assignment delivery | draft→published | API/web | VERIFIED |
| NO_FORMAL_FR_ID | WF-02 Student | my learning | programming/submission | attempt→submitted; immutable version | API/web | VERIFIED |
| NO_FORMAL_FR_ID | WF-03 Student symbolic | workspace | evaluator | pending→terminal | API/web | VERIFIED |
| NO_FORMAL_FR_ID | WF-03 Student physical | workspace | physical service/runtime | experiment/session→terminal | API/runtime/adapter + prior fake-follower E2E | VERIFIED |
| NO_FORMAL_FR_ID | WF-04 Instructor/Student | evidence/feedback | assessment service | review/assessment/reflection recorded | API/web | VERIFIED |

Trust boundary: Supabase JWT → NestJS guards → business scope → Prisma; runtime calls are server-to-server.
