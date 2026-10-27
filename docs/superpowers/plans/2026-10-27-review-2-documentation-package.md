# Review 2 Documentation Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organize, reconcile, render, and verify the VISTA Review 2 documentation package against the official seven-page guideline, the approved project identity, the current repository, and the new 23-page draw.io source.

**Architecture:** `docs/review-2/` is the submission workspace; immutable imports live in `99-archive`, working artifacts live in numbered folders, evidence is separated from designed-but-unexecuted tests, and only verified final PDFs enter `07-submission`. `docs/diagrams/` remains the canonical text-diagram source while `04-diagrams/` carries draw.io source, exports, and a cross-source manifest.

**Tech Stack:** DOCX/OOXML, PDF/Poppler, diagrams.net/draw.io XML, Mermaid, Markdown, XLS/XLSX, Git.

**Spec:** `/home/quangduc/.codex/attachments/686b9757-1efc-4af9-bb09-881ac9321bd7/Pasted text.txt`

## Global Constraints

- Output course prefix is `SEP490`; official guideline prefix `SWP490` must be documented as an intentional user-directed deviation.
- Project code is `FA26SE183`; group is `GFA26SE94`; supervisor is Lâm Hữu Khánh Phương.
- Preserve the officially approved project title until an approved source proves a replacement.
- Do not modify application code, database, CI, commits, pushes, or the `review-2` tag.
- Do not claim tests, CI, staging, deployment, approval, signatures, or physical robot execution without evidence.
- Keep pending/draft artifacts out of `07-submission/`.
- Preserve original imports and user changes.

---

### Task 1: Canonical workspace and provenance

**Files:**
- Create: `docs/review-2/README.md`
- Create: `docs/review-2/manifest.sha256`
- Create: `docs/review-2/00-guidelines/user-requirements.md`
- Create: `docs/review-2/99-archive/imported-2026-10-27/`
- Move: `docs/review2/*` to `docs/review-2/05-tracking/repo-audit/`

- [ ] Create the approved numbered directory tree.
- [ ] Copy the complete imported package and supplied inputs into the dated archive.
- [ ] Generate SHA-256 provenance and identify only hash-confirmed duplicates.
- [ ] Move the existing repo audit without overwriting user changes and update references.
- [ ] Write the status matrix and submission gates in the root README.

### Task 2: Official guideline and forms classification

**Files:**
- Create: `docs/review-2/00-guidelines/review-2-guidelines.pdf`
- Create: `docs/review-2/00-guidelines/standard-review-prompt.txt`
- Populate: `docs/review-2/01-registration/`
- Populate: `docs/review-2/02-reports/`
- Populate: `docs/review-2/03-forms/`
- Populate: `docs/review-2/05-tracking/`

- [ ] Keep one canonical copy of byte-identical guidelines and record aliases in the manifest.
- [ ] Extract the standard prompt verbatim from the official guideline.
- [ ] Classify DOCX/PDF pairs as SOURCE, DRAFT, BLOCKED, or FINAL.
- [ ] Normalize working filenames to `SEP490_FA26SE183_R2_*` without altering archived originals.
- [ ] Keep BM02 blocked until the correct tag contains the final inputs; keep BM04 as a post-review draft.

### Task 3: Draw.io source, export, and diagram manifest

**Files:**
- Create: `docs/review-2/04-diagrams/diagramall.drawio.xml`
- Create: `docs/review-2/04-diagrams/manifest.md`
- Create: `docs/review-2/04-diagrams/{architecture,activities,states,database,deployment}/`

- [ ] Parse all 23 draw.io pages in source order, including 16a and 16b.
- [ ] Export each page directly from the XML to SVG and high-resolution PNG with a compatible renderer.
- [ ] Visually inspect every export for missing connectors, fonts, labels, and icons.
- [ ] Map every page to Mermaid/PlantUML source and report usage; record missing deployment diagrams explicitly.
- [ ] Record code/schema mismatches without silently editing the imported XML.

### Task 4: Cross-document traceability and content audit

**Files:**
- Create: `docs/review-2/05-tracking/traceability-matrix.md`
- Create: `docs/review-2/05-tracking/document-audit.md`

- [ ] Build the required Registration-to-test traceability columns.
- [ ] Verify project identity, actors, FRs, acceptance criteria, workflows, states, diagrams, APIs, tests, owners, and implementation status.
- [ ] Record unsupported claims, template residue, identifier conflicts, and required evidence.
- [ ] Extract actual technology versions and document third-party data flows and deployment/rollback status.

### Task 5: Working DOCX reports and forms

**Files:**
- Modify working copies under `docs/review-2/01-registration/`, `02-reports/`, and `03-forms/`.

- [ ] Preserve official templates while removing instructions, examples, and unrelated Java/MVC residue.
- [ ] Reconcile Registration, Report 3, Report 4, BM01, Report 5, and tracking identifiers.
- [ ] Replace Report 3/4 diagrams with exports from the new XML and update captions/cross-references.
- [ ] Complete BM01 sections 0-8 and Appendix A within the specified A4/page constraints.
- [ ] Keep unknown approval, phone, Review 1, staging, evidence, and test fields explicitly blocked.
- [ ] Render every changed DOCX to page images and iterate until layout defects are removed.

### Task 6: Test specification and evidence separation

**Files:**
- Modify working spreadsheets under `docs/review-2/05-tracking/`.
- Create evidence records under `docs/review-2/06-evidence/`.

- [ ] Preserve official worksheet names and structures.
- [ ] Add test specifications for FRs, workflows, transitions, and measurable NFRs without marking unexecuted cases passed.
- [ ] Run safe existing tests where the environment permits and capture command, time, commit SHA, output, and blockers.
- [ ] Reconcile unique test ownership and proposed counts across workflow and member views.

### Task 7: Final rendering and submission gate

**Files:**
- Update: `docs/review-2/README.md`
- Populate only eligible files in `docs/review-2/07-submission/`.

- [ ] Render and visually inspect all working DOCX/PDF artifacts.
- [ ] Verify A4 sizing, tables, headings, TOC, captions, page breaks, and diagram readability.
- [ ] Run placeholder, naming, duplicate, link, and Git-state checks.
- [ ] Leave every blocked artifact outside `07-submission` with a precise reason and required user input.
- [ ] Report completed files, checks, blockers, tag target, working-tree state, and BM02 prerequisites.
