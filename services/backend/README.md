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
