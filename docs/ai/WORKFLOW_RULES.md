# Shared agent workflow

One Claude Code instance, one OpenAI Codex instance, and one Google Antigravity
instance receive independent tasks directly from the user. No agent supervises
another or owns a permanent coordinator, reviewer, or implementation-worker
role.

At the start of a new task/session, each agent reads `PROJECT_CONTEXT.md`,
`ARCHITECTURE.md`, `CURRENT_STATUS.md`, and this file, then checks the current
branch and Git status. Verify relevant status claims against source and
evidence. This initialization does not authorize code edits, tests, database
writes, infrastructure changes, or deployment by itself.

## Task contract

Use this contract when assigning work:

```text
TASK:
SCOPE:
ALLOWED FILES:
EXPECTED OUTPUT:
TEST REQUIREMENTS:
RESTRICTIONS:
```

Agents must stay within the assigned scope. If required work falls outside the
allowed files or scope, explain the dependency and request authorization before
expanding it.

## Coordination and Git

1. Inspect the current branch and `git status` before editing.
2. Establish explicit file ownership for concurrent tasks. Agents must not
   edit overlapping files simultaneously.
3. Preserve unrelated staged, unstaged, and untracked work. Do not copy changes
   between worktrees, or reset, clean, stash, discard, merge, or cherry-pick.
4. Do not commit or push. The user reviews changes and approves integration and
   Git operations.
5. Report exact changed files, verification commands and results, and any
   blockers. Distinguish observed results from assumptions.

## Protected operations

Follow `../../AGENTS.md` and the domain runbooks. Database writes require explicit
authorization for the exact target and scope. No Production writes, AWS
resource mutations, Terraform apply/destroy, deployments, or physical robot
actions without the required explicit approval. Do not run migrations during
documentation/configuration work. Never bypass authorization with disabled
RLS or fabricated ledger records.
