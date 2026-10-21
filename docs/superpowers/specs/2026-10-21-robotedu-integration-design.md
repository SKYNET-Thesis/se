# RobotEdu web-platform integration design

## Goal

Integrate the reusable RobotEdu educational platform into the VISTA repository
without treating it as a mobile application or mixing it with legacy backend
prototypes. The result keeps the current Expo control app intact and makes the
education platform deployable as a web client with its own NestJS business API.

## Scope

This integration moves the active source from `../RobotEdu` into the VISTA
repository. It does not change robot-control behavior, migrate databases, or
replace the existing mobile application.

## Repository layout

```text
se/
  apps/
    mobile/                    Expo control application (unchanged)
  web/
    robot-edu/                 React + Vite educational web platform
    checkIk/                   Existing VR/WebXR surface (unchanged)
  services/
    education-api/             NestJS + Prisma educational business API
    robot-runtime/             Python adapter between API and control runtime
    backend/                   Existing legacy backend (unchanged)
    ai-integration/            Existing AI integration (unchanged)
  edge/
    raspberry-pi-agent/        Hardware-facing agent (unchanged)
  docs/
    education/                 Selected RobotEdu product and operational docs
```

The RobotEdu web source is not placed under `apps/` because it is a browser
platform, not an Expo client. Its source of truth is `web/robot-edu`.

## Module interfaces and seams

`web/robot-edu` is the browser-facing module. Its interface to the business
layer is authenticated HTTP calls to `services/education-api` under the
existing `/api/v1` prefix. It owns browser rendering, education workflows,
Blockly, simulation views, and browser-local state; it does not issue hardware
commands directly.

`services/education-api` is the NestJS business module. It owns identity,
learning, assessment, program, runtime-request, status, and metadata behavior.
It exposes the REST interface and is the only module that reads or writes its
Prisma persistence model.

`services/robot-runtime` is an adapter behind the API's runtime seam. It
translates validated runtime requests into the robot-control contract. It does
not own learners, courses, or authorization policy.

`edge/raspberry-pi-agent` remains the hardware-facing module. It remains the
only existing VISTA code in this integration responsible for communicating
with the follower hardware.

```text
web/robot-edu -> education-api -> robot-runtime -> raspberry-pi-agent -> follower
                     |
                     -> PostgreSQL / Prisma
```

## Source disposition

| RobotEdu source | VISTA destination | Action |
| --- | --- | --- |
| `apps/web` | `web/robot-edu` | Move as the educational web client. |
| `apps/api` | `services/education-api` | Move as the NestJS + Prisma API. |
| `services/robot-runtime` | `services/robot-runtime` | Move as a separately deployable adapter. |
| `docs` | `docs/education` | Copy only active product, API, safety, and security documentation. |
| `backend` | none | Exclude: legacy ASP.NET prototype. |
| `backend-nest-audit` | none | Exclude: audit-only extraction material. |
| `checkIk` | none initially | Compare with `web/checkIk`; do not duplicate or overwrite. |
| root workspace scripts | none initially | Do not import until a VISTA-wide package-manager decision exists. |

## Configuration and deployment

The Vite client receives the API base URL and authentication configuration from
its local `.env`, based on its existing `.env.example`. The NestJS service keeps
its own `.env.example`, Prisma schema, migrations, and Dockerfile. Docker
Compose will gain explicit `education-web`, `education-api`, and, after its
runtime contract is verified, `robot-runtime` services. Existing services keep
their ports and configuration until an endpoint conflict is intentionally
resolved.

No secret, generated dependency directory, Git metadata, or local environment
file is moved.

## Verification

1. Install dependencies within the moved web and API modules using their own
   manifests; do not copy `node_modules`.
2. Run the web production build.
3. Run the NestJS build and its test suite.
4. Run the robot-runtime Python tests.
5. Validate Docker Compose configuration without starting hardware commands.
6. Confirm existing mobile type checking remains unaffected.

## Non-goals

- Porting the browser UI to React Native.
- Replacing the current mobile control app.
- Applying Prisma migrations to a shared or production database.
- Replacing `edge/raspberry-pi-agent` with RobotEdu runtime code.
- Deleting the external `RobotEdu` source directory before integration passes
  verification.
