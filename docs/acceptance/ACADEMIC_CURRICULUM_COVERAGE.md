# SO-101 academic curriculum coverage (initial subset)

Source of truth for structure: `VISTA_Curriculum_Question_Bank_Blueprint_UPDATED_2026-11-07.docx` (21 courses / 105 lessons / 1 575 questions; Course 1 = 5 lessons already seeded) and the platform's implemented features. The pack below is the **first subset** and does not map to specific blueprint course codes (the blueprint's Grade → Course → Lesson codes were not remapped: ambiguous). Data: `services/education-api/src/scripts/so101-curriculum.data.ts`; seeder: `seed-so101-curriculum.ts` (isolated DB only, idempotent: re-run skips existing published courses, fails loudly on an incomplete one).

| Course | Level | Tags | Prereq | Lessons | Quiz (weights) | Assignment (difficulty, type, grading) |
|---|---|---|---|---|---|---|
| SO-101 Robotics Foundations | BEGINNER | SO-101, Robotics, Blockly | — | Meet the SO-101 arm · Safety first · Your first Blockly program | 10 q (single, multiple, true/false; weights 1-2) | Open, wait, close — BEGINNER, Blockly, automatic (needs a bound challenge), pass 70, rubric 70+30 |
| SO-101 Motion and Coordinates | INTERMEDIATE | SO-101, Blockly, Simulation, Robot Kinematics | Foundations | Coordinates and the workspace · Joints, limits and sequencing · Verifying in simulation | 10 q (weights 1-3) | Reach Target A — INTERMEDIATE, simulation, mixed, pass 70, rubric 50+30+20 |
| SO-101 Manipulation Project | ADVANCED | SO-101, Robotics, Robot Control, Simulation | Motion | Planning a grasp and release · Evidence and safe execution · Writing the engineering report | 10 q (weights 1-3) | Manipulation design final — ADVANCED, manual_final, manual, pass 60, rubric 30+30+20+20 |

Quality controls (unit spec, 6 tests): 30 unique stems and codes; every answer key valid for its type; multiple-choice never "select all"; every question maps to a learning objective of its own course; every objective is covered by a question or the assignment; rubrics total 100; manual finals force manual grading; the beginner course mentions no robot lab; all 30 questions pass the Question Bank service's own publish validation. Content is restricted to implemented features (Blockly blocks, learning-preview workspace, simulation, rubric grading) and states that simulation never authorises a physical run.

Delivered in the real UI against an isolated PostgreSQL: published, delivered by a School Admin, visible to the enrolled student with level badge and tags, prerequisite chain Beginner → Intermediate → Advanced.

**Coverage against the requested target**: courses 3/3, lessons 9/18, questions 30/180, module-end quizzes 3/9, assignments 3/6, practical labs 0/6. The shortfall is deliberate (no filler); extending it is data-only work using the same seeder. Module quizzes sit on the last lesson of each course (a quiz can only use its own lesson's questions), so each is a *course-end* quiz in this pack; per-module quizzes need module (section) objectives, a Question Bank rule, not a data change.
