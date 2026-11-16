# VISTA LMS Frontend & E2E Acceptance Report

**Review date:** 2026-11-15 (Asia/Ho_Chi_Minh)  
**Checkout:** `feat/course1-learning-experience`, HEAD `29fa71a`  
**Acceptance status:** **Not ready** — frontend unit/build checks pass, but the required authenticated real API/browser acceptance and all eight journeys are not evidenced on this checkout.

## Phase A–H frontend completion matrix

The prompt does not define canonical A–H phase names. The mapping below groups its workstreams and is an audit aid, not a claim about official phase names.

| Phase | Scope | Frontend evidence in checkout | Status |
| --- | --- | --- | --- |
| A | Course Builder | Admin course catalog/editor, canonical Course → Lesson → Section → Activity authoring, reorder, preview, publish components and focused specs exist. Existing E2E spec exercises a seeded editor preview and publish path. Create/edit and route behavior are not proven against live API here. | Implemented; integration partial |
| B | Question Bank | Quiz authoring panel searches/filter/paginates published bank questions and supports assignment selection, ordering, pass threshold and preview. Reported prior Discard Draft 15/15 is user-provided checkpoint, not rerun during this audit. No CSV/XLSX Question Bank import UI/API was found. | Implemented partial; import gap |
| C | Quiz delivery | Classroom quiz delivery panel and teacher assignment authoring exist; one Playwright scenario drafts and publishes a classroom delivery. Not executed against API in this audit. | Implemented; E2E unverified |
| D | Student learning | Catalogue, My Learning tabs, Continue Learning, course/lesson/activity views, progress queries and quiz attempt/result components/specs exist. Persistence across refresh/relogin has no acceptance scenario. | Implemented; E2E unverified |
| E | Classroom & school admin | Classroom lifecycle, member/student import, allocation and school admin pages/components/specs exist. Classroom create/enroll and instructor allocation have no real-browser journey in this checkout. | Implemented partial; E2E unverified |
| F | Instructor review & grading | Teacher assignments, submissions/review, grading/feedback and evidence query components/specs exist. Assignment submission → instructor review/grade/release is not covered by current Playwright scenario. | Implemented partial; E2E unverified |
| G | Learning media & notifications | Learning Media authoring/library/preview UI and upload/download API client are present. S3-compatible integration is separately opt-in; no local service was running. No verified notification UI/API journey was established. | Partial; storage and notifications unverified |
| H | Resilience, access & responsive UI | API error/loading states and role gates are present in source/specs. One E2E spec collects page errors for a single scenario. No cross-school denial, retry/interruption, or systematic 320/375/768/1024/1440 browser sweep was run. | Partial; acceptance missing |

## E2E evidence

- `cd web/robot-edu && npm test` — **55 test files passed, 321 tests passed** on this checkout.
- `cd web/robot-edu && npm run build` — **passed**. Vite reports the main JS chunk is about 3.1 MB (minified), above its 500 kB advisory threshold.
- `cd web/robot-edu && npm test -- --runInBand` — failed before tests because Vitest does not support Jest's `--runInBand` option. Correct command above passed.
- `web/robot-edu/tests/e2e/course-builder-delivery.spec.ts` contains one real-browser scenario: seeded course editor → learner preview → publish → school admin quiz delivery → student quiz attempt/result. It uses the Education API and local auth when configured; it is not a mocked-API acceptance test. It was **not run** in this audit.
- At inspection, `127.0.0.1` ports **3000, 4173, 54321, 55432, 9000, 9001** were all closed. The Playwright runbook requires API, local auth/JWKS, web server, and an isolated disposable PostgreSQL fixture. Its fixture seed performs DB writes and the runbook requires consolidated database approval; no approval naming the isolated DB/scope was supplied. The opt-in S3 integration also had no local service available. No database, AWS, or remote service was touched.
- The prompt's prior Question Bank Discard Draft 15/15 checkpoint is acknowledged as supplied context only; it was not reproduced in this run.

## Eight required journeys

| # | Journey | Evidence/status |
| --- | --- | --- |
| 1 | Instructor creates and publishes a course | Current spec uses a seeded system-admin course. No instructor-authored create/publish journey; real API run absent. |
| 2 | Instructor creates and assigns a quiz | Current spec covers school-admin delivery of a pre-existing canonical quiz. Quiz authoring/selection and instructor assignment were not exercised end to end. |
| 3 | Student completes quiz and receives grading | Present in the single E2E spec; not executed on this checkout. |
| 4 | Student submits assignment and instructor reviews it | Not covered by E2E. UI/API pieces exist; real delivery-to-review path unverified. |
| 5 | School Admin creates classroom and enrolls students | Not covered by E2E. Lifecycle/import UI and component specs exist. |
| 6 | Cross-school access is denied | Not covered by frontend E2E. Must be asserted at API boundary using two isolated school identities/resources. |
| 7 | Persistence after refresh and relogin | Not covered by E2E. Existing `MyLearningReload` test is a UI-level test, not real API persistence/relogin acceptance. |
| 8 | Error, retry, and interruption recovery | No full browser/API recovery scenario found or executed. |

## Defects and gaps found

- The acceptance suite has one composite scenario, not eight independent user journeys, and currently assumes a pre-seeded course, classroom, quiz, and identities.
- The composite scenario signs in as admin, school admin, and student and asserts quiz grade, but does not create a course as an instructor, create/author the quiz, submit a teacher-graded assignment, create/enroll a classroom, test tenant denial, or verify refresh/relogin persistence/recovery.
- Quiz Builder exposes search, question type filtering, pagination, question selection/order, pass threshold, and preview. No Question Bank CSV/XLSX import flow or corresponding API route was found. Do not add an import UI until Codex supplies an approved API contract; multipart is explicitly out of scope until its dependencies are approved.
- The main production JS output triggers Vite's large-chunk warning; it is a performance follow-up, not a functional acceptance failure.
- Component tests emit React `act(...)` and router future-flag warnings. They do not fail the test suite.

No code defect was reproduced in the current web suite, so no LMS implementation behavior was changed during this audit. Existing unrelated changes were preserved.

## Backend/API blockers for Codex

1. **Question Bank bulk import:** frontend has no supported upload contract/route for CSV/XLSX. If import is required, define accepted formats, validation/preview semantics, authorization, limits, error shape, persistence/version rules and whether it is non-multipart; then the UI can follow that contract. Current `/author/question-bank/...` endpoints support question authoring/versioning and quiz composition, not import.
2. **Eight-journey E2E fixture/API coverage:** current fixture and browser spec do not expose the separate school identities/resources and endpoints needed for classroom creation/enrollment, cross-tenant denial, assignment submission/grading/release, and refresh/relogin persistence. The API contract/seed fixtures need to supply those isolated personas and records before the frontend can prove these journeys.
3. **Test environment gate:** start the approved disposable PostgreSQL and local auth/API services and authorize the exact fixture writes per `docs/operations/phase-2-4-3-local-acceptance.md`. This is an environment/approval prerequisite, not a request to use shared or Production data.
4. **Media acceptance:** provide an available local S3-compatible endpoint and ensure the API's upload completion/ready-object contract is configured. Keep multipart disabled until schema/API approval.

## Remaining UI work

- Add the missing independent Playwright journeys and run them against the real Vite app + Education API + disposable PostgreSQL + local S3 for media paths. Do not use mocked LMS APIs for acceptance.
- Verify the five target widths: 320, 375, 768, 1024, 1440 px; capture overflow/navigation/dialog defects and fix only reproduced issues.
- Verify error, loading, retry, interrupted upload/attempt, and re-login states in real browser workflows.
- Verify Question Bank create/edit/version/publish/search/filter/page/discard flows against the actual API; only the supplied prior discard result is currently available.
- Verify media document/image/video access and failure behavior against local S3; no actual storage evidence is available yet.
- Add notification display/failure coverage once a supported LMS notification contract/UI path is identified.

## Acceptance readiness

**Not ready for LMS acceptance.** The web component/page suite and production build pass, and the codebase has a promising single real-browser course/delivery/quiz journey. The requested acceptance requires eight real API/UI journeys, persistence/security/error recovery evidence, responsive widths, and local media integration; those checks are not reproducible in this session because isolated services are offline and DB fixture writes require the documented approval. This report intentionally does not claim the LMS frontend or E2E mission is complete.
