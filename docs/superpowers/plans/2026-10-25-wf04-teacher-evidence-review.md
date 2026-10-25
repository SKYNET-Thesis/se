# WF-04 Teacher Evidence Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the real teacher Submission review with persisted robot-learning evidence and bounded C3 persistence.

**Architecture:** Compose one teacher-authorized server projection rooted at Submission, and render it in the existing review page. Reuse existing C3, Assessment, Feedback, Experiment, Dataset, and Model metadata structures without migration.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React, TanStack Query, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-wf04-teacher-evidence-review-design.md`

## Global Constraints

- No migration, new permissions, training worker, VLA inference, runtime query, or CHECKIK browser access.
- Authorization always begins at Classroom → Attempt → Submission.
- Preserve WF-01, WF-02, and WF-03 semantics.

### Task 1: Teacher evidence projection

- [ ] Add failing authorization and evidence projection tests.
- [ ] Batch-load Experiment, events, artifacts, Robot/Control Session, C3, Dataset, and model metadata.
- [ ] Sanitize output and run focused API tests.

### Task 2: C3 persistence integration

- [ ] Add failing linkage/reflection reload tests.
- [ ] Link finalized DemonstrationEpisode to Submission-backed LearningExperiment.
- [ ] Persist reflection using `learning_reflections`.

### Task 3: Teacher evidence UI

- [ ] Add presentation tests for evidence classification and safe optional metadata.
- [ ] Extend the existing Teacher Submission Review page.
- [ ] Preserve assessment and feedback behavior.

### Task 4: Documentation and quality gate

- [ ] Document architecture and limitations in `docs/education/wf04-teacher-evidence-review.md`.
- [ ] Run API/web tests and builds, C3/WF-03 regressions, Prisma validation, and `git diff --check`.
