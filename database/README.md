# VISTA Database Script — Review 2 Baseline

This directory contains the authoritative executable PostgreSQL/Supabase database DDL schema script for the VISTA STEM Robotics & AI Education Platform, prepared for the **Review 2** evaluation baseline.

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
To initialize a fresh database with this schema:
```bash
psql -h <hostname> -p <port> -U <username> -d <database_name> -f database/vista_database_schema.sql
```
