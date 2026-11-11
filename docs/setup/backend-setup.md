# Backend Setup

Setup instructions for the backend service.

## Database

The Education API needs a PostgreSQL 17 database with the VISTA schema. Build a disposable local one from the
repository with `scripts/bootstrap_dev_database.py`; see [`database/README.md`](../../database/README.md).
Do not use `database/vista_database_schema.sql` (legacy Review 2 script) and do not run Prisma `db push` or `migrate`.
