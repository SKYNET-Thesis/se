# Web closure: teammate contribution audit, 2026-11-24

Baseline: develop `a14c36ab35173f6d95d05e77a19c56c2d7694f1b`. Method: merge ancestry, `git cherry` patch equivalence, and for every file a PR changed, whether the PR's added lines exist in the develop version of that file (plus manual reading where a file was rewritten). A commit SHA missing from develop was never taken as proof of a missing feature.

| PR | Author | Contribution | Classification | Evidence |
| --- | --- | --- | --- | --- |
| #147 | Loiprofpt | L01 to L03 programming evaluation | EXACTLY INTEGRATED | merged to develop |
| #148 | VuAnhTuan1805 | classroom backend | EXACTLY INTEGRATED | merged to develop |
| #153 | ttjendatgit | A04 classroom quiz delivery (frontend) | FUNCTIONALLY INTEGRATED; palette not adopted | `ClassroomQuizDeliveryPanel` exists on develop (owner rewrite; list/confirm/retry gaps ported in `ee05ba8`); the "Playful Precision" navy palette in `index.css` was not adopted |
| #162 | ttjendatgit | A01 to A07 frontend sweep (classrooms, lifecycle, quiz delivery, My Learning, quiz attempt, navigation) | PARTIALLY INTEGRATED | classroom list/detail/create/edit, members and CSV import, lifecycle (reassign, archive, reactivate) are on develop in `ClassroomDirectory` and `SchoolManagement` (e2e `lms-independent`); drawer and account-menu a11y present. **Ported now** (this PR): My Learning stays selected on course, lesson and practice pages; Tab focus trap in the modal navigation drawer. **Not ported, owner decision:** navy palette, `QuestionMap`, `QuizOverview` attempt overview, `LearningBreadcrumb`, `InstructionalContent` reading layout, removal of the student Dashboard nav item |
| #172 | owner | release-order and temporary-password runbooks | EXACTLY INTEGRATED (both files identical on develop) | file diff |
| #180 #181 #182 #184 #185 #186 #187 #188 | owner | quoted CSV, offerings in Course Builder, learning errors and mobile account, classroom management, quiz autosave, LMS integration, Global Course authoring | EXACTLY INTEGRATED | each head is an ancestor of develop |
| #183 | VuAnhTuan1805 | organization create and update, School Admin assignment, classroom from an active offering, offering fields | FUNCTIONALLY INTEGRATED | organization endpoints in `education-admin.controller.ts`, classroom creation from an active offering in `SchoolManagement`, `SchoolOfferings` 296 of 298 added lines present; e2e `platform-system-admin`, `lms-offering-selection` |
| branch `integrate-main-synced` | ttjendatgit | October SkyNex mobile polish (top bar, tab dock) | OUT OF WEB SCOPE (mobile) | `apps/mobile`, not Web |
| branch `dat` | ttjendatgit | July .NET backend scaffold | OBSOLETE | the platform backend is NestJS |

Totals: 14 PRs and 2 branches inspected; exactly integrated 11 PRs; functionally integrated 2 (#153 and #183); partially integrated 1 (#162); missing 0; conflicting 1 area (the navy palette against the accepted VISTA teal identity); obsolete or out of scope 2 branches.

**Were teammate UI improvements accidentally omitted?** Two small ones were, and are restored in this PR (selection highlight, drawer focus trap). The larger #162 student-learning UI (question map, quiz overview, breadcrumb, reading layout) and the palette were not integrated on purpose when TypeScript was brought to zero errors ("without importing the unrelated UI sweep", `cf61a76`). They change the quiz-attempt flow and the visual identity, so they need an owner decision and a visual comparison, not a silent merge.

Open PRs that can be closed after the owner agrees (no merge needed, nothing is lost): #180 to #188 (contained in develop; they target main and will be contained there once #195 merges), #172, #183 (functionality present). #153 and #162 should stay open until the owner decides on the items above.
