# Web LMS release readiness (reviewed scope O-P) — nothing executed, nothing deployed

Base: `sprint/vista-90` on top of Production `eff03d6`. This document prepares a *separately authorized* release. No push, merge, deploy,
Production data access, AWS change or Production migration was performed.

## 1. What ships

| Layer | Change |
|---|---|
| Database (scope **O-P**, two additive migrations) | **O** `20261119_o_wf01_robot_allocation_permission`: one idempotent `education.classroom.resource.allocate` grant to the School Admin role. **P** `20261119_p_course_level_tags_prerequisites_assignment_difficulty`: three canonical `learning_levels` rows (`ON CONFLICT DO NOTHING`); `learning_courses.tags`, `.prerequisite_course_ids`; `learning_assignments.difficulty/assignment_type/pass_score/grading_method/learning_objectives`; `learning_classrooms.self_enrollment_open` (default **false**); two CHECK constraints; one GIN index. No new table, no RLS/grant/trigger/policy/function change, no backfill, no rewrite (constant defaults, metadata-only on PG ≥ 11). |
| API | course level/tags/prerequisites; filtered course list and `GET /course-tags`; `GET /me/learning-path`; `GET/PATCH …/assignments/:id/academic`; `GET /me/course-catalog` and `POST /me/course-catalog/:classroomId/enroll`; classroom `selfEnrollmentOpen`; challenge-derived assignments inherit blocks/target; attempt-bound Digital Twin viewer scope (separate, flag-less, additive route) |
| Web | level badges, tags, prerequisites, catalog + enrollment page, learning-path page, builder fields, assignment academic panel, school toggle |
| Seed (not part of the release) | `seed-so101-curriculum` is for isolated databases only |

## 2. Ordering and compatibility

1. **Database first**: Production Database Release, `scope=O-Q` (the scope is **PROPOSED, NOT APPROVED** in `database/release-scopes.json`; it must be reviewed, then approved by the `production-database-apply` reviewer). `requiresApplied`: D–L and N (all already in Production for the student temporary password release).
2. **Then the API/web deploy** (`aws-demo` approval). The new API selects the new columns in raw SQL, so deploying it before the migration makes `/courses`, `/me/learning-path`, assignment reads and the classroom list fail.
3. Old API + migrated database is safe (the previous code never selects the columns). Rolling the API back after step 2 is therefore always safe.
4. Backward compatibility of data: existing courses read as level *unset*, no tags, no prerequisites; existing assignments read as difficulty *unset*; every classroom is **closed** for self-enrollment, so student behaviour is unchanged until a School Admin opts a classroom in.
5. No feature flag is needed or added. `STUDENT_TEMP_PASSWORD_ENABLED` is unchanged. TRUST_PROXY unchanged.

## 3. Evidence that exists (local, disposable)

* Fresh PostgreSQL 17 bootstrap applies D–P; schema fingerprint pinned in `database/baselines/dev-schema-expectation.json`; `tests/database` 374 tests OK (93 skipped for unavailable Docker scenarios), including `ReleaseScopeOPTests` (scope pinned to manifest checksums, proposed status, additive-only SQL, verifier registered, workflow option present).
* `scripts/verify_production_release_op.py` (read-only; ledger + checksums + pinned catalog + 8 column definitions + 2 constraints + level rows + the single grant + no backfill + row digests of the three altered tables + 18 table counts): ran **52/52 PASS** against a freshly bootstrapped database. **Limitation:** that is a self-consistency run on a post-release schema with empty tables, not a true before/after rehearsal.
* **Not yet done (release gates):** a before/after rehearsal on a restored copy of Production (needs the approved logical backup restore procedure), the independent review of the scope, and the Production backup/restore evidence the runner requires.

## 4. Rollback

* **Application**: redeploy the previous immutable API/web images (compatible with the migrated schema). Instant, no database work.
* **Database**: leave the columns (inert). Only if the features are abandoned and unused: `docs/operations/sql/o-p-rollback.sql` (guarded: refuses while any course has tags/prerequisites, any assignment has academic settings or any classroom is open; leaves level rows and the WF-01 grant; removes the two ledger rows). Not run by the release runner; needs its own approval.
* **Data safety**: no existing row is modified by the migrations; the logical backup taken by the runner is the recovery path of last resort.

## 4a. Release prerequisites for the Education API

`prisma generate` must run in the image build (the schema gained columns; already part of the Docker build). Check `SchemaCompatibilityService` stays green on startup after the migration.

## 5. Production smoke tests (to be run only after separately authorized deployment, with an isolated test school)

1. `GET /api/v1/health` 200; `GET /api/v1/auth/students/capabilities` unchanged.
2. Existing student login (a real, pre-existing test account approved by the owner) → My Learning loads; an existing course opens; an existing quiz attempt page loads. *(No grades or data are modified.)*
3. School Admin: classroom list loads and shows `selfEnrollmentOpen: false` for every classroom; edit dialog shows the toggle off.
4. Instructor: course builder opens an existing course; the new "Academic classification" fields show *Not set*; saving without changes does not alter data.
5. Student: `/catalog` shows an empty state ("No courses available") because no classroom is open; `/learning-path` loads.
6. Isolated test school only (new fixtures, approved separately): create a course with level/tags/prerequisite, open a test classroom, enroll a test student, run one module quiz, deliver and grade one Blockly lab; confirm cross-school 404s; archive/close afterwards.
7. Compare row counts of courses/assignments/classrooms before and after (`verify_production_release_op.py --verify`).

## 6. Security and licensing review (this segment)

* Self-enrollment authority: opt-in per classroom by the school; the server re-checks membership role, school/classroom/offering/course status, capacity, prerequisites and existing enrollment under the classroom lock; every failure for another school is a 404; reuses the existing member + enrollment synchronization (no bypass of school policy). No migration of rosters.
* Tags are validated (length, characters, count) and rendered as text; prerequisites cannot reference another school's course, themselves or form a cycle.
* Assets: the curriculum text is original authored content; no third-party media was added. SO-101 3-D asset redistribution rights remain an open question recorded in earlier documents (unchanged by this release).
* Evidence integrity: all numbers in the handoff come from commands run in this session; skipped suites are listed with reasons.

## 7. Blockers to a deployment

Review/approval of scope O-P; before/after rehearsal on restored Production data; approved DB release workflow run (`backup_mode=logical`); `aws-demo` approval; an owner-approved isolated Production test fixture plan for the smoke tests (the earlier test school is closed).
