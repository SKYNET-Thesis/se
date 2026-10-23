# WF-01 User Provisioning Implementation Plan

> **For agentic workers:** Execute inline with test-first checkpoints.

**Goal:** Securely provision organization-scoped teachers and students and derive classroom roles.

**Architecture:** Extend existing users/memberships with an organization school profile. Keep Supabase Admin credentials in the Education API and expose one authorized import endpoint.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Supabase Auth Admin REST, React/Vite.

**Spec:** `docs/superpowers/specs/2026-10-22-wf01-user-provisioning-design.md`

## Tasks

- [ ] Add additive school profile migration and Prisma model.
- [ ] Add server-side DTO validation, Supabase invite service, provisioning endpoint, and security/idempotency tests.
- [ ] Remove client classroom-role authority and derive it on the server.
- [ ] Connect import review/results and update users/member UI account-state presentation.
- [ ] Run API, web, Prisma, and diff gates.
