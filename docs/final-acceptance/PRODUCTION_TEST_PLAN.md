# VISTA Production test plan (frozen 2026-11-27)

Scope: Education Platform on Production (`https://skynex.best`, API `https://api.skynex.best/api/v1`). Physical SO-101, Desktop Lab Station and VLA are **out of scope for the Education Platform acceptance** and are tracked only as IOT/SAFE cases in the matrix (status NOT RUN until the 2026-11-28 commissioning).

## 1. Principles
1. **Synthetic data only**, in the E2E organization (see `PRODUCTION_TEST_DATA_MANIFEST.md`). Never use real student data. Do not touch `VTEST112710` (owner-reserved) or `E2ES01`.
2. **No secrets in Git or logs.** Credentials live in protected files outside the repository (directory 0700, file 0600) referenced by name only.
3. **No hardware.** Runtime stays `MOCK_RUNTIME`, `hardwareEnabled=false`, `adapterMode=fake_follower`. A WF03 run in Production is a *simulation* run (`physical:false`).
4. **Owner approval required** for: merging `main`, Production deploy, migrations, Terraform, new AWS resources/Things/certificates, secret changes, account resets, physical commissioning, Desktop repo changes.
5. **One heavy workload at a time**; each test is idempotent or has a cleanup step (End Lab Session, release reservation).
6. A test is PASS only with evidence (API response, DB/worker log, or screenshot). Missing evidence = NOT RUN, never PASS.

## 2. Entry criteria
- Production API/Web SHA equals the intended `main` SHA (`/api/v1/version`, `version.json`).
- Education CI green on that SHA; `schema-gate` green; Production DB ledger contains `20261127_s_classroom_lab_sessions`.
- Containers `education-api`, `iot-feedback-worker`, `recordings-worker`, `digital-twin` healthy; SQS feedback/recordings queues and DLQs = 0.
- For WF03: Edge (R1 + CHECKIK fake follower) running and Shadow `connected`, age < 15 s.

## 3. Execution order
1. Public/auth (AUTH) → 2. System Admin (SA) → 3. School Admin (SCHOOL) → 4. Instructor (INST) → 5. Student (STU) → 6. LMS/QUIZ/ASSIGN → 7. ROBOT/LAB → 8. WF01 → WF02 → WF03 → WF04 → 9. SEC (negative/authorization) → 10. IOT/SAFE (only after the Edge owner confirms; physical cases only on 2026-11-28 under supervision).

## 4. Exit criteria
Education Platform accepted when every AUTH…WF04/SEC case is PASS or a documented NOT RUN with owner-accepted reason, no open Critical/High defect, and `FINAL_DEFECT_REGISTER.md` is current. Physical readiness is a **separate** decision (IOT/SAFE).

## 5. Roles and accounts
| Role | Account (reference only) |
|---|---|
| System Admin (main) | `admin@vista.demo` — password owner-held |
| System Admin (E2E) | `e2e.sysadmin.r1126-1901@vista.demo` |
| School Admin / Instructor (E2E) | `e2e.instructor.r1126-1901@example.com` |
| Student | `VTEST112701` (acceptance), `VTEST112702`–`09` (spare), `VTEST112710` (owner-reserved, do not use) |

## 6. Verification channels
Browser (headless Chrome via CDP), HTTP API with Bearer JWT, SSM read-only Production DB queries, `docker logs` of workers, `aws sqs get-queue-attributes`, `aws iot` read-only.
