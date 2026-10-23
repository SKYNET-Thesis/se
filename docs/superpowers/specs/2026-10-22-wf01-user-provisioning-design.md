# WF-01 User Provisioning Design

School Admin imports are authorized by the authenticated organization membership. The Education API revalidates rows, uses a server-only Supabase Admin invite for email-bearing users, and stores school identifiers in an organization-scoped profile linked to the existing `users` and `memberships` tables.

Students without email receive a `users` record with nullable email, an organization membership, a school profile with `account_setup_pending`, and no Supabase identity. They cannot sign in. Email-bearing students and teachers are invited through Supabase and linked by the existing auth-user trigger.

The import is idempotent by organization-scoped student/employee code, email, user membership, and profile upserts. Classroom membership accepts only `userId`; the backend derives `student` or `teacher` from the active organization membership role.
