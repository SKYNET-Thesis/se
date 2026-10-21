# VISTA Business API

NestJS API for the VISTA educational workflow and its boundary to the robot control plane.

## Layout

```text
src/
  common/       Shared infrastructure: Prisma and HTTP error handling
  modules/      Business modules, grouped by capability
    health/      Service health checks
    status/      MQTT/control-plane availability
prisma/         PostgreSQL schema and migrations
```

The current extracted implementation provides health and MQTT-status endpoints.
VISTA modules own their controller, service, DTOs, tests and local helpers.
Prisma database models live once in `prisma/schema.prisma`; this API does not
duplicate them as TypeORM-style entities.

## Run locally

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run start:dev
```

The application listens on container port 3000. The repository Compose stack
publishes it at `http://localhost:3001`; its API prefix is `/api/v1`. Do not
commit `.env` or Supabase credentials.
