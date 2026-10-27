# VISTA Review 2 Documentation Workspace

This directory is the controlled canonical workspace for VISTA Review 2. It separates
immutable source material, editable working documents, verification evidence,
and files that are genuinely ready for submission.

## Project Identity

| Field | Value | Authority |
|---|---|---|
| Course prefix used for outputs | `SEP490` | Explicit team instruction |
| Prefix printed in the official guideline | `SWP490` | Guideline v1.0; recorded deviation |
| Project code | `FA26SE183` | Team instruction and registration body |
| Group | `GFA26SE94` | Registration package |
| Supervisor | Lâm Hữu Khánh Phương | Registration package |
| Official project title | VISTA: Vision-Language-Action System for Tabletop Manipulation with Dual Robot Arms | Proposed registration; final approval copy still required |
| Product platform designation | VISTA — Robotics & AI Education Platform | Platform component designation |

## Status Vocabulary

| Status | Meaning |
|---|---|
| SOURCE | Immutable input or official template retained for provenance |
| DRAFT / RECONCILED | Editable working document reconciled with repo, rendered to A4 PDF, ready for peer/user review |
| BLOCKED | Cannot be finalized without named evidence, authentic prior approval, or a valid tagged Git revision |
| POST-REVIEW | Post-review document (BM04) to be completed after the Review 2 committee meeting |
| FINAL | Verified against all gates, visually reviewed, and moved to `07-submission/` |

## Artifact Status Matrix

| Artifact | Primary working path | Status | Completed in this cycle | Missing condition / Blocker |
|---|---|---|---|---|
| Official guideline | `00-guidelines/review-2-guidelines.pdf` | SOURCE | Canonical guideline and verbatim standard prompt preserved | None; source-only reference |
| Proposed registration | `01-registration/proposed/SEP490_FA26SE183_R2_Registration.docx` | BLOCKED | Form filled with proposed scope v1.2; A4 PDF rendered | Authentic signed prior registration & Review 1 record needed to combine with BM03 |
| Record of Changes BM03 | `01-registration/record-of-changes/SEP490_FA26SE183_R2_BM03.docx` | BLOCKED | Table filled with proposed scope changes | Authentic signed prior registration to verify baseline |
| Report 1 (Intro) | `02-reports/report-1/SEP490_FA26SE183_R2_Report1.docx` | RECONCILED | Duplicate member removed, official title aligned, 23 pages/12 ERDs updated, A4 PDF rendered (7 pages) | None; ready for review |
| Report 2 (Plan) | `02-reports/report-2/SEP490_FA26SE183_R2_Report2.docx` | RECONCILED | Removed MySQL/GitLab/Eclipse residue, filled real technology stack and deliverables, A4 PDF rendered (10 pages) | None; ready for review |
| Report 3 (SRS) | `02-reports/report-3-srs/SEP490_FA26SE183_R2_Report3.docx` | RECONCILED | Expanded to all 8 mandatory FRs, replaced NFR template prompt residue with concrete metrics, A4 PDF rendered (16 pages) | None; ready for review |
| Report 4 (SDD) | `02-reports/report-4-sdd/SEP490_FA26SE183_R2_Report4.docx` | RECONCILED | Java/MVC samples removed, 12 ERDs (including separate 16a and 16b) embedded, A4 PDF rendered (30 pages) | None; ready for review |
| Report 5 (Testing) | `02-reports/report-5-testing/SEP490_FA26SE183_R2_Report5.docx` | RECONCILED | Filled test types, tool versions, test team ownership, aligned with 82 cases in workbook, A4 PDF rendered (7 pages) | None; ready for review |
| Report 5 Workbook | `02-reports/report-5-testing/SEP490_FA26SE183_R2_TestReport.xlsx` | RECONCILED | All original tabs preserved, 82 test cases fully specified with Pending status | None; ready for review |
| BM01 Design Brief | `03-forms/bm01-design-brief/SEP490_FA26SE183_R2_DesignBrief.docx` | RECONCILED | Sections 0–8 strictly 4 pages A4, Appendix A 2 pages A4 (total 6 pages), font 11, 2cm margins, 82 tests aligned | Requires approved registration to unblock final submission |
| BM02 Self Review | `03-forms/bm02-self-review/SEP490_FA26SE183_R2_SelfReview.docx` | BLOCKED | Template prepared, standard prompt extracted verbatim | Tag `review-2` does not yet contain the new documentation package |
| BM04 Commitment | `03-forms/bm04-commitment/SEP490_FA26SE183_R2_Commitment.docx` | POST-REVIEW | Draft prepared with official form structure | Committee decisions & supervisor signatures after Review 2 meeting (not a pre-review blocker) |
| Diagram set | `04-diagrams/` | RECONCILED | All 23 Draw.io pages directly exported to high-resolution PNG (2x) and SVG in architecture/, activities/, states/, database/; manifest updated; Mermaid text references retained | None; direct export fully completed |
| Test mapping | `05-tracking/test-case-mapping.md` | RECONCILED | 82 committed test cases mapped to codebase unit tests and pending staging/hardware cases | None |
| Submission folder | `07-submission/` | BLOCKED | Kept empty per strict quality gate | Pending resolution of registration signature and Git tagging |

## Distinction Between Review 2 and Defense 1.1

- **Review 2 Focus:** Scope baseline, specification-to-design alignment (Registration → SRS → SDD → BM01 → Test Plan), architecture and database consistency (23 Draw.io pages / 12 ERDs), and self-review via standard prompt.
- **Defense 1.1 Focus:** Live end-to-end demonstrations of the 4 main workflows (with exception paths), staging deployment on AWS, physical dual-arm robot hardware integration, and ≥50% automated test coverage in CI with ≥90% pass rate.
- **Rule:** Lack of physical robot hardware execution or AWS cloud staging at Review 2 is a documented constraint/target, NOT a reason to block technical specifications (Reports 1–5, BM01).

## Git Status and Tag Divergence (BM02 Prerequisites)

| Target | Commit SHA | State | Notes |
|---|---|---|---|
| Annotated tag `review-2` | `27c60b1` | Historical commit (Oct 26) | Does NOT contain the new documentation package, Report 4, or diagrams |
| Working branch HEAD | `2faf9c1` | `fix/wf02-teacher-assignment-integration` | 2 commits ahead of `27c60b1` |
| Working tree | Untracked / Modified | Uncommitted | Contains `docs/review-2/`, `docs/diagrams/`, `scripts/` |

### Required Procedure to Unblock BM02:
1. User reviews and approves the reconciled documentation package in `docs/review-2/`.
2. Commit documentation files and merge to the target branch via pull request.
3. User explicitly moves/creates the annotated tag `review-2` to point to the verified commit SHA.
4. Execute the unchanged standard review prompt against the tagged commit in report-only mode:
   ```bash
   # Standard review prompt execution against tagged revision:
   git checkout review-2
   # Run review prompt without modifying repository files
   ```
5. Populate the exact output and Top 5 findings into BM02, adding only the authorized Team Response column.
