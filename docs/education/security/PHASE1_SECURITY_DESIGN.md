# VISTA Phase 1 Security Design Package (review-only)

**No file in this package has been executed.** No production data, RLS setting, policy, seed, or permission was changed.

## Approved design versus proposed SQL

Approved: Prisma `postgres`/BYPASSRLS remains MVP architecture; NestJS JWT/permission/resource scope checks are authoritative for API requests; RLS stays enabled for direct Supabase JWT access/future non-bypass paths; no SECURITY DEFINER RLS helper in v1; `account_invitations` is justified; physical robot execution requires both `learning.experiment.execute` and `robot.control` plus session/readiness/calibration/safety checks. SQL files remain proposed only.

## 1. Current live security state (re-audited)

- `public.users` has independent UUID `id`, required email/profile/status fields, and nullable unique `auth_user_id` FK to `auth.users(id)`. Its status check is `invited|active|disabled`; signup method is `admin_created|self_registered`.
- `auth.users` has `id`, `email`, `email_confirmed_at`, `invited_at`, `raw_user_meta_data`, and normal Supabase lifecycle fields.
- Auth triggers: `auth.on_auth_user_created → public.handle_new_auth_user()` and `public.trg_users_updated_at`. The provisioning trigger is currently for self-registration only.
- Live RBAC: 7 roles, 14 permissions. No learning capability permission exists. `system_admin` is system scope; all other roles are organization scope. No generic role/permission CRUD is proposed.
- All 35 learning tables have RLS enabled; none has a policy. `FORCE RLS` is false.
- Prisma connects as `postgres`, which is table owner and has `BYPASSRLS = true`; `request.jwt.claim.sub` is null. Prisma queries therefore do not carry end-user JWT/RLS context and are not protected by those policies.

## 2. Identity model

`auth.uid() = auth.users.id → public.users.auth_user_id → public.users.id`. Learning FKs reference the final `public.users.id`; policies must use this bridge, never compare `learner_user_id = auth.uid()`.

The browser supplies only a Supabase JWT. NestJS is authoritative for API request authentication/authorization. RLS is defense in depth for direct Supabase access and any future JWT-scoped DB connection. Browser code never receives database or service-role credentials.

## 3. Invitation lifecycle and schema

Existing 72 tables cannot safely represent an invitation: `users` lacks expiry, intended organization/role, one-time token hash, state, claim subject, cancellation, and replay evidence; `auth_tokens` has incompatible purpose constraints. A separate table is necessary.

Lifecycle: `pending → accepted|revoked|cancelled|expired`. Expiry is an explicit terminal transition performed by a cleanup job or atomically during a claim; a pending row past `expires_at` is never claimable. The server creates an `invited/admin_created` public user and one `account_invitations` row, then calls Supabase Admin invitation with server-set invitation metadata. It records the returned `auth.users.id`. Claim locks the row, verifies HMAC(token), pending state, expiry, stored Auth subject, and `intended_role.scope='organization'`; then in one transaction links `auth_user_id`, activates account, creates membership, consumes invite, and writes audit logs. Browser email, role, org, user ID and Auth ID are never trusted.

`account_invitations`: id; invited_user_id; organization_id; intended_role_id; invited_email plus normalized generated value; invited_by_user_id; supabase_auth_user_id; 32-byte HMAC `token_hash`; state; expiry; accepted/consumed/revoked/cancelled timestamps and actors; created/updated timestamps. Partial unique `(organization_id, invited_email_normalized) WHERE state='pending'`; unique token hash and Auth subject prevent duplication/replay. Full migration/rollback: [001_invitation_proposal.sql](sql/001_invitation_proposal.sql) and [rollback_proposal.sql](sql/rollback_proposal.sql).

The existing self-registration trigger must be revised in the same approved deployment to skip a server-marked invitation Auth identity; otherwise Supabase invitation insertion creates an incorrect active self-registered profile. This marker alone grants nothing; claim still requires server-recorded Auth UUID and HMAC token.

## 4. Admin authorization matrix

| Endpoint group | Actor/permission | Scope and target validation | Escalation prevention | Audit |
|---|---|---|---|---|
| users GET/PATCH | `user.manage` | system role only; target is public user | cannot mutate auth/status/role through generic PATCH | `user.view`, `user.update` |
| user system roles GET/POST/DELETE | `user.manage` | system role only | only system administrator authority; disallow removing final active system admin | role events |
| org memberships GET/POST/PATCH/activate/suspend/revoke | approved `membership.manage` (new) | target organization derived from route and active actor membership | actor may grant only approved organization roles; cannot cross-org | membership events |
| roles/permissions GET | `user.manage` or approved read permission | system scope | read-only | catalog view |
| roles/permissions writes | DENY | — | system-controlled data | — |

`user.manage` is live but no live `membership.manage` or role-assignment capability exists; do not implement these endpoints until the proposed capability seed is approved.

## 5. Learning capability proposal

Existing capabilities remain unchanged. New, non-duplicate proposals are namespaced: `learning.curriculum.manage`, `learning.delivery.manage`, `learning.membership.manage`, `learning.work.read`, `learning.work.write`, `learning.work.review`, `learning.assessment.assess`, `learning.experiment.execute`, `learning.demonstration.manage`, `learning.dataset.manage`, `learning.training.manage`, `learning.vla.execute`, `learning.evaluation.manage`. Their scopes are organization except platform curriculum governance, which requires a separate decision. Students receive read/write-own; teachers receive delivery/read/review/assess for assigned classrooms; administrators receive organization management. Proposed insert-only seed: [002_learning_permissions_proposal.sql](sql/002_learning_permissions_proposal.sql).

Workflow mapping: curriculum/course/lesson/challenge uses curriculum.manage; offering/classroom/enrollment uses delivery.manage; assignment publish/assign uses delivery.manage; attempts/program/submission/reflection use work.write; review/feedback uses work.review; assessment uses assessment.assess; experiment/robot/VLA execute uses their explicit execute capability plus safety checks; demonstrations/datasets/training/models/evaluation use their corresponding manage capability. No role-name check is authoritative.

## 6. RLS proposals

Shared safe predicate is an inline `EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id=auth.uid() AND u.status='active' AND u.id=...)`. A SECURITY DEFINER helper is **not recommended** for the first deployment: it adds owner, `search_path`, EXECUTE, and row-security risk. If later justified it must be owned by a non-bypass owner, `SET search_path=pg_catalog,public`, have no dynamic SQL, revoke PUBLIC EXECUTE, grant only authenticated, and be tested under forced RLS.

Student: only own records and reachable active student classroom resources. Teacher: only classroom rows with active teacher/TA membership and active organization membership. Admin: only organization rows with approved learning admin capability; no global `USING(true)` bypass. `USING` plus `WITH CHECK` must preserve the same owner/org/classroom relationship on UPDATE. Where a row has no immutable schema constraint, direct Supabase update requires a narrow ownership-change trigger or column privilege review before deployment; Nest DTO whitelist alone is insufficient. SQL proposal is [003_learning_rls_proposal.sql](sql/003_learning_rls_proposal.sql).

### Complete 35-table matrix

Legend: `O` own public user bridge; `SC` active student classroom path; `TC` active teacher/TA classroom path; `AO` approved organization admin capability; `R` read; `W` constrained write; `D` deny; `SO` server/worker only. For every W, `USING` and `WITH CHECK` are the same ownership/path predicate; immutable owner/learner IDs must be enforced by API column whitelists. Every table below covers `SELECT/INSERT/UPDATE/DELETE` as `S/I/U/D`.

| Table | Student S/I/U/D | Teacher S/I/U/D | Admin S/I/U/D | path / required permission / notes |
|---|---|---|---|
| assessment_scores, assessments | O-R/D/D/D | TC-R/W/W/D | AO-R/W/W/D | assessment→submission→assignment→classroom; assess |
| assignment_attempts | O+SC-R/W/W/D | TC-R/D/D/D | AO-R/W/W/D | classroom_assignment→classroom; work.write |
| assignments, rubric_criteria | SC-R/D/D/D | TC-R/D/D/D | AO-R/W/W/D | assignment→classroom assignment→classroom; curriculum/delivery |
| challenge_conditions, challenge_objects, challenges | SC-R/D/D/D | TC-R/D/D/D | AO-R/W/W/D | challenge→assignment→classroom; curriculum.manage |
| classroom_assignments | SC-R/D/D/D | TC-R/W/W/D | AO-R/W/W/D | classroom; delivery.manage |
| classroom_members, classrooms, enrollments | self/SC-R/D/D/D | TC-R/D/D/D | AO-R/W/W/D | classroom→organization; membership/delivery.manage |
| competencies, levels | reachable-R/D/D/D | reachable-R/D/D/D | R/D/D/D | global/cross-org governance undecided; no direct writes |
| competency_progress, lesson_progress | O-R/D/D/D | TC-R/D/D/D | AO-R/D/D/D | learner + enrollment/classroom; worker-owned progress |
| course_offerings | SC-R/D/D/D | TC-R/D/D/D | AO-R/W/W/D | offering→organization; delivery.manage |
| courses, lessons, objectives, objective_competencies, lesson_prerequisites | reachable-R/D/D/D | TC-R/D/D/D | org-course AO-R/W/W/D | course→offering→classroom; null-org system content denied until governance decision |
| demonstration_annotations, demonstration_segments | reachable demo-R/D/D/D | TC-R/D/D/D | AO-R/D/D/D | demo→experiment/classroom; SO writes |
| experiment_artifacts, experiment_events | O-R/D/D/D | TC-R/D/D/D | AO-R/D/D/D | artifact/event→experiment; SO writes |
| experiment_comparisons | O-R/W/W/D | TC-R/D/D/D | AO-R/W/W/D | every experiment id must be authorized; API validates array |
| experiments | O+SC-R/W/W/D | TC-R/D/D/D | AO-R/W/W/D | experiment→submission/learner→classroom; execution fields SO |
| feedback | O-R/D/D/D | TC-R/W(own)/W(own)/D | AO-R/W/W/D | submission/attempt→classroom; review capability |
| program_versions | O-R/W/D/D | TC-R/D/D/D | AO-R/D/D/D | program→owner; append-only, created_by=O |
| programs | O-R/W/W/D | TC-R/D/D/D | AO-R/W/W/D | owner + assignment classroom; work.write |
| reflections, submissions | O+SC-R/W/W/D | TC-R/D/D/D | AO-R/W/W/D | learner→submission/experiment→classroom; work.write |
| vla_interactions, vla_action_steps | O-R/W/D/D / O-R/D/D/D | TC-R/D/D/D | AO-R/D/D/D | interaction→experiment; execution state SO |

The expanded path rationale and per-row predecessor proposal remain in [../PHASE_1_DB_SECURITY_PROPOSALS.md](../PHASE_1_DB_SECURITY_PROPOSALS.md); this matrix is the authoritative compact command matrix.

## 7. Prisma/RLS architecture and indexes

Because Prisma is `postgres`, owner, BYPASSRLS, with no JWT claims, RLS does not constrain its queries. Nest guards are authoritative for API calls; RLS protects direct client/JWT DB paths. Do not pretend Prisma executes as the user. A future RLS-aware data path requires transaction-scoped claim setting under a non-bypass DB role and proof tests.

Existing indexes cover most FK paths. Review-only proposed indexes are only: `users(auth_user_id)` already unique; `learning_classroom_members(user_id,classroom_id)` (existing separate indexes/unique composite); and verify plan for classroom membership status + role before adding a partial index. No blind index migration is recommended; see [004_security_indexes_proposal.sql](sql/004_security_indexes_proposal.sql).

## 8. Security tests and risk

Test harness: [rls_test_harness_proposal.sql](sql/rls_test_harness_proposal.sql) creates only an ephemeral, non-BYPASSRLS test role and rolls the setup back. Each test opens a fresh transaction, sets `request.jwt.claim.sub` to a fixture `auth.users.id`, and runs direct SQL against RLS tables. It must test own/peer work, teacher own/unrelated classroom, admin own/cross org, disabled/suspended/revoked identities, direct INSERT/UPDATE/DELETE, ownership/org reassignment attacks, role escalation, and invitation expiry/replay/concurrent claim. Test RLS using that role, never Prisma `postgres`.

## 9. Remaining approval gates

Approve invitation table + trigger amendment; approve learning and membership capability codes plus grants; approve final expanded RLS policies after a non-bypass test harness exists. Until then invitation, membership/role management, and learning endpoints remain blocked; Phase 2 must not start.
