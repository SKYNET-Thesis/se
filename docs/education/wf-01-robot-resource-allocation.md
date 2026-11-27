# WF-01 Robot Resource Allocation

School Admins may allocate only a Robot Resource entitled to their classroom's organization. The allocation is a standing authorization, not runtime execution, booking, or reservation. A classroom has one allocation; allocating another eligible robot atomically replaces it. The current implementation does not create runtime sessions, command CHECKIK, or move hardware.

See `wf-01-robot-resource-allocation.puml` for the implemented flow.

## Refinement 2026-11-27: Robot Resource management, many-to-many allocation and the Classroom Lab Session

This refines WF-01 (allocation) and the authorization step of WF-03 (execution). It is not a new capstone workflow, and WF-01..WF-04 keep their names and behaviour. Source: staged migration `database/staged-migrations/20261127_s_classroom_lab_sessions.sql`, `LabSessionService`, `RobotResourceService`, `EducationAdminService.allocateRobot/removeRobotAllocation`, `PhysicalExecutionService.resolveScope`.

### Responsibilities
| Actor | May | May not |
|---|---|---|
| System Admin | Register/edit/disable/retire a logical Robot Resource (`robots`), grant/revoke an organization entitlement (`org_entitlements`), inspect allocations and open sessions | Create AWS infrastructure, certificates or credentials from the UI; delete a resource or entitlement (history is kept) |
| School Admin | See robots entitled to their organization, allocate/remove them to its classrooms, controlled Force End of an abandoned session of its own organization (reason + confirmation) | Create global resources, grant entitlements, start a session, override a physical safety state |
| Instructor (classroom teacher with `education.lab_session.manage`) | Start, extend, end a Lab Session of a classroom they teach | Reserve a robot that is not allocated/entitled/available, or that another classroom holds |
| Student | Run on the robot **only** while their classroom holds an open session | Create, extend or end a session |

### Rules
- **Entitlement** (organization may use the resource) → **Allocation** (classroom is eligible; many-to-many: `UNIQUE(classroom_id, robot_id)`, `robot_id` not unique) → **Lab Session** (one classroom holds the robot exclusively for a bounded, supervised period). Allocation never grants control.
- **Layer A** — at most one open (`active`, `terminating`, `quarantined`) reservation per robot across all classrooms and organizations: partial unique index `ux_classroom_lab_sessions_one_open_per_robot` plus the per-robot advisory lock `hashtextextended(robot,0)` that `PhysicalExecutionService.prepare()` already takes. **Layer B** — at most one unfinished individual control session per robot (existing `control_sessions` rule, unchanged). Start Lab Session, a student Run and End/expiry therefore serialize.
- Starting a session **never arms hardware and never sends a command**; it reserves. Duration: default 120 min (`VISTA_LAB_SESSION_DEFAULT_MINUTES`), extension 5–60 min (`…_MAX_EXTENSION_MINUTES`), total ≤ 480 min (`…_MAX_TOTAL_MINUTES`). Expiry is judged on database time.
- Student start additionally requires an open session of the student's classroom for the allocated robot: `LAB_SESSION_NOT_ACTIVE` (none), `ROBOT_RESERVED_BY_ANOTHER_CLASSROOM` (another classroom holds it; the other classroom is never named). All existing checks stay: authentication, membership, assignment, Blockly prerequisite, entitlement, allocation, safety profile, runtime readiness, command authorization.
- **Disconnects.** Student stop/logout/disconnect finalizes only the individual control session; the reservation stays and another student of the same classroom may start once control is released. Edge/robot disconnect blocks new execution (existing watchdog and safe stop), keeps the reservation, never transfers it and never resumes motion on reconnect. Emergency Stop does not release the reservation.
- **End / Force End / expiry / entitlement revocation / robot disabled** use one idempotent controlled termination: `active → terminating` (no new runs), ask the runtime to stop an unfinished run, release (`released`) **only when the robot has no unfinished control session**. If the runtime cannot confirm the stop the session becomes `quarantined` (robot stays blocked, "Retry release" / recovery message); there is no force unlock. Removing an allocation while the classroom holds an open session is refused (`LAB_SESSION_OPEN`).
- Derived robot states for the UI (separate fields on the server: connectivity, reservation, control ownership, safety): Offline, Available, Reserved for this classroom, Reserved by another classroom, In use, Ending session, Safety blocked, Unavailable.

### API
`GET/POST /classrooms/:id/lab-sessions`, `GET /classrooms/:id/lab-robots`, `POST /lab-sessions/:id/{extend,end,force-end}`; `POST/DELETE /education-admin/classrooms/:id/robot-allocations[/:robotId]` (the old `PUT …/robot-allocation` remains and now adds); `GET/POST/PATCH /education-admin/robots`, `POST/DELETE /education-admin/robots/:id/entitlements[/:entitlementId]`. Optional sweep: `VISTA_LAB_SESSION_SWEEP_ENABLED=true` (reads also reconcile their own classroom).

### Migration and release
Additive except the single constraint relaxation (see the SQL header for compatibility and rollback). Staged, **not applied to Production**; the deployed API's `ON CONFLICT (classroom_id)` allocation upsert fails once S is applied, so S and this API build are released together. Existing robots, entitlements, allocations, experiments, recordings and evidence are untouched; no backfill.

### Desktop / Edge impact
None. The MQTT contract, command envelope, Shadow and telemetry are unchanged; reservation is decided entirely by the Education API before a command is published. The Edge remains authoritative for physical safety and exclusive serial ownership. P1–P4 (handoff §12) stand.

### Test evidence (this change)
Real PostgreSQL (`lab-session.db.spec`, `robot-resource.db.spec`, `robot-allocation.db.spec`): 18/18, including simultaneous Start from two classrooms ×5 (exactly one winner, one open row), controlled termination, quarantine, expiry, Force End authorization, entitlement revocation, retire. API unit suite 1365 passed; web 830 passed. Not run: browser E2E of the new screens and Production behaviour.
