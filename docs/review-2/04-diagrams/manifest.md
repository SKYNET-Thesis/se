# Review 2 Diagram Manifest

The authoritative editable visual source supplied for Review 2 is
`diagramall.drawio.xml` (23 pages). All 23 pages have been directly exported
to high-resolution PNG (2x scale) and SVG format using the local headless Draw.io
renderer (`scripts/export_all_drawio_pages.js`), located in their respective
type subdirectories (`architecture/`, `activities/`, `states/`, `database/`).
The `mermaid-reference/` folders are retained as repository-friendly text-based
code equivalents.

Direct Draw.io Export Execution Status: COMPLETED (23 PNGs, 23 SVGs).

Source: `diagramall.drawio.xml`, SHA-256
`649d4a444a5a08826b557919500f0e05dcf29244789ffad4265dca58c7e1a958`.
The source contains 23 ordered pages. “Reviewed” and “Fixed” are source-page
labels, not proof of code or schema conformance.

| Order | Page ID | Source page name | Type | Direct export basename | Text source | Report usage | Verification status |
|---:|---|---|---|---|---|---|---|
| 1 | `v1` | 01 C4 Level 1 - Reviewed | Architecture | `architecture/01-c4-level-1` | `docs/diagrams/architecture/c4-1-system-context.md` | Report 4 Figure 01 | Requires actor/boundary check |
| 2 | `v18` | 02 C4 Level 2 - Fixed | Architecture | `architecture/02-c4-level-2` | `docs/diagrams/architecture/c4-2-container.md` | Report 4 Figure 02 | Runtime boundary open decision |
| 3 | `v35` | 03 C4 Level 3 - Reviewed | Architecture | `architecture/03-c4-level-3` | `docs/diagrams/architecture/c4-3-backend-components.md` | Report 4 Figure 03 | Text source maps design names to actual modules |
| 4 | `2` | 04 Activity WF-01 - School Administration & Robot Resource Allocation | Activity | `activities/04-activity-wf01` | `docs/diagrams/workflows/activity-wf01-school-administration.md` | Report 4 Figure 04; BM01 WF-01 | Code/test reconciliation required |
| 5 | `33` | 05 Activity WF-02 - Learning & Assignment Management | Activity | `activities/05-activity-wf02` | `docs/diagrams/workflows/activity-wf02-learning-assignment.md` | Report 4 Figure 05; BM01 WF-02 | Code/test reconciliation required |
| 6 | `62` | 06 Activity WF-03 - Robot Experiment Execution | Activity | `activities/06-activity-wf03` | `docs/diagrams/workflows/activity-wf03-robot-experiment.md` | Report 4 Figure 06; BM01 WF-03 | Separate schematic and physical evidence |
| 7 | `94` | 07 Activity WF-04 - AI/Data Integration & Teacher Review | Activity | `activities/07-activity-wf04` | `docs/diagrams/workflows/activity-wf04-ai-data-teacher-review.md` | Report 4 Figure 07; BM01 WF-04 | External AI execution remains planned |
| 8 | `121` | 08 State Machine - Experiment Session | State | `states/08-state-experiment-session` | `docs/diagrams/states/state-experiment-session.md` | Report 4 Figure 08 | Proposed states; persisted-value mapping required |
| 9 | `148` | 09 State Machine - Robot Execution | State | `states/09-state-robot-execution` | `docs/diagrams/states/state-robot-execution.md` | Report 4 Figure 09 | Proposed states; runtime mapping required |
| 10 | `176` | 10 State Machine - Learning Submission | State | `states/10-state-learning-submission` | `docs/diagrams/states/state-learning-submission.md` | Report 4 Figure 10 | Proposed states; persisted-value mapping required |
| 11 | `200` | 11 State Machine - Classroom Assignment | State | `states/11-state-classroom-assignment` | `docs/diagrams/states/state-classroom-assignment.md` | Report 4 Figure 11 | Proposed states; persisted-value mapping required |
| 12 | `erd0` | 12 Conceptual ERD | Database | `database/12-conceptual-erd` | `docs/diagrams/data/erd-conceptual.md` | Report 4 Figure 12 | Conceptual-only relationships identified in source |
| 13 | `erd1` | 13 Logical ERD — SCHOOL & ACCESS | Database | `database/13-logical-school-access` | `docs/diagrams/data/erd-logical.md` | Report 4 Figure 13 | Schema comparison required |
| 14 | `erd2` | 14 Logical ERD — CURRICULUM & ASSESSMENT | Database | `database/14-logical-curriculum-assessment` | `docs/diagrams/data/erd-logical.md` | Report 4 Figure 14 | Schema comparison required |
| 15 | `erd3` | 15 Logical ERD — ROBOTS & EXPERIMENTS | Database | `database/15-logical-robots-experiments` | `docs/diagrams/data/erd-logical.md` | Report 4 Figure 15 | Schema comparison required |
| 16 | `erd4` | 16a Logical ERD — Programs & Assessment | Database | `database/16a-logical-programs-assessment` | `docs/diagrams/data/erd-logical.md` | Report 4 Figure 16a | Must not be merged with 16b |
| 17 | `fCDUQ5n-0Wk9n6PrYOj1` | 16b Logical ERD — AI & Datasets | Database | `database/16b-logical-ai-datasets` | `docs/diagrams/data/erd-logical.md` | Report 4 Figure 16b | Must not be omitted |
| 18 | `erd5` | 17 Physical ERD — IDENTITY & SCHOOL | Database | `database/17-physical-identity-school` | `docs/diagrams/data/erd-physical.md` | Report 4 Figure 17 | Verify PK/FK/nullability/unique against Prisma/migrations |
| 19 | `erd6` | 18 Physical ERD — CURRICULUM | Database | `database/18-physical-curriculum` | `docs/diagrams/data/erd-physical.md` | Report 4 Figure 18 | Verify PK/FK/nullability/unique against Prisma/migrations |
| 20 | `erd7` | 19 Physical ERD — PROGRAMS & ASSESSMENT | Database | `database/19-physical-programs-assessment` | `docs/diagrams/data/erd-physical.md` | Report 4 Figure 19 | Verify PK/FK/nullability/unique against Prisma/migrations |
| 21 | `erd8` | 20 Physical ERD — ROBOT RESOURCES | Database | `database/20-physical-robot-resources` | `docs/diagrams/data/erd-physical.md` | Report 4 Figure 20 | Verify PK/FK/nullability/unique against Prisma/migrations |
| 22 | `erd9` | 21 Physical ERD — EXPERIMENT | Database | `database/21-physical-experiment` | `docs/diagrams/data/erd-physical.md` | Report 4 Figure 21 | Verify PK/FK/nullability/unique against Prisma/migrations |
| 23 | `erd10` | 22 Physical ERD — AI & MODEL LIFECYCLE | Database | `database/22-physical-ai-model-lifecycle` | `docs/diagrams/data/erd-physical.md` | Report 4 Figure 22 | Verify PK/FK/nullability/unique against Prisma/migrations |

Each successful direct export must produce `<basename>.svg` and
`<basename>.png`. SVG is preferred for Report 3/4 placement; PNG is retained
for compatibility and quick inspection. There is no deployment/AWS page in
this XML.

