# VISTA Database Script — Review 2 Reference Schema

This directory contains an executable PostgreSQL/Supabase DDL script prepared
for the **Review 2** evaluation baseline.  It is a useful local fixture, but
it is **not** a canonical production schema baseline: it predates the current
production catalog evidence and does not encode the full production RLS,
policy, trigger, function, or migration-history state.

## File Information
- **File:** `vista_database_schema.sql`
- **Dialect:** PostgreSQL 15+ / Supabase
- **Target:** Fresh database installation
- **Scope:** 77 tables encompassing all core platform domains:
  - Identity, Roles & School Access (users, organizations, memberships, classrooms)
  - Curriculum & Assignments (courses, lessons, assignments, rubrics)
  - Program Versioning & Submissions (programs, immutable versions, submissions, assessments)
  - Robot Resource Management & Allocations (robots, entitlements, classroom allocations)
  - Experiment Execution & Trajectory Artifacts (experiments, artifacts, events)
  - AI Models & Training Datasets (ai_models, dataset_versions, checkpoints)

## Execution
To initialize a local fixture database with this schema:
```bash
psql -h <hostname> -p <port> -U <username> -d <database_name> -f database/vista_database_schema.sql
```

Do not use this file to reconcile an existing Supabase project or to infer
Prisma migration history.  The controlled production-baseline process is in
[`baselines/README.md`](baselines/README.md).
