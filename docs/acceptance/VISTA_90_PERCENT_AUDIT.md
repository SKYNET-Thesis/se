# VISTA 85–90% sprint — baseline audit, evidence and completion score

Date: 2026-11-19. Branch: `sprint/vista-90` (worktree `se-sprint-90`), based on `origin/main`
`eff03d6dcb336626c3ed645dadf25475dc9278e9` (the Production commit). Nothing here was deployed, merged to `main`, or applied
to Production, AWS, Supabase or hardware. The Desktop workspace (`vistadesktop/vista-lab-station`) was not touched.

**Result: the 85–90 % target was NOT reached.** Evidence-backed software composite 50 → 63; all five dimensions together
39 → 49 (method and inputs below). The distance is explained by items that cannot be closed from this workstation:
physical SO-101 acceptance, a trained VLA model, the curriculum content decision, live AWS IoT and an approved Production
release (see [REMAINING_BLOCKERS.md](REMAINING_BLOCKERS.md)).

## 1. Completion matrix (status on this branch)

Classes: IMPLEMENTED · PARTIALLY IMPLEMENTED · MOCKED · BLOCKED · NOT IMPLEMENTED. "Tested" names the evidence; source code
that merely exists is not counted as working.

| Component | Class | What exists and what was actually run |
|---|---|---|
| School Admin / Instructor / Student LMS (course builder, quizzes, assignments, rubric, grade release, isolation) | IMPLEMENTED | Local Playwright 49/49 on the merged tree (authoring, publish policy, quiz weights/unlock rule, QB import, media, grading/release/correction, security matrix, a11y, 5 viewport widths). Production: 23/23 navigation/authorization smoke on 2026-11-19 (not a full LMS acceptance). |
| Student temporary password | IMPLEMENTED (Production-verified) | Production 24/24 across several runs; limitations preserved in `docs/operations/student-temp-password.md` (scenario 19 route-level only, scenario 21 no log scan). Fixed on `main` by PR #174 (eff03d6). |
| Blockly → ProgramVersion → simulation → grading → review → release | IMPLEMENTED (local E2E) | New real-browser drag-and-drop spec, 3/3 stable runs. See [BLOCKLY_SIMULATION_E2E.md](BLOCKLY_SIMULATION_E2E.md). One defect found and fixed (challenge assignments lost their blocks). |
| SO-101 browser simulation | IMPLEMENTED (preview) | Three.js SO-101 viewer, client simulator, server symbolic evaluator (schematic, not physics). Labelled "visual behavior may differ from hardware". |
| MuJoCo SO-101 digital twin | PARTIALLY IMPLEMENTED | `services/digital-twin` pytest 56/56 with MuJoCo: model load, six-joint mapping, joint sync, signed ingest, stale marking, out-of-order rejection. Model asset lives **outside the repo** (`mujoco-menagerie-reference`) – see provenance note in blockers. Viewer is not browser-E2E-tested against MuJoCo. |
| Twin streaming, heartbeat, reconnect | IMPLEMENTED (new) | Opt-in WS heartbeat (this sprint) + existing 2 s reconnect, scope expiry (4403), per-robot/org scoped sessions. [DIGITAL_TWIN_RUNTIME.md](DIGITAL_TWIN_RUNTIME.md). |
| Robot Runtime R1 (fake follower) | IMPLEMENTED (software) | pytest 17/17 (validation, whole-run deadline, cancel, stop latch, SIGTERM shutdown, telemetry validation). Hardware disabled by default. |
| CHECKIK WF-03 adapter (fake follower) | MOCKED (by design) | pytest 7/7. Never imports a real follower in this mode. |
| Hardware adapter (`robot-hardware-adapter`) | PARTIALLY IMPLEMENTED | pytest 19/19 (auth, ownership, calibration, progress). No device attached. |
| WF-01 robot allocation | IMPLEMENTED (local) | Migration O + API + UI; DB suite and Playwright pass. Migration O has **no Production release scope**. |
| WF-02 learning/assignments/review | IMPLEMENTED (local) | Playwright (authoring, publish, submission, grading, release) + DB suites. |
| WF-03 physical authorization/execution | PARTIALLY IMPLEMENTED; physical BLOCKED | Browser→API→PostgreSQL→R1 fake follower→Twin→S3 evidence: Playwright 1/1 on a fresh fixture. No hardware. |
| WF-04 teacher evidence review | IMPLEMENTED (local, simulation evidence) | Evidence download for owner/teacher, peer and foreign-school denial, missing-object report; manual review/release. No VLA output exists to review. |
| AWS IoT (command/feedback) | PARTIALLY IMPLEMENTED; live state UNKNOWN | Terraform root, command publisher, feedback worker + repository, recovery runner with unit/DB tests. No resource was inspected or changed. Audit in [DIGITAL_TWIN_RUNTIME.md §6](DIGITAL_TWIN_RUNTIME.md). |
| Curriculum / question bank | PARTIALLY IMPLEMENTED | Importer + canonical QB verified; one seeded course (Robotics Fundamentals, 5 lessons, 5 challenges). The requested 18/180/9/6/6 pack **does not exist** and conflicts with the 21-course/105-lesson blueprint. |
| VLA | NOT IMPLEMENTED (contract seam only) | No model, dataset, training or inference. New `vla_contract.py` seam + scripted baseline (not a model). [VLA_SCOPE_AND_EVIDENCE.md](VLA_SCOPE_AND_EVIDENCE.md). |
| Electron Desktop | OUT OF SCOPE (Codex) | Not inspected beyond the shared WS contract. |

## 2. What was newly implemented in this sprint

1. **Integration of the unmerged WF-01…WF-04 branch** (`feat/wf01-wf04-integration`, 9 commits) onto the Production commit.
   Conflicts resolved: migration "N" collided with Production's `20261118_n_student_password_change_required`, so the WF-01
   migration was renamed `20261119_o_wf01_robot_allocation_permission` (unapplied everywhere, SHA-pinned), the manifest,
   schema expectation (`03f61a1a…1717`), README, required-object check and the three database-contract tests were updated.
   Release scopes were deliberately **not** edited: O is an unscoped local candidate and the tests assert that.
2. **Defect fix**: a Blockly assignment created from a curriculum challenge got `constraints={}` and no `allowed_blocks`, so
   the student toolbox had no Movement blocks and "Reach Target A" could not be solved. `createAssignment` now inherits the
   canonical assignment's `allowed_blocks` and curriculum constraints (never rubric, schedule or student data). Unit test added.
3. **Real-browser Blockly E2E** (`web/robot-edu/tests/e2e/blockly-simulation.spec.ts`).
4. **Digital Twin heartbeat** (server opt-in `?heartbeat=<s>`, client silent-link detection + reconnect, panel row, tests).
5. **VLA provider contract seam** with drift tests against the R1 validator.
6. These six documents.

## 3. Verification record (all local, disposable infrastructure)

| Check | Command (from repo root) | Result |
|---|---|---|
| DB/contract tests | `python3 -m unittest discover -s tests/database -p 'test_*.py'` | 372 run, OK, 93 skipped (need live Docker scenarios) |
| Manifest / workflow safety | `scripts/validate_database_migration_manifest.py`, `scripts/check_database_workflow_safety.py` | passed |
| Fresh bootstrap | `bootstrap_dev_database.py --confirm-local-bootstrap` + `--verify-only` on `postgres:17` (loopback 55497, tmpfs) | 11 migrations applied, fingerprint `03f61a1a81ef93a76931043dd7c9d53627346cd0e58f24b22322f470da761717` |
| Education API types/unit/DB | `tsc --noEmit`; `RUN_POSTGRES_INTEGRATION=1 … jest --runInBand` | 107 suites passed, 5 skipped (opt-in S3/IoT/role probes); 1129 tests passed, 40 skipped |
| Web | `tsc --noEmit`; `vitest run`; `npm run build` | clean; 97 files / 647 tests; build OK |
| Playwright LMS | 11 spec files, phase-2.4.3 fixture, API as `vista_app_runtime`, loopback RustFS | 49/49 |
| Playwright WF-03 | `wf03-runtime-evidence.spec.ts` with R1 + CHECKIK fake follower + Twin/MuJoCo + RustFS | 1/1 (needs a **fresh** fixture; a rerun on a consumed fixture fails at the safety checklist, which is fixture reuse, not a defect) |
| Playwright Blockly | `blockly-simulation.spec.ts` | 3/3 consecutive runs |
| Python | digital-twin (`--extra simulation`) 56; robot-runtime 17; robot-hardware-adapter 19; CHECKIK WF-03 adapter 7; ai-integration 6 | all passed |

Not run: the real-GoTrue student-auth Playwright suites (Production evidence exists instead), `visual-audit.spec.ts`,
the opt-in S3/IoT/runtime-role integration suites, any Production or hardware step.

## 4. Completion score

Method: ten components with fixed weights (sum 100); each scored 0–100 per dimension from the evidence above using the rule
*0 = nothing, 25 = partial code, 50 = code + unit tests, 75 = integrated and exercised locally, 100 = accepted in the target
environment*. A dimension that does not apply (hardware for LMS/auth/curriculum/Production) is excluded and the weights
renormalised (hardware is computed over components D–G and I only; weights 45). "Before" = Production `main` with the
WF branch unmerged and none of this sprint's changes.

| Component (weight) | Code | Integration | E2E (software) | Hardware | Thesis readiness |
|---|---|---|---|---|---|
| A LMS core (20) | 90 → 92 | 85 → 88 | 75 → 88 | n/a | 80 → 85 |
| B Student auth (5) | 100 | 100 | 95 | n/a | 90 |
| C Blockly → simulation → grading (10) | 80 → 92 | 55 → 90 | 20 → 90 | n/a | 55 → 85 |
| D Digital Twin (10) | 80 → 88 | 45 → 75 | 15 → 60 | 0 | 45 → 60 |
| E Robot Runtime, software (10) | 70 → 78 | 25 → 80 | 0 → 75 | 0 | 40 → 55 |
| F AWS IoT (7) | 60 | 25 | 0 | 0 | 30 → 35 |
| G Physical SO-101 (10) | 40 | 10 | 0 | 0 | 20 |
| H Curriculum content (10) | 65 | 50 | 40 | n/a | 15 |
| I VLA / AI (8) | 3 → 20 | 0 → 10 | 0 | 0 | 3 → 10 |
| J Production readiness (10) | 70 → 72 | 60 | 70 | n/a | 60 → 62 |
| **Weighted result** | **67.9 → 72.7** | **48.2 → 61.6** | **34.2 → 55.9** | **0 → 0** | **46.3 → 54.5** |

* Software composite (mean of code, integration, E2E): **50.1 → 63.4**.
* All five dimensions: **39.4 → 48.9**.
* Physical hardware acceptance: **0 %** — no device was connected or commanded and none may be claimed.
* The scores are judgement-anchored, not measurements; the inputs are in the table so they can be disputed line by line.

### Why it is not 85–90 %

1. **Hardware (0 %, weight 45 of the hardware dimension)**: no commissioned SO-101 pair, no supervised run. Mocks and the fake
   follower were not substituted for acceptance.
2. **VLA (component I)**: no model, dataset, GPU or evaluation exists. The contract seam raised code from 3 to 20 only.
3. **Curriculum (component H)**: the requested 18 lessons / 180 questions / 9 quizzes / 6 assignments / 6 labs conflicts with
   the existing 21-course / 105-lesson / 1 575-question blueprint and needs a product-owner decision before content is authored.
4. **AWS IoT (F)**: live state unknown; mutation needs approval and an infrastructure plan ([REMAINING_BLOCKERS.md](REMAINING_BLOCKERS.md)).
5. **Production readiness (J)**: nothing in this sprint is deployed; migration O has no release scope; K–M are still
   production-blocked per existing status documents.
6. Reaching 85 % in the software composite would additionally need browser E2E for the Twin viewer against MuJoCo, a
   multi-robot IoT design, restart-safe R1 run state, and a Production rerun of the merged build.
