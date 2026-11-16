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

## Shared project rules

- Preserve the architecture documented in [`docs/ai/ARCHITECTURE.md`](docs/ai/ARCHITECTURE.md): Course → Lesson → Section → Activity, canonical Question Bank, immutable quiz-attempt snapshots, classroom/tenant authorization, one private S3 Learning Media bucket, and robot runtime safety boundaries.
- Production DDL is owned by the repository SQL migration runner. Never use Prisma `db push` or Prisma Migrate against Production, edit applied migrations, fabricate migration-ledger records, or disable RLS to bypass authorization.
- Database writes require explicit authorization naming the target and scope. No Production database writes, AWS mutations, Terraform apply/destroy, or deployments without approval.
- Inspect `git status` before editing. Preserve unrelated changes. Never reset, clean, stash, discard, commit, push, merge, or overwrite another agent's work without explicit user approval.
- Follow [`docs/ai/WORKFLOW_RULES.md`](docs/ai/WORKFLOW_RULES.md) for independent task assignment and file-scope coordination. No agent has a permanent implementation, review, UI, or coordinator role.
- Run relevant verification when permitted; report exact commands/results and blocked checks. Unit tests alone do not establish end-to-end verification. Do not run migrations as part of routine verification.
- Read relevant architecture and operational documents before changing their domains. Start with [`docs/ai/ARCHITECTURE.md`](docs/ai/ARCHITECTURE.md).
- At the start of a new task/session, all agents (Codex, Claude Code, and Antigravity) read [`PROJECT_CONTEXT.md`](docs/ai/PROJECT_CONTEXT.md), [`ARCHITECTURE.md`](docs/ai/ARCHITECTURE.md), [`CURRENT_STATUS.md`](docs/ai/CURRENT_STATUS.md), and [`WORKFLOW_RULES.md`](docs/ai/WORKFLOW_RULES.md). In that session, reread them only when the relevant context has changed; verify status claims against the current branch, Git status, source, and evidence before relying on them.
- Context initialization is read-only: do not edit source, run tests, write databases, or perform deployments unless the user's task separately requests and authorizes that work. At task end, flag relevant status-document updates and preserve concurrent edits.
- Communicate task results in Vietnamese, listing changed files, confirmed defects/fixes, test evidence, and remaining blockers.
