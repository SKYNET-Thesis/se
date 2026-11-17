# Installation

Install dependencies for the selected runtime only. For the Education API and Web, run `sh scripts/setup-dev.sh` and follow [`docs/setup/local-education-development.md`](../setup/local-education-development.md); that path uses a disposable PostgreSQL 17 database and does not need Production access. The root `docker-compose.yml` is a separate legacy service stack, not the Education quickstart. Mobile: `apps/mobile`; control runtime: use the documented LeRobot/Python environment under `web/checkIk`. Do not connect hardware before robot-connection preflight.

