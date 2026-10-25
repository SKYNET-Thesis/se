# WF-03 Gate 2 + Gate 3 Runtime and Fake-Follower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an authoritative offline physical-execution path from Student to an explicitly configured CHECKIK fake follower, including persisted lifecycle, Stop, reconciliation, and reload-safe UI.

**Architecture:** The browser calls only the Education API. The API resolves immutable evidence and a server-owned Robot mapping, then calls authenticated R1; R1 validates the canonical program and delegates checked commands to an explicit CHECKIK fake-follower adapter. Persistent Experiment and Control Session rows remain the business authority.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Python standard-library HTTP runtime, CHECKIK Python safety seam, React, TanStack Query, Jest, Vitest, unittest/pytest.

**Spec:** `docs/superpowers/specs/2026-10-25-wf03-gate2-3-runtime-fake-follower-design.md`

## Global Constraints

- No database migration unless the existing JSON metadata/snapshot fields are proven insufficient; stop if schema blocks correctness.
- Never send runtime configuration, credentials, canonical commands, or hardware identities to the browser.
- Do not mutate the unverified remote Supabase database for synthetic verification.
- Preserve WF-01, WF-02, Gate 1, legacy VR, and schematic Experiment behavior.
- Do not call a real follower or silently fall back between fake and real modes.

---

### Task 1: Checked CHECKIK fake-follower command boundary

**Files:**
- Create: `web/checkIk/wf03_command_adapter.py`
- Create: `web/checkIk/tests/test_wf03_command_adapter.py`

**Interfaces:**
- Produces: a local authenticated command API with status, execute, cancel, and stop operations; explicit `fake_follower` mode only.

- [ ] Write failing tests proving explicit fake mode, no fallback, readiness/motion-lock enforcement, canonical gripper/wait execution, cancellation, timeout, and sanitized failure.
- [ ] Run the focused pytest file and confirm failures are caused by the absent adapter.
- [ ] Implement the minimal fake-follower adapter without importing/opening a real hardware driver.
- [ ] Re-run focused tests until green.

### Task 2: R1 checked adapter and lifecycle

**Files:**
- Modify: `services/robot-runtime/src/runtime.py`
- Modify: `services/robot-runtime/src/server.py`
- Modify: `services/robot-runtime/tests/test_runtime.py`
- Modify: `services/robot-runtime/config/runtime.example.json`

**Interfaces:**
- Consumes: CHECKIK status/execute/cancel contract from Task 1.
- Produces: idempotent `/runs`, `/runs/:id`, `/runs/:id/cancel`, deadline enforcement, sanitized terminal result/events.

- [ ] Add failing tests for explicit adapter configuration, canonical command delegation, no fallback, cancellation, deadline, unavailable/safety-locked CHECKIK, idempotent run ID, and single active run.
- [ ] Run runtime tests and verify the expected red state.
- [ ] Add a small adapter client and replace the deliberate `hardware_adapter_not_installed` guard only for explicitly configured fake mode.
- [ ] Re-run runtime tests until green.

### Task 3: Private Education API runtime client

**Files:**
- Create: `services/education-api/src/modules/learning/robot-runtime.client.ts`
- Create: `services/education-api/src/modules/learning/robot-runtime.client.spec.ts`
- Modify: `services/education-api/.env.example`

**Interfaces:**
- Produces: `createRun`, `getRun`, `cancelRun`, and readiness methods resolved from a server-only Robot mapping.

- [ ] Write failing tests for bearer auth, server mapping, missing mapping, timeouts, unavailable runtime, and sanitized errors.
- [ ] Run the focused Jest suite and verify red.
- [ ] Implement the allow-listed client with `AbortSignal.timeout` and no request-controlled URL.
- [ ] Re-run until green.

### Task 4: Persistent physical execution lifecycle

**Files:**
- Modify: `services/education-api/src/modules/learning/physical-execution.service.ts`
- Modify: `services/education-api/src/modules/learning/physical-execution.controller.ts`
- Modify: `services/education-api/src/modules/learning/learning.module.ts`
- Modify: `services/education-api/src/modules/learning/physical-execution.service.spec.ts`
- Modify: `services/education-api/src/modules/learning/physical-execution.controller.spec.ts`

**Interfaces:**
- Consumes: Gate 1 physical Experiment and `RobotRuntimeClient`.
- Produces: authoritative start/status/stop/recovery DTOs with centralized transition persistence.

- [ ] Write failing tests for exact ProgramVersion/PASS recheck, server-owned run ID, double-start idempotency, ownership/cross-org denial, queued/running/terminal persistence, Stop, timeout, lost-run reconciliation, persistence failure, and no replay.
- [ ] Run focused Jest suites and verify red.
- [ ] Implement start, status/reconcile, stop, recovery, transition-event deduplication, and sanitized DTOs using existing metadata/snapshots.
- [ ] Re-run focused suites until green.

### Task 5: Authoritative Student physical UI

**Files:**
- Modify: `web/robot-edu/src/lib/api.ts`
- Modify: `web/robot-edu/src/lib/robotExecution.ts`
- Modify: `web/robot-edu/src/pages/Practice.tsx`
- Create: `web/robot-edu/src/queries/physicalExecutionQueries.ts`
- Create: `web/robot-edu/src/queries/physicalExecutionQueries.spec.tsx`

**Interfaces:**
- Consumes: Education API eligibility/start/status/stop/recovery endpoints only.
- Produces: confirmation, polling, Stop, terminal evidence, and reload recovery UI.

- [ ] Add failing tests for authoritative visibility, confirmation, double-click protection, Education-API-only polling, lifecycle states, Stop, reload recovery, and absence of direct R1/CHECKIK calls.
- [ ] Run focused Vitest tests and verify red.
- [ ] Implement classroom/Attempt-scoped TanStack Query hooks and update Practice UI without global physical enablement.
- [ ] Re-run focused tests until green.

### Task 6: Offline verification, documentation, and regression

**Files:**
- Create: `docs/education/wf03-gate2-3-runtime-fake-follower.md`
- Modify only test harness/config files proven necessary by the process-level offline test.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: reproducible configuration and evidence report with deferred live-DB and real-hardware boundaries.

- [ ] Run CHECKIK relevant tests and R1 full tests.
- [ ] Run API full tests/build and Prisma validation.
- [ ] Run web full tests/build.
- [ ] Run a process-level fake-follower chain where the environment permits; otherwise record `HOST_TEST_DEFERRED` without fabricating results.
- [ ] Run `git diff --check`, document exact results and known limitations, and confirm no migration exists.
