# RobotEdu Web Platform Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move RobotEdu's web platform, NestJS learning API, and fail-closed runtime into the VISTA Git repository as independently verifiable modules.

**Architecture:** The browser platform is `web/robot-edu` and calls the NestJS application at `services/education-api` exclusively through `/api/v1`. The API owns learning persistence and reaches `services/robot-runtime` through a private runtime seam. The Compose stack gives the new API host port 3001, preserving the legacy backend at 3000.

**Tech Stack:** React 18, Vite 5, TypeScript, Tailwind CSS, NestJS 11, Prisma 5, PostgreSQL 16, Python standard library, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-21-robotedu-integration-design.md`

## Global Constraints

- Do not modify `apps/mobile`, `edge/raspberry-pi-agent`, `services/backend`, `services/ai-integration`, or `web/checkIk`.
- Never copy `.git`, `.env`, `node_modules`, `dist`, Python caches, or credentials from `../RobotEdu`.
- Preserve NestJS's `/api/v1` prefix and the runtime's committed `hardwareEnabled: false` default.
- Do not apply Prisma migrations, seed databases, start containers, or send robot commands during verification.

---

## Target file structure

```text
web/robot-edu/                 React/Vite educational platform
services/education-api/         NestJS + Prisma business API
services/robot-runtime/         Private Python runtime adapter
docs/education/                 Curated operational and safety documents
docker-compose.yml              Local service topology
```

### Task 1: Import and verify the browser platform

**Files:**
- Create: `web/robot-edu/**` from `../RobotEdu/apps/web/**`, excluding generated/local files
- Modify: `web/robot-edu/.env.example`
- Modify: `web/robot-edu/src/lib/api.ts`
- Test: `web/robot-edu` Vite production build

**Interfaces:**
- Consumes: `VITE_API_BASE_URL`, Supabase browser values.
- Produces: a client that defaults to `http://localhost:3001/api/v1`.

- [ ] **Step 1: Copy the source without nested Git data or local output**

```bash
rsync -a --exclude .git --exclude .env --exclude node_modules --exclude dist ../RobotEdu/apps/web/ web/robot-edu/
```

Expected: package manifest, `src/`, `public/`, and `.env.example` exist. `.git`, `.env`, `node_modules`, and `dist` do not.

- [ ] **Step 2: Set the non-conflicting local API URL**

Set `web/robot-edu/.env.example` to:

```dotenv
VITE_API_BASE_URL=http://localhost:3001/api/v1
```

Set the `baseUrl` fallback in `web/robot-edu/src/lib/api.ts` to:

```ts
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1").replace(/\/$/, "");
```

- [ ] **Step 3: Build only the imported web module**

```bash
cd web/robot-edu
npm ci
npm run build
```

Expected: build exits 0. The generated `dist/` remains ignored.

- [ ] **Step 4: Commit the web module**

```bash
git add web/robot-edu
git commit -m "feat(web): add RobotEdu learning platform"
```

### Task 2: Import and verify the active NestJS API

**Files:**
- Create: `services/education-api/**` from `../RobotEdu/apps/api/**`, excluding generated/local files
- Modify: `services/education-api/.env.example`
- Modify: `services/education-api/README.md`
- Test: existing Jest specifications in `services/education-api/src/**`

**Interfaces:**
- Consumes: database URL, public Supabase JWT settings, MQTT configuration, optional runtime URL.
- Produces: REST endpoints under `/api/v1`, container port 3000, Compose host port 3001.

- [ ] **Step 1: Copy only the NestJS application**

```bash
rsync -a --exclude .git --exclude .env --exclude node_modules --exclude dist ../RobotEdu/apps/api/ services/education-api/
```

Expected: `src/`, `prisma/`, manifest/lockfile, Dockerfile, and `.env.example` exist. Do not import `../RobotEdu/backend` or `../RobotEdu/backend-nest-audit`.

- [ ] **Step 2: Make container and host ports unambiguous**

Keep `PORT=3000` in `services/education-api/.env.example`, immediately preceded by:

```dotenv
# Docker Compose publishes this internal port at http://localhost:3001.
```

Replace the API port claim in its README with:

```markdown
The application listens on container port 3000. The repository Compose stack publishes it at `http://localhost:3001`; its API prefix is `/api/v1`.
```

- [ ] **Step 3: Run API compilation and existing tests without database mutation**

```bash
cd services/education-api
npm ci
npm run build
npm test
```

Expected: build and Jest exit 0. Do not run `prisma migrate` or seed scripts.

- [ ] **Step 4: Commit the API module**

```bash
git add services/education-api
git commit -m "feat(api): add NestJS education service"
```

### Task 3: Import and verify the fail-closed runtime adapter

**Files:**
- Create: `services/robot-runtime/**` from `../RobotEdu/services/robot-runtime/**`
- Create: `services/robot-runtime/Dockerfile`
- Test: `services/robot-runtime/tests/test_runtime.py`

**Interfaces:**
- Consumes: `VISTA_RUNTIME_TOKEN` and `config/runtime.example.json` with `hardwareEnabled: false`.
- Produces: private `/health`, `/status`, `/runs`, `/runs/{runId}/cancel`, and `/stop` endpoints on port 8015.

- [ ] **Step 1: Copy source, test, README, and example config**

```bash
rsync -a --exclude .git --exclude .env --exclude __pycache__ --exclude '*.pyc' ../RobotEdu/services/robot-runtime/ services/robot-runtime/
```

- [ ] **Step 2: Add a standard-library-only image**

Create `services/robot-runtime/Dockerfile`:

```dockerfile
FROM python:3.12-alpine
WORKDIR /app
COPY src ./src
COPY config/runtime.example.json ./config/runtime.example.json
EXPOSE 8015
ENTRYPOINT ["python3", "src/server.py", "--config", "config/runtime.example.json"]
```

- [ ] **Step 3: Verify fail-closed behavior**

```bash
cd services/robot-runtime
VISTA_RUNTIME_TOKEN=local-dev-token python3 -m unittest discover -s tests -v
```

Expected: all tests pass without accessing robot hardware.

- [ ] **Step 4: Commit the runtime module**

```bash
git add services/robot-runtime
git commit -m "feat(runtime): add fail-closed RobotEdu adapter"
```

### Task 4: Curate documents rather than copying the full RobotEdu archive

**Files:**
- Create: `docs/education/VISTA_PRODUCT_RULES.md`
- Create: `docs/education/VISTA_FULL_ENDPOINT_INVENTORY.md`
- Create: `docs/education/FRONTEND_API_HANDOFF.md`
- Create: `docs/education/robot-safety-boundary.md`
- Create: `docs/education/blockly-runtime-mapping.md`
- Create: `docs/education/security/PHASE1_SECURITY_DESIGN.md`
- Create: `docs/education/security/verify_rls_coverage.mjs`
- Create: `docs/education/README.md`
- Test: staged-file secret scan

**Interfaces:**
- Consumes: imported browser, API, and runtime modules.
- Produces: concise onboarding and safety guidance without raw exports or old audit material.

- [ ] **Step 1: Copy the selected documentation**

```bash
mkdir -p docs/education/security
cp ../RobotEdu/docs/VISTA_PRODUCT_RULES.md docs/education/
cp ../RobotEdu/docs/VISTA_FULL_ENDPOINT_INVENTORY.md docs/education/
cp ../RobotEdu/docs/FRONTEND_API_HANDOFF.md docs/education/
cp ../RobotEdu/docs/robot-safety-boundary.md docs/education/
cp ../RobotEdu/docs/blockly-runtime-mapping.md docs/education/
cp ../RobotEdu/docs/security/PHASE1_SECURITY_DESIGN.md docs/education/security/
cp ../RobotEdu/docs/security/verify_rls_coverage.mjs docs/education/security/
```

Never copy `Supabase Snippet Untitled query (3)(1).csv`, environment files, credential material, or one-off checkpoint/audit files.

- [ ] **Step 2: Add the documentation index**

Create `docs/education/README.md`:

```markdown
# RobotEdu documentation

- `VISTA_PRODUCT_RULES.md`: product and access rules.
- `VISTA_FULL_ENDPOINT_INVENTORY.md`: NestJS REST inventory.
- `FRONTEND_API_HANDOFF.md`: browser-to-API guide.
- `robot-safety-boundary.md`: runtime and hardware restrictions.
- `blockly-runtime-mapping.md`: Blockly-to-program mapping.
- `security/`: RLS design and verification script.
```

- [ ] **Step 3: Scan the proposed source before staging**

```bash
rg -n --hidden --glob '!*.example' '(service_role|DATABASE_URL=.*postgres.*:.*@|SUPABASE.*KEY=)' docs/education services/education-api web/robot-edu
git diff --check
```

Expected: no credential value is found and the diff has no whitespace error.

- [ ] **Step 4: Commit documentation**

```bash
git add docs/education
git commit -m "docs: add RobotEdu integration guides"
```

### Task 5: Wire Compose and repository documentation without a port collision

**Files:**
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Test: `docker compose config`

**Interfaces:**
- Consumes: the new API/runtime Dockerfiles and templates.
- Produces: `education-api` at `localhost:3001`; `robot-runtime` internal-only at 8015; existing backend unchanged at 3000.

- [ ] **Step 1: Add API and runtime services**

Append sibling services to `docker-compose.yml` without changing `backend` or `ai-integration`:

```yaml
  education-api:
    build: ./services/education-api
    env_file:
      - ./services/education-api/.env.example
    environment:
      MQTT_HOST: mqtt
      ROBOT_RUNTIME_BASE_URL: http://robot-runtime:8015
    ports:
      - "3001:3000"
    depends_on:
      - postgres
      - mqtt
      - robot-runtime

  robot-runtime:
    build: ./services/robot-runtime
    environment:
      VISTA_RUNTIME_TOKEN: local-dev-token
    expose:
      - "8015"
```

`local-dev-token` is local-only configuration. Replace it with secret-managed configuration before shared deployment; do not publish port 8015 to the host.

- [ ] **Step 2: Document local module entry points**

Append to `README.md`:

```markdown
## RobotEdu web platform

- Web client source: `web/robot-edu` (`npm ci && npm run dev`).
- NestJS education API: `services/education-api`; Compose publishes `http://localhost:3001/api/v1`.
- Private runtime: `services/robot-runtime`; it is fail-closed and has no host port.
```

- [ ] **Step 3: Validate Compose only**

```bash
docker compose config
```

Expected: `backend` maps `3000:3000`, `education-api` maps `3001:3000`, and runtime has no `ports` mapping.

- [ ] **Step 4: Commit service topology**

```bash
git add docker-compose.yml README.md
git commit -m "chore: wire RobotEdu local services"
```

### Task 6: Verify the imported source and hand it off

**Files:**
- Modify: none, unless a verification failure requires a focused correction
- Test: all module builds/tests, Compose model, mobile typecheck

**Interfaces:**
- Consumes: the paths and configuration from Tasks 1-5.
- Produces: verified RobotEdu source in `se/`, while `../RobotEdu` remains a rollback reference.

- [ ] **Step 1: Run the non-hardware verification suite**

```bash
(cd web/robot-edu && npm run build)
(cd services/education-api && npm run build && npm test)
(cd services/robot-runtime && VISTA_RUNTIME_TOKEN=local-dev-token python3 -m unittest discover -s tests -v)
docker compose config
(cd apps/mobile && npm run typecheck)
```

Expected: every command exits 0. Do not start containers, migrate a database, seed data, or command a robot.

- [ ] **Step 2: Verify final Git state**

```bash
git status --short
git diff --check HEAD
git log --oneline -5
```

Expected: only reviewed RobotEdu changes were committed; pre-existing unrelated untracked files remain untouched.

- [ ] **Step 3: Hand off the final locations**

Report:

```text
se/web/robot-edu
se/services/education-api
se/services/robot-runtime
se/docs/education
```

State that `../RobotEdu` remains untouched until the user has validated the imported modules in their own target environment.
