# Remaining blockers, approvals and risks (2026-11-19)

Branch `sprint/vista-90` is a local development branch: **not pushed, not merged, not deployed.** Each item below needs a
decision or approval that this workstation cannot supply.

## 1. Production deployment blockers (need owner approval)

| # | Item | Why it blocks | Needed |
|---|---|---|---|
| P1 | Migration **O** `20261119_o_wf01_robot_allocation_permission` is in the development manifest but has **no release scope** | The Production release runner only applies scoped migrations; the contract tests assert O is unscoped. Production's ledger ends at N. | Review O (single idempotent permission grant), add a reviewed `database/release-scopes.json` scope + runbook, then the protected DB release workflow. Do not edit applied migrations or the ledger. |
| P2 | K–M release scopes still blocked per existing status documents | WF/LMS features that depend on K/L (course authoring permissions, runtime role) | Existing `production-lms-k-m-*` approval flow |
| P3 | Merge/deploy of this branch | Contains the challenge-assignment fix (a Production defect), WF-01..04 code and the Twin heartbeat | Owner approves a PR; protected `aws-demo` gate; schema-gate must pass with the new manifest; verify deployed SHA afterwards |
| P4 | Production re-test | No Production evidence exists for the Blockly flow, WF-01, WF-03/04 | A fresh, approved, isolated Production fixture plan (the previous school `E2E1119SA` is closed) |
| P5 | Evidence bucket prefix | WF-03 writes `learning-media/experiments/*`; per `docs/operations/wf03-experiment-evidence.md` existing deployed roles need an independently reviewed infrastructure release before this prefix is usable (current IAM not inspected) | Reviewed infrastructure change (not applied) |

## 2. AWS IoT — approval plan (nothing executed)

Required only if live robot messaging is wanted. See `DIGITAL_TWIN_RUNTIME.md` §6. Gaps that need infrastructure change:
per-robot Thing/policy/topic templating, a heartbeat/presence topic and rule, routing of the permitted `telemetry` topic,
and device certificate issuance. Process: reviewed `terraform plan` of the IoT root, explicit approval per step, secrets only
through the protected deploy workflow with the prior version kept for rollback, Production MQTT enabled last after
fake-telemetry evidence. **No Terraform apply/destroy, secret, policy, certificate or IoT resource was touched.**

## 3. Hardware blockers (end-to-end physical acceptance = 0 %)

Corrected scope: the physical SO-101 stack was built separately and is largely present (see
[PHYSICAL_ROBOTICS_REASSESSMENT.md](PHYSICAL_ROBOTICS_REASSESSMENT.md)); what is missing is the VISTA↔robot adapter, commissioning
values, reviewable bench evidence and a supervised run. The WF-07/WF-09 "hardware audit" report is mock-generated and must be
replaced. Original list, now to be read with that correction:

* No commissioned SO-101 follower/leader pair, per-arm safe-home and gripper values, calibration profile, physical E-stop test,
  or supervised operator session. `hardwareEnabled` stays false; nothing in this branch enables motion.
* Four-arm (two leader–follower pairs) operation is design intent only; no two-pair synchronization or collision logic exists.
* Mock and fake-follower results must never be reported as hardware acceptance.

## 4. VLA blockers

No model/provider, dataset, GPU, evaluation protocol or demonstration hardware. Details in `VLA_SCOPE_AND_EVIDENCE.md`.

## 5. Curriculum decision needed

The requested pack (SO-101 Beginner/Intermediate/Advanced; **18 lessons, 180 questions, 9 module quizzes, 6 assignments, 6 labs**)
does not exist anywhere in the repository, and it conflicts with the project blueprint
(`VISTA_Curriculum_Question_Bank_Blueprint_UPDATED_2026-11-07.docx`: 21 courses / 105 lessons / 1 575 questions, Course 1 =
5 lessons already seeded). The `feature/curriculum-learning-paths` branch holds a plan only. Authoring 180 questions without
that decision would risk duplicate or contradicting content, so **none was created and nothing was imported anywhere.**
Needed: confirm whether the 18/180 pack is a *subset* of the blueprint or a new path; then author against the implemented
blocks (`arm.select, home, move to x/y/z, wait, gripper open/close`) and import through the existing QB importer into a
disposable DB first.

## 6. Engineering risks and open defects (none P0)

| Sev | Risk | Detail |
|---|---|---|
| P1 | Challenge-assignment defect is expected in Production | Reproduced locally on `main`-equivalent code and fixed on this branch only (see `BLOCKLY_SIMULATION_E2E.md`). Production runs the same code path (eff03d6) but the defect was **not** reproduced on Production (no fixture was created). Whether the UI offers any workaround was not checked. |
| P2 | R1 has no restart reconciliation, lease or heartbeat | Active runs are lost on restart (fail-closed). Needed before any unattended physical use. |
| P2 | Digital Twin MuJoCo model is outside the repo | `mujoco-menagerie-reference/robotstudio_so101/so101.xml` is read by path; CI cannot reproduce Twin MuJoCo tests; licensing/provenance must be re-confirmed (`ASSET_PROVENANCE.md`). The 2 MuJoCo tests are skipped without the `simulation` extra. |
| P2 | Telemetry is latest-frame only | No persisted time series; WF-04 evidence stores a final JSON, not a stream. |
| P2 | Twin heartbeat is verified in ASGI/unit tests only | No real network-partition test; Twin viewer not browser-tested against MuJoCo. |
| P2 | WF-03 E2E fixture is single-use | Rerun needs a new seed; CI wiring for this stack does not exist. |
| P3 | Per-account student-auth limiter shared by login/recover/change; admin reissue limit is in-process | Carried over from the Production acceptance report. |
| P3 | `learning_programs` evaluation for both-arm programs | No canonical concurrency semantics; blocks are rejected by design. |

## 7. Not verified in this sprint

Production behaviour of anything on this branch; real-GoTrue student-auth Playwright suites (Production evidence exists
instead); `visual-audit.spec.ts`; opt-in S3, IoT-feedback and runtime-role integration suites; any AWS call; any device.
