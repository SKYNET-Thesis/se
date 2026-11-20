# SO-101 academic curriculum coverage (initial target met)

Structure follows the platform's own terms: **course → module (a `learning_lessons` row) → lesson (a section with a reading) → module-end quiz**.
Source of truth: `VISTA_Curriculum_Question_Bank_Blueprint_UPDATED_2026-11-07.docx` (21 courses / 105 lessons / 1 575 questions) — this pack is the
first implementation subset and is **not** mapped to blueprint course codes (the blueprint's grade-based codes were not remapped; ambiguous).
Data: `services/education-api/src/scripts/so101-course{1,2,3}.data.ts` (+ `so101-curriculum.types.ts`, index `so101-curriculum.data.ts`);
seeder `seed-so101-curriculum.ts` (isolated database only, idempotent, fails loudly on an incomplete earlier run); validation spec `so101-curriculum.data.spec.ts` (8 tests).

| Course | Level | Tags | Prereq | Modules (2 lessons each + 20-question quiz) | Assignments | Labs |
|---|---|---|---|---|---|---|
| SO-101 Robotics Foundations | BEGINNER | SO-101, Robotics, Blockly | — | Know your robot · Work safely · First programs | Anatomy and safety summary (knowledge, manual) · Plan a program before you build it (knowledge, manual) | Open, wait, close · Right arm release (Blockly, **automatic**, no movement blocks) |
| SO-101 Motion and Coordinates | INTERMEDIATE | SO-101, Blockly, Simulation, Robot Kinematics | Foundations | Coordinates · Joints and limits · Verification | Workspace and limits analysis (manual) · Debugging report (mixed) | Reach Target A · Reach Target B with the right arm (simulation, mixed) |
| SO-101 Manipulation Project | ADVANCED | SO-101, Robotics, Robot Control, Simulation | Motion | Task planning · Evidence and safety · Engineering communication | Manipulation design final · Safety case for physical execution (**manual final**) | Two-waypoint transfer · Approach, grasp and retreat (simulation, mixed; physical lab optional) |

**Coverage against the approved target: courses 3/3 · lessons 18/18 · questions 180/180 · module-end quizzes 9/9 · assignments 6/6 · practical labs 6/6.**
Each module has progression: module *n+1* is locked until the module *n* quiz is passed (course-level prerequisites chain Beginner → Intermediate → Advanced; module-level lock enforced by the platform).

Quality controls enforced by the spec: 180 unique stems and codes; every answer key valid for its type; multiple-choice never "select all"; no duplicated options; a mix of single choice, multiple choice and true/false with weights 1–3 in every quiz; 4 objectives per module, every one covered by a question; real lesson explanations (≥ 3 paragraphs, > 300 characters) with instructor guidance; rubrics total 100; manual finals force manual grading; beginner labs use no movement blocks and mention no robot lab; every lab's challenge conditions compile with the platform's symbolic rule compiler and use only supported actions; all 180 questions pass the Question Bank service's own publish validation. Content is restricted to features the platform implements and states that simulation never authorises a physical run.

Seeding (isolated DB): 3 courses published, 9 modules, 18 lessons, 180 published question versions mapped to objectives, 9 quiz assignments with weighted questions, 12 assignment/lab templates (6 labs bound to 6 published symbolic challenges) with rubrics, academic fields and inherited allowed blocks. Delivered and consumed in real-browser E2E: `lms-curriculum`, `lms-module-quiz` (full 20-question module quiz), `lms-beginner-lab` (automatic grading).

Honest limits: question quality is checked structurally and by author review, not by a subject-matter expert; only the module-1 quiz of the beginner course is taken end-to-end in a browser (the other eight use the same engine); labs 3–6 were not each run through the browser (the Blockly flow is exercised by `lms-beginner-lab`, `blockly-simulation` and the challenge-compilation checks); content is English only.
