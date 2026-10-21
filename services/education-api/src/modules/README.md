# VISTA NestJS module layout

Each folder in this directory is a business capability, not a database-table
folder. A module owns its controller, service, DTOs, tests and internal helpers.

```text
modules/
├── identity/       # Supabase JWT bridge, /me, guards and permission helpers
├── learning/       # classroom delivery, programs, assessment and experiments
├── metadata/       # safe, authorization-aware metadata reads
├── runtime/        # read-only CHECKIK runtime adapter boundary
├── health/         # service health endpoint
└── status/         # retained runtime status integration
```

`dto/` folders contain request-validation contracts. Database entities are
defined once in `../../prisma/schema.prisma` because VISTA uses Prisma; do not
duplicate them as TypeORM-style entities. Add a TypeScript response/domain type
inside the owning module only when it improves a non-database API contract.

`learning` is intentionally a cohesive module for now because delivery,
program ownership, assessment and experiment authorization share the same
classroom-scope boundary. Split it into submodules only when an independent
module boundary is proven; preserve its current REST routes and scope checks.
