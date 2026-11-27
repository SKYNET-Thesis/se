# 4. Consolidated use case model

```mermaid
flowchart LR
  SA((System Admin)) --- UC1[Manage organizations and School Administrators]
  SA --- UC2[Register / edit / disable / retire Robot Resource]
  SA --- UC3[Grant / revoke organization entitlement]
  SA --- UC4[Provision student accounts for a school: XLSX/CSV]
  SA --- UC5[Course catalogue and global Question Bank]
  SCH((School Admin)) --- UC6[Manage school users, classrooms, offerings]
  SCH --- UC4
  SCH --- UC7[Allocate / remove robots per classroom]
  SCH --- UC8[Controlled Force End of a Lab Session]
  SCH --- UC9[Reissue student temporary password]
  INS((Instructor)) --- UC10[Create, publish, grade assignments and quizzes]
  INS --- UC11[Start / extend / Stop Execution / end Lab Session]
  INS --- UC12[Review student evidence and give feedback]
  STU((Student)) --- UC13[Sign in with school code + student code]
  STU --- UC14[Mandatory first-login password change]
  STU --- UC15[Learn, take quizzes, program with Blockly, submit]
  STU --- UC16[Run an authorized robot experiment, watch Digital Twin]
  STU --- UC17[View results, evidence and released grades]
  EDGE((Edge runtime)) --- UC18[Receive run/cancel, ACK, report status, telemetry, Shadow]
```

| Use case | Actor | Implemented by (source) | Rule that matters |
|---|---|---|---|
| UC2, UC3 | System Admin | `education-admin/robot-resource.*`, web `/admin/robots` | resources retired, entitlements ended; never deleted; not shown as connected/ready |
| UC4 | System Admin, School Admin | `education-admin` `importUsers` + `parse-file`, web `/admin/students`, `/school/import` | organization from authorized context; random one-time passwords; idempotent; preview creates nothing |
| UC7 | School Admin | `EducationAdminService.allocateRobot/removeRobotAllocation` | many-to-many; entitlement required; allocation grants eligibility only |
| UC11 | Instructor | `learning/lab-session.*`, web classroom panel | one open reservation per robot (DB unique index); reserving never arms or moves hardware |
| UC8 | School Admin | `LabSessionService.forceEnd` | reason + confirmation; same safe termination; cannot override a physical safety state |
| UC14 | Student | `student-auth.*`, web `/student/change-password` | restricted session until the change; deep links and API blocked |
| UC16 | Student | `learning/physical-execution.service.ts` | Blockly prerequisite + symbolic PASS + entitlement + allocation + open Lab Session of the student's classroom + safety profile + fresh runtime |
| UC12 | Instructor | `learning/assessment.*`, evidence services | evidence is metadata/artifacts; no AI assessment is registered |
| UC18 | Edge | `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` | Edge owns safety; ACK/terminal status rules in §7 |
