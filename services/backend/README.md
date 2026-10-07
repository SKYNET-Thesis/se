# OmniArm Backend

NestJS API, websocket, persistence, and orchestration service for OmniArm SE.

## Development

```bash
npm install
npm run start:dev
```

The API listens on `http://localhost:3000`. Health is available at `/health`,
the status endpoint at `/api/status`, and development Swagger at `/docs`.

Configuration is read from `PORT`, `POSTGRES_*`, `DATABASE_URL`, and `MQTT_*`
environment variables. See `.env.example` for the container defaults.

## Structure

The backend is organized by feature rather than technical layer:

```text
src/
	common/       Cross-cutting HTTP and security concerns
	features/
		health/     Controller -> service -> repository
		status/     Controller -> service -> repository
```

Controllers own HTTP transport and validation. Services own business rules and
authorization checks. Repositories own persistence and external state access;
database queries are kept inside repositories.
