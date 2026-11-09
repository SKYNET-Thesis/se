# Prisma reconciliation and Git release checklist

## Production migration release — completed

- [x] Seven pinned migrations executed in manifest order against Production.
- [x] Production target verified as project `ovijutkvaaxohauvuxbj`, database `postgres`.
- [x] Session Pooler used with TLS `verify-full` and trusted Supabase CA. Direct IPv6 connection was unavailable from the execution host.
- [x] Release transaction recorded all seven rows as `executed` in `public.vista_schema_migrations` with manifest checksums.
- [x] Read-only `postcheck.sql` passed.
- [x] Post-release fingerprint recorded: `1d0453953658bfe9b6db7d14f477c023`.
- [x] AWS deployment was not performed.

## Prisma history reconciliation — blocked, no approval requested yet

- [ ] Recover the original SQL for all nine historical migration names absent from this checkout; verify each file against the Production checksum.
- [ ] Recover exact historical versions for `20261021_school_administration`, `20261025_add_blockly_control_mode`, and `20261104120000_remove_student_auth_identifier`; current local files do not match Production checksums.
- [ ] Re-run Prisma 5.22 `migrate status` after restoring exact history and document the result.
- [ ] Review the pre-existing rolled-back `20261015_symbolic_evaluation_history` row. Preserve both its rolled-back record and its later successful record; do not change either status.
- [ ] Only after historical source recovery and review, separately authorize metadata-only `prisma migrate resolve --applied` for each of the seven already-executed release migrations. Do not execute migration SQL again.
- [ ] Verify all Prisma records and checksums after any separately approved reconciliation.

Do not run `prisma migrate deploy`, `migrate dev`, `db push`, or `migrate reset`
as part of this follow-up. No Prisma reconciliation has been performed.

## Git closeout — pending

- [x] Review the updated README, readiness report, and this checklist against the recorded Production evidence.
- [x] Review the narrow Session Pooler allowlist in `run-release.sh`; include this runner version in the release commit so it matches the verified execution path.
- [ ] Keep the two untracked disposable test harnesses out of the release commit unless they are separately adopted as maintained tooling.
- [ ] Resolve the `origin/main` upstream hazard before any push operation; do not change the upstream in this task.
- [ ] Inspect the remote branch, then use the explicit destination `origin HEAD:refs/heads/chore/main-non-iot-schema-release` only after confirming a new branch or safe fast-forward. Never push to `main`, force-push, or merge as part of this checklist.
- [x] Operator authorized commit and push to the explicit release branch for this closeout. Merge into `main` and AWS deployment remain unauthorized.
