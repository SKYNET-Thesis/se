# Local Verification — 2026-10-27

This record distinguishes commands actually executed on the current working
tree from the proposed cases in the Review 2 test workbook. It is local
evidence only; it is not CI, staging, hardware, or tagged-release evidence.

## Revision context

- Working branch: `fix/wf02-teacher-assignment-integration`
- The working tree contained pre-existing application changes when these
  commands ran.
- `review-2` was not moved and the results below were not produced from that
  tag.

## Education API

Command: `npm test -- --runInBand` from `services/education-api/`

- Result: **PASS** outside the restricted sandbox
- Test suites: **28 passed / 28 total**
- Tests: **192 passed / 192 total**
- Snapshots: 0
- Jest-reported duration: 5.768 s

The first sandboxed run produced six `listen EPERM 127.0.0.1` failures in two
HTTP suites while 186 tests passed. The same unchanged tests were rerun with
loopback binding permitted and all 192 passed, so the first result is recorded
as an execution-environment restriction rather than an application failure.

Command: `npm run build` from `services/education-api/`

- Result: **PASS** (`tsc -p tsconfig.json`, exit code 0)

## Web application

Command: `npm test -- --run` from `web/robot-edu/`

- Result: **PASS**
- Test files: **17 passed / 17 total**
- Tests: **75 passed / 75 total**
- Vitest-reported duration: 3.15 s
- Non-failing warnings: two React Router v7 future-flag warnings

Command: `npm run build` from `web/robot-edu/`

- Result: **PASS** (exit code 0)
- Vite transformed 2,559 modules and completed in 9.09 s.
- Non-failing warning: generated chunks larger than 500 kB.

## Explicit limits

These checks do not establish physical dual-arm execution, staging deployment,
seed-script reproducibility, CI automation rate, performance NFRs, or the 82
proposed Review 2 cases as executed. Those claims remain pending or blocked in
the traceability and readiness documents.
