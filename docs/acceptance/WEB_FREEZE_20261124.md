# Web freeze acceptance, 2026-11-24

Tested tree: `release/web-freeze-20261124` = develop `5313e79` (PRs #189 to #192 merged) + homepage SO-101 3D work (`c622bb7`) + PR #193 (`a991468`, open when tested).
Everything ran on disposable loopback stacks (PostgreSQL 17, RustFS S3, real GoTrue, R1 + CHECKIK fake follower, Digital Twin). No Production system, AWS resource or physical robot was touched.

## Results

| Check | Result |
| --- | --- |
| Web `tsc --noEmit`, `vite build` | pass |
| Web Vitest | 120 files, 793 passed, 0 failed |
| Web ESLint | 0 errors (warnings pre-existing) |
| API `tsc`, Jest with PostgreSQL + S3 | 128 suites passed, 5 skipped; 1361 tests passed, 40 skipped, 0 failed |
| Playwright main suite (real API + PostgreSQL) | 183 passed, 2 skipped (opt-in), 4 failed on first pass: all four were harness configuration, none a product failure (below) |
| Re-run of those four with the correct harness | `lms-course-offerings` 2/2, `wf03-runtime-evidence` 1/1 (real R1 + CHECKIK fake follower + Twin) |
| Real GoTrue: browser student/staff auth | 11 passed |
| Real GoTrue: API student auth/session | 13 passed |
| Real GoTrue: invite security + system admin | 15 passed, 1 skipped |
| R1 runtime unittest / hardware adapter pytest / Digital Twin pytest | 16 OK / 19 passed / 59 passed |
| Homepage 3D (real GPU, DPR 1 and 2) and software GL | see `docs/operations/evidence/homepage-so101-20261124/perf-summary.json` |

The four first-pass failures: two specs need the GoTrue proxy credentials (`VISTA_E2E_GOTRUE_*`) that the harness did not export; WF-03 needs R1, the adapter and the API runtime map; and `lms-course-offerings` looked for the seeded course within the first 100 courses after the Jest database suites had created 300 more in the same database. All pass on a correctly prepared stack.

## Workflows (SRS)

| Workflow | Evidence | Verdict |
| --- | --- | --- |
| WF-01 School Admin allocates a robot to a classroom; permissions, conflicts, instructor visibility | `lms-independent` (allocation, instructor sees it, cross-school denied), `lms-robot-lab-access`, `digital-twin-revocation` (reallocation) | GO |
| WF-02 learner programs in Blockly | `blockly-simulation`, `lms-beginner-lab` | GO |
| WF-03 simulation / fake-follower evidence | `blockly-simulation`, `wf03-runtime-evidence` (real R1 + CHECKIK fake follower), Twin viewer specs | GO for simulation and fake follower. Physical robot: not tested, excluded |
| WF-04 review, release, reflection | `lms-beginner-lab`, `lms-independent` (assess and return), reflection gated by assessment | GO |
| Cross-module journey Course, Offering, Classroom, Robot Allocation, Assignment, Simulation, Evidence, Review, Reflection | `lms-course-offerings`, `lms-offering-enrollment-limits`, `lms-beginner-lab` | GO |

## Not verified here (needs the owner or Production access)

Production Supabase configuration and real email delivery; Production environment variables; Desktop installers (none built or published); physical SO-101 hardware.
Observed read-only on the public Production URL: the CloudFront distribution answers without HSTS, CSP, X-Content-Type-Options or X-Frame-Options headers and without `Cache-Control`, and an unknown asset path returns a 403 XML error rather than the application. Production serves an older build (object last modified 2026-11-21).
