# VISTA architecture reference

This page is a short map to the repository's detailed architecture and safety
records. Treat current source and operational records as evidence; diagrams or
plans marked legacy/planned do not establish implemented behavior.

## Learning platform

The learning content hierarchy is Course → Lesson → Section → Activity. Reuse
the canonical Question Bank for knowledge checks and preserve immutable quiz
attempt snapshots. Enforce classroom membership and tenant authorization at
the server boundary. Learning Media uses a private S3 bucket with authorized,
time-limited access.

Relevant details: [education workflows](../education/README.md), [product
rules](../education/VISTA_PRODUCT_RULES.md), [C4 containers](../diagrams/architecture/c4-2-container.md), [data flow](../architecture/data-flow.md), and
[Learning Media operations](../operations/phase-2-4-3-local-acceptance.md).

## Database

Production schema changes belong to the versioned SQL migration runner and
manifest under `database/migrations/`. Prisma is used for the application data
model/client; Prisma Migrate and `db push` are not Production DDL mechanisms.
Never edit released migrations or manipulate migration ledgers to force
success. Preserve RLS, grants, and tenant authorization.

Details: [Production migration ownership](../operations/production-migration-ownership.md)
and [database migration documentation](../../database/migrations/README.md).

## Robot execution and infrastructure

Browser code requests learning actions through the authorized VISTA API. The
robot runtime validates canonical steps and owns run sequencing; CHECKIK owns
hardware readiness, exclusive control, Stop/E-stop, and hardware lifecycle.
Fail closed when authorization, readiness, feedback, or cleanup is uncertain.
Preserve these boundaries and require explicit operator approval for physical
execution and infrastructure changes.

Details: [robot safety boundary](../education/robot-safety-boundary.md),
[AWS IoT SO-101 runbook](../operations/aws-iot-so101.md), and
[deployment architecture](../architecture/deployment-architecture.md).

## Current implementation caveat

The repository contains both the newer education-platform implementation and
legacy robot-learning/teleoperation subsystems. The education C4 diagram is the
canonical platform container view; the legacy container diagram explicitly
describes a separate runtime implementation view. Verify behavior in the
assigned code and current tests before describing it as implemented.
