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

## Final UI decisions (owner-approved 2026-11-24) and what was done

Compared with isolated previews of the old #162 build and develop, against the same fixture data (`docs/operations/evidence/ui-restore-20261124/`).

| Item from #153 / #162 | Decision | Result |
| --- | --- | --- |
| Navy palette | not restored, teal identity kept | unchanged |
| Student Dashboard | kept | unchanged |
| My Learning selection, drawer focus trap | kept (PR #197) | merged |
| `QuestionMap` | integrated, rebuilt on current tokens | `QuestionMap.tsx`, shown for quizzes with two or more questions: "n of N answered", jump-to-question buttons, answered state. It only reads the learner's own selections; drafts, autosave, scoring, point weights, single and multiple choice, attempt and time limits, submit validation and authorization are untouched (17 attempt tests, 5 new) |
| `QuizOverview` | **not integrated: redundant** | the current assignment page already shows module, availability window, due date, attempts used against the limit, pass score, rubric, one primary action (start or continue) and the history of every attempt with its released result; the old page showed less (pass mark, attempts). In the old build an open attempt also rendered "Not passed yet %" |
| `LearningBreadcrumb` | integrated in the activity page | My learning (Courses for other roles), course, module, activity; the module crumb is the way back to the module overview, so the old "Module overview" link and the repeated course title above the heading were removed to avoid duplicate UI. Adds "Activity n of N" |
| Lesson reading layout | current layout kept, best parts combined | current typography, sidebar and teal system retained; breadcrumb and activity position added; the old "Finished? Mark this reading complete" prose not copied (the button is self-explanatory) |
| `InstructionalContent`, `lessonTeaching` | not integrated | they re-lay-out legacy Course 1 reading content; the current structured activity content renders the same material |

Test infrastructure: `CourseContentEditor.spec.tsx` timed out (5 s) in about half of full Vitest runs although it takes about 0.2 s alone. Cause: one worker per core (12) saturates CPU and memory on a 14 GB machine. The Vitest pool is now capped at 6 forks (`vite.config.ts`); no timeout or assertion changed. 8 of 8 full runs afterwards passed (802 tests).

## Suggested closing comments (not posted; closing needs the owner)
- **#180, #181, #182, #184, #185, #186, #187, #188:** "Contained in develop through #189 (commit `ee05ba8` and the consolidation merge); the branch head is an ancestor of develop. Closing as integrated. Thank you."
- **#172:** "Both files are identical on develop (#189). Closing as integrated."
- **#183:** "Organization create and update, classroom creation from an active offering and the offering fields are on develop (`bbd955c`, `ee05ba8`) in the consolidated service and `SchoolManagement` / `SchoolOfferings`. Credit: VuAnhTuan1805. Closing as functionally integrated."
- **#153 and #162 (ttjendatgit):** "Reviewed against develop on 2026-11-24. Merged with credit: navigation selection and drawer focus trap (#197), `QuestionMap` and `LearningBreadcrumb` (final UI PR). Not merged by decision: the navy palette, `QuizOverview` (the current assignment page covers it) and the legacy reading layout. Thank you for the A01 to A07 work; closing as integrated and superseded."
