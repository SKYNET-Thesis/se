# WF-03 Gate 1: Physical authorization and session ownership

Gate 1 prepares persistent ownership for a future physical execution. It does
not call Robot Runtime, CHECKIK, VR, or hardware, and it does not expose the
physical controls in the Student application.

## Authoritative provenance

The Education API resolves the complete chain from authenticated state and the
Attempt ID:

```text
active Student organization membership
→ active Student classroom membership
→ published ClassroomAssignment
→ owned Attempt
→ owned submitted Submission
→ Submission.program_version_id
→ immutable LearningProgramVersion.robot_program
→ matching persisted SymbolicEvaluation with verdict=passed
→ Classroom Robot Allocation
→ currently valid Organization→Robot entitlement
→ Robot
```

The browser cannot provide the executable program, authoritative
ProgramVersion, Submission, Classroom, Organization, or Robot. A changed
mutable `learning_programs` row does not alter the executable candidate.

The Gate 1 version policy is deliberately exact rather than latest: the
candidate is the submitted `program_version_id` with matching persisted PASS
evidence. Changed work must go through the existing create version, submit,
schematic execution, and symbolic evaluation flow before it can become a new
candidate.

## Allocation and ownership

WF-01 allocation answers which Robot a Classroom may use. It is not a booking,
availability result, or runtime lock. Gate 1 revalidates the Robot entitlement
at acquisition time and creates a `control_sessions` row to represent current
execution ownership.

Runtime readiness is intentionally absent. The Control Session starts in
`created`, has no `started_at` or readiness reference, and records
`runtimeStarted=false`. A new `learning_experiments` row uses
`execution_mode=physical` and `status=pending`; the prior schematic Experiment
is never reused or mutated.

## Concurrency and idempotency

Acquisition runs inside one Prisma transaction. PostgreSQL
`pg_advisory_xact_lock(hashtextextended(robot_id::text, 0))` creates a stable
signed 64-bit lock key from the complete Robot UUID. The lock is released by
commit or rollback. A hash collision can only serialize unrelated Robots; it
cannot allow concurrent ownership of the same Robot.

After acquiring the lock, the service reloads allocation, entitlement, scope,
and evidence. It then checks for a non-terminal Control Session on that Robot.
The centralized terminal set is:

- `released`
- `completed`
- `succeeded`
- `failed`
- `cancelled`
- `stopped`
- `timed_out`
- `preflight_failed`

An equivalent active Student/Attempt/Submission/ProgramVersion request returns
the existing physical Experiment. A different request receives `ROBOT_BUSY`.
Control Session, physical Experiment, provenance metadata, and initial event
are committed atomically, so rollback cannot leave ownership behind.

## API

- `GET /me/attempts/:attemptId/physical-execution-eligibility`
- `POST /me/attempts/:attemptId/physical-executions`

Both endpoints are Supabase-authenticated. The POST body is empty. Responses
contain only safe Classroom, Robot display identity, ProgramVersion and
symbolic evidence identifiers. Runtime addresses, tokens, ports, credentials,
canonical commands, and infrastructure errors are not returned.

## Known limitations

- Robot Runtime and CHECKIK are not called.
- No physical motion is started.
- Runtime availability and DB Robot→runtime mapping are unresolved.
- Restart reconciliation, heartbeat, lease expiry, and whole-run timeout are
  deferred.
- A `blockly` Control Mode and a Student safety profile permitting `blockly`
  must already exist; Gate 1 fails closed rather than inventing policy data.
- An explicit physical-execution permission may be introduced as later
  hardening. Gate 1 reuses `learning.experiment.execute` as approved.
