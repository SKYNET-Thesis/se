# VISTA Diagrams (Mermaid source)

Every diagram of Report 4 (SDD) is stored here as Mermaid source so it can be reviewed in pull requests and rendered directly on GitHub. These files are the **source of truth**; the images in Report 4 are exports of them.

```
docs/diagrams/
├── README.md
├── architecture/
│   ├── c4-1-system-context.md
│   ├── c4-2-container.md
│   └── c4-3-backend-components.md
├── data/
│   ├── erd-conceptual.md
│   ├── erd-logical.md                 # 5 diagrams: pages 13, 14, 15, 16a, 16b
│   └── erd-physical.md                # 6 diagrams: pages 17–22
├── workflows/
│   ├── activity-wf01-school-administration.md
│   ├── activity-wf02-learning-assignment.md
│   ├── activity-wf03-robot-experiment.md
│   └── activity-wf04-ai-data-teacher-review.md
└── states/
    ├── state-experiment-session.md
    ├── state-robot-execution.md
    ├── state-learning-submission.md
    └── state-classroom-assignment.md
```

## Index

| Report 4 page | Diagram | File |
|---|---|---|
| 01 | C4 Level 1 – System Context | `architecture/c4-1-system-context.md` |
| 02 | C4 Level 2 – Containers | `architecture/c4-2-container.md` |
| 03 | C4 Level 3 – Backend components | `architecture/c4-3-backend-components.md` |
| 04–07 | Activity WF-01 … WF-04 | `workflows/activity-wf0*.md` |
| 08–11 | State machines (4 entities) | `states/state-*.md` |
| 12 | Conceptual ERD | `data/erd-conceptual.md` |
| 13, 14, 15, 16a, 16b | Logical ERD: School & Access; Curriculum & Assessment; Robots & Experiments; Programs & Assessment; AI & Datasets | `data/erd-logical.md` |
| 17–22 | Physical ERD: Identity & School; Curriculum; Programs & Assessment; Robot Resources; Experiment; AI & Model Lifecycle | `data/erd-physical.md` |

The data model therefore contains **12 Mermaid diagrams**: one conceptual,
five logical and six physical. Report 4 page 16 is split into pages 16a and
16b, which is why the ERD count is 12 rather than 11.

## How to view and render

- **GitHub** renders the ```` ```mermaid ```` blocks automatically.
- **VS Code**: install a Mermaid preview extension.
- **Export PNG/SVG for the report**: `npx @mermaid-js/mermaid-cli -i docs/diagrams/states/state-experiment-session.md -o out.md` (the CLI renders every block of a Markdown file).

## Conventions

- One diagram per concern; keep a short caption and the Report 4 figure number at the top of each file.
- Change the Mermaid file first, then re-export the image for Report 4. Do not edit exported images by hand.
- Node and state names must match the code (table names, persisted status values, API terms).
- Figure 03 must be exported from `architecture/c4-3-backend-components.md` and replaced in Report 4 whenever its component-to-module mapping changes.

## Known limitations

- Mermaid has no swimlanes: activity diagrams use one `subgraph` per actor / system, so lane layout is automatic.
- Mermaid `erDiagram` requires a datatype on every attribute. Logical ERDs use generic logical types, while Physical ERDs use the database types from Prisma.
- Logical and Physical ERDs list all columns represented by their selected entities; the corresponding draw.io pages may abbreviate columns as “+N other columns”.
- The self-reference `learning_feedback.parent_feedback_id` is not drawn.

## Open items before Review 2 sign-off

- [ ] **State machines vs code.** Status columns are free-form strings in `schema.prisma`; the proposed state names (Requested, Authorized, Under Review, Archived…) must be mapped to persisted values or renamed.
- [x] **C4 Level 3** design components are mapped to the current NestJS modules: `identity`, `education-admin`, `learning`, `metadata`, `runtime`, `health` and `status`. Planned or partial capabilities remain explicitly labelled.
- [ ] **C4 Level 2**: decide whether Local Robot Runtime is inside or outside the VISTA system boundary.
- [ ] Re-generate `data/erd-logical.md` and `data/erd-physical.md` whenever `services/education-api/prisma/schema.prisma` changes.
- [ ] Replace Report 4 Figure 03 with the latest export of `architecture/c4-3-backend-components.md` before moving the submission tag.

## Review 2 release order

1. Commit the documentation changes and open a pull request.
2. Wait for required CI checks to pass and merge the pull request.
3. Move the annotated `review-2` tag to the merged commit and push the updated tag.
4. Run the final review prompt against the commit resolved by `git rev-list -n 1 review-2`.
