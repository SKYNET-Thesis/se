# WF-03 Gate 2 + Gate 3 Runtime and Fake-Follower Design

## Scope

Complete the offline physical-execution vertical from the authenticated Student
through the Education API and private R1 runtime to an explicitly configured
CHECKIK fake follower. Real hardware, WF-04, database migrations, the legacy VR
path, and changes to WF-01/WF-02 semantics are outside this design.

The live PostgreSQL concurrency check remains
`DB_CONCURRENCY_LIVE_TEST_DEFERRED`; the configured remote database must not be
used for synthetic fixtures until its development/test designation is proven.

## Architecture

The only supported authority path is:

`Browser -> Education API -> R1 Robot Runtime -> CHECKIK adapter -> Fake Follower`

The browser sends only the Attempt or physical Experiment identity. It never
sends canonical commands, a runtime URL, a CHECKIK URL, a robot identity, or a
runtime run identity. The Education API reloads the immutable submitted
ProgramVersion and matching symbolic PASS before starting a run.

R1 owns execution validation and lifecycle. A narrow CHECKIK command adapter
owns readiness, motion lock/E-stop checks, explicit follower selection, command
execution, cancellation, and stop. Adapter mode is explicitly `fake_follower`;
there is no fallback between fake and real targets.

## Education API

`RobotRuntimeClient` resolves Robot-to-runtime mappings exclusively from
server configuration and uses `VISTA_RUNTIME_TOKEN` with bounded HTTP timeouts.
Missing mappings and unavailable runtimes fail closed with sanitized errors.

`PhysicalExecutionService` retains Gate 1 authorization and provenance. Start,
status/reconciliation, stop, and recovery operations verify ownership and
organization scope from authenticated server context. A stable server-owned run
ID is derived from the physical Experiment. Repeated starts reuse that run.

Runtime transitions are mapped centrally to Experiment and Control Session
states. Only transitions create Experiment events. Terminal results are
sanitized and persisted before a durable terminal response is returned. If R1
loses an in-memory run, the execution fails safely and is never replayed.

## Runtime and CHECKIK

R1 preserves its canonical validation for `arm.select`, `home`,
`gripper.open`, `gripper.close`, and `wait`; preview-only Cartesian steps remain
invalid. A whole-run deadline complements per-command limits. Cancellation is
checked before and during commands.

The CHECKIK adapter accepts only the validated command envelope from R1. The
fake follower records safe command state without importing or opening a real
servo driver. Motion lock, E-stop, unavailable CHECKIK, unsupported commands,
and adapter errors all fail closed.

## Student UI

The Practice page asks the Education API for authoritative eligibility. It
shows physical controls only for eligible non-preview Attempts, requires an
explicit confirmation, polls only the Education API, supports Student-owned
Stop, and recovers the current execution after reload. Local symbolic output is
informational and never grants physical authority.

## Verification

Development follows red-green-refactor for CHECKIK/R1, Education API, and web.
Fast tests use bounded fakes at external seams. An offline process-level test
starts R1 plus the CHECKIK fake follower when the environment permits. No test
creates synthetic records in the unverified remote Supabase database.
