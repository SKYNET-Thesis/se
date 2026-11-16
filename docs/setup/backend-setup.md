# Education API setup

Setup instructions for the backend service.

## Database

The Education API needs a PostgreSQL 17 database with the VISTA schema. Build a disposable local one from the
repository with `scripts/bootstrap_dev_database.py`; see [`database/README.md`](../../database/README.md).
Do not use `database/vista_database_schema.sql` (legacy Review 2 script), Prisma `db push`, or Prisma Migrate
for schema changes. The normal API URL uses `vista_app_runtime`; `DIRECT_URL` is a local writer URL for Prisma
tooling and local-only seed scripts.

Use [`local-education-development.md`](local-education-development.md) for dependency installation,
disposable database bootstrap, environment setup, API/Web startup, and health checks. The API can start and
report database health without Supabase Auth; authenticated routes require a dedicated non-Production Auth
endpoint.
