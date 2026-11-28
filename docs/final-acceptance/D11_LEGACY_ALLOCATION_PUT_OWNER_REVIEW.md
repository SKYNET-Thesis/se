# D-11 — legacy `PUT /education-admin/classrooms/:id/robot-allocation` (for the WF-01 owner review)

Status: **no behaviour changed.** This page is evidence for the decision only.

## Current contract (develop `cfaae15`)
`PUT …/robot-allocation` body `{robotId}` is bound to the same handler as `POST …/robot-allocations` (`education-admin.controller.ts:79-80` → `EducationAdminService.allocateRobot`). It (1) re-checks, under row locks, that the robot is `available` and the organization holds a valid entitlement; (2) `INSERT … ON CONFLICT DO NOTHING` into `learning_classroom_robot_allocations(classroom_id, robot_id)` (UNIQUE pair since migration S); (3) pair already present → **409 `ROBOT_ALREADY_ALLOCATED`**; pre-S schema with a different robot → 409 `MULTI_ROBOT_ALLOCATION_NOT_ENABLED`; (4) returns the inserted row. Removal is `DELETE …/robot-allocations/:robotId` and is refused while the classroom holds an open Lab Session for that robot.

## Behaviour history
| Version | PUT with a different robot | PUT with the same robot |
|---|---|---|
| before migration S / #243 (one robot per classroom, `ON CONFLICT (classroom_id)`) | **replaced** the allocation (upsert) | idempotent (200) |
| now (many-to-many) | **adds** a second allocation | **409** (not idempotent) |

## Callers (repository search)
- **Web application source:** none. `ClassroomRobotAllocation` uses `GET …/eligible-robots`, `POST …/robot-allocations`, `DELETE …/robot-allocations/:robotId`.
- **Playwright specs only:** `lms-independent`, `lms-robot-lab-access`, `lms-beginner-lab`, `digital-twin-revocation`, `digital-twin-websocket-revocation`, `digital-twin-attempt-scope`.
- **Docs:** `WF01-WF04-INTEGRATION-BASELINE.md` ("allocate/replace one robot"), `DIGITAL_TWIN_RUNTIME.md`. Desktop/Codex: no use found in this repository (the Desktop repository was not inspected).
- Production data: classrooms may now hold several robots; `GET /classrooms/:id` still returns the first as `allocated_robot`.

## Options
| Option | Effect | Cost / risk |
|---|---|---|
| **A. Keep "add" (current), mark PUT deprecated** | one behaviour for POST and PUT; clients migrate to POST/DELETE | PUT callers that expected "replace" or idempotency must change (only tests today) |
| B. PUT = replace the classroom's robot set with exactly `{robotId}` | restores the pre-S meaning | must remove other allocations: blocked while any has an open Lab Session; revokes Twin viewers bound to removed robots; destructive for many-to-many classrooms |
| C. Remove PUT | cleanest API | breaks any unknown external caller |
| A′. A + make duplicate PUT/POST idempotent (200 with the existing row) | friendlier retries | contract change (409 → 200) |
**Recommendation: A**, optionally A′; update the baseline wording from "replace" to "add".

## Acceptance criteria for the chosen option
Owner records the decision in `OWNER_DECISIONS_WF01_WF04.md` (W1-1); the six Playwright specs and the baseline doc state the same behaviour; Twin viewer revocation occurs only on removal; a classroom with two robots shows both in `GET /classrooms/:id/lab-robots`.
