# Owner decisions and approvals (2026-11-28)

Revision context: develop `eceb8d1`, Production `430ad59`. Nothing below has been executed on the owner's behalf. "Needed for" names the gate that stays closed without the answer.

## A. Decisions already recorded (do not reopen)
| ID | Decision | Source |
|---|---|---|
| D-06 / W4-1 | Rubric completeness gate, partial drafts, explicit zero vs ungraded | `OWNER_DECISIONS_WF01_WF04.md` (approved, merged #263) |
| W4-2, W4-3, W4-4, W4-5 | level selector 4/3/2/1/0, partial draft, canonical computation only (`attempt.score` never overwritten), Gradebook read-only | same |
| W2-4 | four templates + four descriptors per criterion; descriptor storage = Migration T (timing still open, see B3) | same |
| W2-5 | no NEW mixed-grading configurations; existing mixed records preserved (#274) | same |
| D-16 | multiple-choice = exact match, no partial credit | same |
| Scope | exactly WF-01…WF-04; one SO-101 pair; dual-arm physical operation and physical VLA deferred | task brief §2 (the brief itself is the only owner statement of this deferral found; the repo's `VLA_SCOPE_AND_EVIDENCE.md` records the facts, not a signed decision) |

## B. Decisions open — blocking
| # | Decision | Options / recommendation | Needed for |
|---|---|---|---|
| B1 | **Release option A or B** | see `PRODUCTION_RELEASE_OPTIONS.md`; no recommendation forced | Gate F |
| B2 | Approve merge of #266, `deploy-api` (also deploys Twin image), `deploy-web` | sequence in `PRODUCTION_ACCEPTANCE_RUNBOOK.md` | Gate G |
| B3 | Migration T: approve exact SQL, release timing (after Production acceptance of A is the documented plan), promotion PR | additive, nullable; #272 CI currently red | Option B |
| B4 | `terraform apply` of the IAM-only plan (revalidated 0/1/0, additive); re-plan right before applying with live variables | D-03/D-08 stay FAIL in Production until applied and retested | Gate G |
| B5 | W1-1 / **D-11**: legacy `PUT …/robot-allocation` adds (409 on same robot) vs restores replace | recommend A (keep add, deprecate PUT), optionally idempotent duplicate | WF-01 final status |
| B6 | Authoritative requirement baseline | The repository's `docs/SRS.md` and `docs/requirements/10–12` describe a **local-operator dual-arm teleoperation/VLA pipeline with no RBAC** (FR-01…06, NFR-01…06). The approved WF-01…04 and LMS requirements describe a **multi-tenant education platform with RBAC**. These contradict each other in actor, scope and non-goals. Not resolved here. Owner to state which document set is authoritative and to record the deferral of FR-04…06/NFR-03/04 formally | Gate A |
| B7 | Production test content ("approved: Production test content") | needed for any Production acceptance beyond read-only | Gate G |

| B8 | **Account provisioning (2026-11-28):** approve migration U and its release; enable `STAFF_TEMP_PASSWORD_ENABLED`; confirm SMTP provider and Supabase Site URL / redirect allow-list / `SUPABASE_INVITE_REDIRECT_URL`; authorize the Production ACCT run and the recovery of existing invited accounts | `AUTH_PROVISIONING_ACCEPTANCE.md` §6 | Authentication / WF-01 gate, Gate G |

## C. Decisions open — non-blocking for A, needed for freeze
| # | Decision | Recommendation |
|---|---|---|
| C1 | W1-2 Lab Session = WF-01 refinement with 120 min default, +5–60, ≤480 total? | accept |
| C2 | W1-3 System Admin may Force End? | no (tenant boundary) |
| C3 | W2-1 robot run only after final submission | keep |
| C4 | W2-2 symbolic FAIL blocks WF-03 but not submission | keep |
| C5 | W2-3 Basic path (Blockly only, no Robot Lab) is part of WF-02 | confirm |
| C6 | W3-1/W3-3 Twin before a run; robot-wide scope for staff preview | keep |
| C7 | W3-2 a run without evidence is acceptable when flagged `unavailable` | accept |
| C8 | Quarantine on the IoT path: releases only on authoritative Shadow rule | no change proposed |
| C9 | Mixed-grading formula | none approved; forbid stays |
| C10 | Education content pilot (`VISTA_Education_Content`, **not in `develop`**; verified 180 questions / 3 courses / 18 lessons / 9 quiz blueprints, all `SINGLE_CHOICE`, all `DRAFT`, explanations repeat the correct option 180/180, no points column, Vietnamese only): points rule, real explanations, language, a few multiple-choice rows, definition of "module" | needed before any import to Production |
| C11 | Production CSP is `Content-Security-Policy-Report-Only` — enforce? | enforce after reviewing reports |
| C12 | Add a Playwright smoke subset to CI (D-13) | recommend |
| C13 | Remove the tracked symlink `services/education-api/node_modules` (see defect register) | recommend (fix PR prepared) |
| C14 | Extend the CI integration step to also run `*.int.spec.ts` (evidence S3 storage, IoT feedback repository, media S3 storage) — currently never executed in CI (N-13) | recommend (workflow change; needs the database-workflow safety check) |

## D. Approvals needed from the hardware owner / Codex (Gates H, I)
Physical safety profile for the exact robot (position/velocity limits, command-rate/stale bounds); named operator; independent E-stop confirmation; leader/follower IDs and port roles; calibration file verification; a supervised session date; decision on who forwards physical telemetry; implementation of EDGE contract §14 `cancel` on Desktop; resolution of the Desktop-vs-EDGE contradiction about the MQTT authorization bridge.

## E. Production prerequisites checklist
merge #266 → Auto Deploy → schema-gate (read-only) → approve `deploy-api` → approve `deploy-web` → verify versions, Twin image tag, queues/DLQ → approve IAM apply → Production acceptance (runbook). Production data must not be modified before B7.
