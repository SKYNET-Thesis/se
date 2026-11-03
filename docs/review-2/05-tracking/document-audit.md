# Review 2 Document Audit

Audit date: 27 October 2026. This is an internal reconciliation record, not
the official BM02 run. The official BM02 remains blocked until the final inputs
exist at the `review-2` tag.

## Submission-critical findings

| ID | Severity | Location | Finding | Evidence | Required action |
|---|---|---|---|---|---|
| DA-01 | High | All imported filenames | `FA26S183` omits `E`; working files are normalized to `FA26SE183`. | Registration body and explicit team instruction use `FA26SE183`. | Keep archived names unchanged; use corrected code for outputs. |
| DA-02 | High | Registration/BM03 | The package has no authenticated signed approved registration or Review 1 decision record. | Registration and BM03 contain `[verify]`, `[attach]`, or approval-pending language. | Supply approved registration and Review 1 evidence; do not invent approval history. |
| DA-03 | High | BM02 | The PDF is explicitly pending and contains the sample `Voucher.java` finding. | Imported BM02 metadata and extracted text. | Run the unchanged prompt only after the correct tagged revision exists; preserve raw output. |
| DA-04 | High | Report 4 | The SDD contains unrelated Java/MVC sample diagrams and placeholder feature headings. | Rendered Report 4 pages show `bean`, `view`, `dao`, `ProductController`, `BaseController`; TOC retains `<Feature/Function Name1>`. | Remove template residue and replace with actual NestJS modules, APIs, rules, and sequence sources. |
| DA-05 | High | Report 4 diagrams | The report uses the older image set and omits separate logical page 16b. | New XML has 23 pages and 12 ERDs; imported report says 11 ERD images and combines Programs & AI. | Export all new XML pages and update captions, numbering, TOC, and references. |
| DA-06 | High | State diagrams | Design-level states are not yet mapped to persisted code values. | Prisma status/state fields are strings; diagram notes mark states proposed. | Produce an explicit design-to-code mapping before sign-off; preserve intended states separately. |
| DA-07 | High | Report 5 / tracking | Designed tests and real execution evidence are not separated sufficiently for submission claims. | Report 5 states physical/staging validation is pending; legacy unit-test workbook is not filled. | Complete specifications, run safe tests, and store logs separately without marking blocked tests passed. |
| DA-08 | Medium | Course prefix | Official guideline says `SWP490`; the team explicitly requires output prefix `SEP490`. | Guideline v1.0 and user requirement differ. | Record deviation in README and use `SEP490` for working/final output names. |
| DA-09 | Medium | Report 1 | Team member Phạm Viết Lợi appears twice and template TOC retains `System name1/2`. | Extracted Report 1 text. | Remove duplicate row and replace placeholder headings with actual comparison systems. |
| DA-10 | Medium | Report 3 | SRS TOC retains `<<Feature Name 1>>` and `<<Feature Name 2>>`. | Extracted Report 3 text. | Replace with actual feature groups and refresh TOC. |
| DA-11 | Medium | Registration/Report 4 | These PDFs use Letter while the guideline and BM01 use A4. | PDF metadata: Registration and Report 4 are 612×792 pt; guideline is A4. | Set working DOCX sections to A4 unless an official template explicitly requires Letter. |
| DA-12 | Medium | BM01 | Four workflows have only six listed demo scenarios; WF-04 has no pair, and the total test target remains unknown. | BM01 Appendix A render/text. | Add at least main+exception for every workflow and calculate the proposed total from enumerated transitions. |
| DA-13 | Medium | Report 4 technology declarations | Development versions, third-party data sent, environments, deployment and rollback are incomplete. | Package manifests provide actual versions; no verified staging/prod evidence is present. | Add explicit version/data-flow tables and label staging/production/rollback as planned or blocked where appropriate. |
| DA-14 | Medium | BM04 | BM04 is a post-review form with pending reviewer decisions and signatures. | Guideline section 08 and imported BM04. | Keep as BLOCKED draft; never place in pre-review submission. |
| DA-15 | Low | Guideline files | Two imported guideline PDFs are byte-identical. | Both hashes are `5c8b8c...40bc7`. | Keep one canonical copy and preserve both aliases in archive/provenance. |

## Current implementation evidence

- NestJS imports the `identity`, `education-admin`, `learning`, `metadata`,
  `runtime`, `health`, and `status` modules.
- `learning` owns assignment delivery, attempts, programming/versioning,
  submissions, assessment, feedback/reflection, schematic experiments, and a
  physical-execution integration boundary.
- `runtime` exposes a read-only CHECKIK health/status adapter; it is not proof
  of deployed hardware execution.
- `metadata` exposes authorization-aware catalogue and provenance reads; its
  comments explicitly say no provider/storage/runtime is configured for
  capture, training, inference, or evaluation writes.
- Docker and GitHub Actions files exist, but existence alone is not evidence of
  staging, production, rollback, or green CI.

## Technology declarations grounded in manifests

| Area | Verified repository declaration | Qualification |
|---|---|---|
| Web | React `^18.3.1`, Vite `^5.2.0`, TypeScript `^5.5.4`, Vitest `^2.1.9` | Declared in `web/robot-edu/package.json`; lockfile resolves exact installs. |
| Education API | NestJS core `^11.0.0`, Prisma/client `^5.21.0`, TypeScript `~5.9.2`, Jest `^30.5.2` | Declared in `services/education-api/package.json`. |
| Mobile | Expo `~57.0.31`, React `19.2.3`, React Native `0.86.3`, TypeScript `~6.0.3` | Optional/secondary scope must not be presented as a mandatory education workflow without Registration support. |
| Database/Auth | PostgreSQL and Supabase Auth boundary through Prisma/JWT integration | Actual hosted environment and data residency are not verified here. |
| Source/CI | GitHub and six workflow files | Green runs and branch protection require external evidence. |
| Deployment | Root Compose and service Dockerfiles | Dev packaging exists; staging, production, and rollback are BLOCKED pending infrastructure evidence. |
| AI usage | Codex-assisted specification/design/document review in this workspace | Exact model identity for official BM02 must be recorded only when the tagged run occurs. |

## Required external-service disclosure for Report 4

| Service | Purpose | Data potentially sent | Current evidence |
|---|---|---|---|
| Supabase Auth/PostgreSQL | Authentication and persistent education data | Identity claims, memberships, classroom, learning and experiment metadata | Integrated in code/config; production tenancy not verified |
| Local Robot Runtime/CHECKIK | Device readiness, bounded execution, status and telemetry | Authorized run identifiers, program/configuration and runtime status | Client/boundary code exists; physical E2E evidence blocked |
| AI/model service or Hugging Face | Model/dataset metadata and future AI operations | Model/checkpoint/dataset identifiers and approved observations/configuration | Read-only metadata exists; provider execution is planned/not configured |
| Object/evidence storage | Experiment media/artifact references | Images/video/artifacts and metadata | Schema/URLs exist; operational storage provider is not verified |

