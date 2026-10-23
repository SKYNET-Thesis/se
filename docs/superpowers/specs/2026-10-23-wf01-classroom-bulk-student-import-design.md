# WF-01 Classroom Bulk Student Import Design

## Goal

Complete WF-01 with two tightly scoped usability changes: a server-searchable Add Member picker and a classroom CSV import that reuses or provisions organization students before adding them to the selected classroom.

## Boundaries

- Keep the Supabase auth guard, Robot Allocation, teacher provisioning, role derivation, C1/C2/C3, CHECKIK, and robot-runtime unchanged.
- Add no database migration, queue, cache service, or microservice.
- The browser never supplies organization role or classroom role. Classroom is taken from the authorized route context and the mutation accepts student rows or `userId` only.

## API Design

Add two endpoints under the existing Education Admin controller:

- `POST /education-admin/organizations/:organizationId/classrooms/:classroomId/student-imports/preview`
- `POST /education-admin/organizations/:organizationId/classrooms/:classroomId/student-imports`

Preview is strictly read-only. It revalidates the Student CSV row contract, batch-resolves `organization_id + student_code`, checks current classroom membership, compares existing master profile fields without updating them, and returns `new_student`, `existing_student`, `already_in_class`, or `needs_review` plus safe warnings. It never writes to PostgreSQL or calls Supabase.

Confirm ignores all frontend preview classifications. It revalidates and batch-resolves the submitted rows again. Existing students retain their master profile and are added only when membership is missing. New students use the extracted `StudentProvisioningService`; the database portion provisions the domain user, student organization membership, school profile, and classroom membership in one row transaction. Supabase invitation remains an external pre-transaction side effect with the existing idempotent lookup behavior. A failed invitation or provisioning transaction cannot create a classroom membership.

Per-row confirm results are `created_and_added`, `existing_added`, `unchanged`, or `failed`. Repeating the same file in the same classroom returns unchanged. Importing an organization student into another classroom reuses that student and creates only the missing classroom membership.

## Shared Provisioning

Extract current student provisioning behavior into `StudentProvisioningService`. The existing organization User Import path and the new classroom import orchestrator both call this service; there is no second student provisioning implementation. Teacher provisioning remains in its current path and is not modified.

The service preserves:

- optional student email;
- `account_setup_pending` and no Supabase identity when email is absent;
- existing Supabase invitation semantics when email is present;
- student organization membership;
- student profile fields and safe error classification;
- row-level transaction and retry behavior.

## Add Member Query and UX

The member-candidate query searches the full organization dataset before pagination. It computes classroom membership and returns only selectable candidates, so `total` and pages cannot include an empty trailing page of existing classroom members.

The dialog renders a direct radio selection list instead of a native select. Search is debounced by 300 ms and sent to the server. Changing search immediately resets page and selection. Candidate queries do not retain the previous search result as placeholder data. The query key continues to include organization, classroom, search, page, and page size.

If no candidates match, the dialog displays `No eligible members found.` Pagination is hidden for one page and shows bounded Previous/Page X of Y/Next controls for multiple pages. Selecting a result shows a read-only Student or Teacher role preview. Add Member still sends only `{ userId }`.

## Classroom Import UX

Add `Import students` beside `Add member`. The dialog reuses the existing Student CSV parser and contract:

`first_name,last_name,student_code,grade_level,email,guardian_email`

The browser parses and validates the file, calls the read-only preview endpoint, and shows Records, New students, Existing students, Already in classroom, and Needs review. The row table shows Student, Student code, Grade, Email, status, and warnings/errors. Confirm sends the original normalized row fields, not preview status.

The result view reports created-and-added, existing-added, unchanged, and failed counts. Successful confirmation invalidates only the organization People/Overview queries and the selected classroom roster, candidates, and classroom summary.

## Performance and Safety

Both preview and confirm prefetch organization students and classroom memberships for the submitted student codes. Row processing does not query the database once per row for resolution. Each new row retains an independent transaction, so one failure does not rollback successful rows.

Authorization first validates the classroom belongs to the requested authorized organization. Cross-organization, instructor, student, and unsupported-role requests follow the existing privacy-preserving denial convention. Raw database and Supabase errors remain server-only.

## Verification

Automated tests cover read-only preview, classifications and profile warnings, new/existing/already-in-class confirm paths, idempotency, cross-classroom reuse, duplicate/invalid rows, cross-org denial, unsupported role rejection, invitation failure without orphan membership, candidate server search/pagination boundaries, debounce/reset behavior, empty state, selection/role preview, and `userId`-only mutation.

The final gate runs API tests/build, Web tests/build, Prisma validation, and `git diff --check`. A host live test uses a three-row CSV containing one new student, one existing organization student not in the classroom, and one existing classroom student; it must produce `created_and_added`, `existing_added`, and `unchanged`, followed by reload persistence.
