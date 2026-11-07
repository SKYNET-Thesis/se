## Agent skills

### Issue tracker
Use GitHub Issues in SKYNET-Thesis/se. Before ticket operations,
read `docs/agents/issue-tracker.md`.

### Triage labels
Use the five default triage labels. Before triaging,
read `docs/agents/triage-labels.md`.

### Domain docs
Use a single context across mobile, backend, AI, edge and contracts.
Before exploring, read `docs/agents/domain.md`.

## Before working on this project

Read these first:

- `docs/operations/VISTA_PROJECT_CONTEXT.md` — architecture, role → route contract.
- `docs/operations/DATABASE_MIGRATION_STATUS.md` — production DB gate.
- `docs/operations/DEVELOPMENT_STATUS.md` — current implementation and verification state.

## Hard constraints

- Supabase PostgreSQL is production. Never run migrations, `db push`, or schema
  changes against it. Never connect to it from tests.
- Backend authorization is authoritative. Hiding a sidebar item is not authorization.
- Do not create a second course/enrollment model or a parallel navigation tree.
- Do not modify robotics services for course-management work.
- Do not commit or push without explicit instruction.
