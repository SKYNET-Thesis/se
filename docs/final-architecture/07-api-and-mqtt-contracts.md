# 7. API and MQTT contracts

## 7.1 HTTP API
Full route inventory: [`generated/api-routes.md`](generated/api-routes.md) (251 routes, generated from the controllers). Conventions: base `https://api.skynex.best/api/v1`; JSON; `Authorization: Bearer <Supabase JWT>`; validation by class-validator DTOs with whitelist; errors are `{code?, message, statusCode}`. Business conflict codes of the robotics path: `LAB_SESSION_NOT_ACTIVE`, `ROBOT_RESERVED_BY_ANOTHER_CLASSROOM`, `ROBOT_IN_USE`, `ROBOT_STOP_UNCONFIRMED`, `ROBOT_NOT_ALLOCATED`, `ROBOT_ENTITLEMENT_INVALID`, `SYMBOLIC_PASS_REQUIRED`, `LAB_SESSION_SCHEMA_NOT_READY` (503 until migration S), `MULTI_ROBOT_ALLOCATION_NOT_ENABLED`, `ROBOT_ALREADY_ALLOCATED`, `LAB_SESSION_OPEN`.

Key routes by workflow:

| WF | Route | Purpose |
|---|---|---|
| WF01 | `GET/POST/PATCH /education-admin/robots`, `POST/DELETE /education-admin/robots/:id/entitlements` | Robot Resources, entitlement (System Admin) |
| WF01 | `GET /education-admin/classrooms/:id/eligible-robots`, `POST/DELETE …/robot-allocations[/:robotId]` | School Admin allocation |
| WF01/03 | `GET/POST /classrooms/:id/lab-sessions`, `GET /classrooms/:id/lab-robots`, `POST /lab-sessions/:id/{extend,stop-execution,end,force-end}` | Classroom Lab Session |
| provisioning | `POST /education-admin/organizations/:id/user-imports/parse-file`, `…/user-imports` (kind students), `…/students/:userId/temporary-password/reissue` | student accounts |
| auth | `POST /auth/students/login`, `PATCH /auth/students/password`, `POST /auth/students/recover` | student sign-in and mandatory change |
| WF03 | `GET /me/attempts/:id/physical-execution-eligibility`, `POST …/physical-executions/start`, `GET /me/physical-executions/:id`, `…/stop` | eligibility, start, status |
| WF03 | `POST /internal/…` (feedback/Twin relay, not public) | worker → Twin |

## 7.2 MQTT contract (canonical: `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md`)
Broker `am09ew70geib4-ats.iot.ap-southeast-1.amazonaws.com:8883`, mutual TLS, MQTT 3.1.1, **client id = Thing name `vista-demo-<robot uuid>`** (policy allows only this id). Topic prefix `vista/demo/robots/<robot uuid>`.

| Topic | Direction | Content |
|---|---|---|
| `…/commands` | API → Edge (QoS 1) | `{schemaVersion:1, kind:"run"\|"cancel", commandId, robotId, sequence (issue time ms), issuedAtMs, expiresAtMs (TTL ≤ 60 s, default 10 s), payload}` |
| `…/ack` | Edge → API | `{kind:"ack", status:"accepted"\|"rejected", commandId, eventId:"<id>:ack:<status>", sequence, occurredAtMs, code?}` |
| `…/status` | Edge → API | `{kind:"status", status:"executing"\|"completed"\|"failed"\|"telemetry"\|"physical_telemetry", commandId, eventId, sequence, occurredAtMs, code?, telemetry?}` |
| `$aws/things/<thing>/shadow/{get,update}` | Edge ↔ AWS | `reported`: `schemaVersion, connection, runtimeKind (MOCK_RUNTIME\|PHYSICAL_ROBOT), hardwareEnabled, stopped, activeRunId, lastCommandSequence, adapterMode, armed, calibrationReady, fault, reportedAtMs` (heartbeat ≤ 10 s) |

* **run payload** `{runId, robotId, programVersionId, profile:"lesson", program:{kind:"robot_program", schemaVersion:1, steps[]}}`; allowed steps `arm.select, home, gripper.open, gripper.close, wait`; no joint/servo/trajectory/setpoint/velocity/torque content.
* **cancel payload** `{targetCommandId, runId, reason}`: bound to robot, target command's run and an **active** run; a stale/wrong/duplicate cancel is rejected. The ACK is never proof of a stop; the target command's terminal status published by the Edge after its local safe stop is.
* Edge rules: reject retained, expired, replayed (sequence ≤ last), duplicate (persisted dedupe), or malformed commands; never resume a run after reconnect; Emergency Stop is local and independent.
* **Simulation telemetry** is `status:"telemetry"` frames (six-joint SO-101 contract) correlated to the command; **physical telemetry** (`physical_telemetry`) is separate and disabled. Start gates: simulation requires a fresh connected `MOCK_RUNTIME` with `hardwareEnabled=false`; physical commissioning (disabled) requires approved robot/user/window, armed, calibrated, declared physical adapter mode.
* Cloud infrastructure: one topic rule (ack/status → SQS feedback + DLQ), one scoped IoT policy, recordings queue for physical recordings.
