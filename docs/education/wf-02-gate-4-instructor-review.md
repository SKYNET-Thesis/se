# WF-02 Gate 4 — Instructor submission review

Gate 4 extends the existing classroom-scoped assessment boundary. It does not add a review domain or database migration.

## Evidence contract

`GET /submissions/:submissionId` first resolves the Submission's Classroom and requires `learning.work.review` through an active teaching membership. The response aggregates the Student, Assignment, immutable `Submission.program_version_id` evidence, the schematic Experiment with matching persisted provenance, the SymbolicEvaluation for that exact ProgramVersion, the existing LearningAssessment, rubric, and LearningFeedback.

An absent evaluation is represented as `null` and displayed as **Evaluation not completed**. PASS/FAIL comes only from persisted SymbolicEvaluation. A defensive response check removes any evaluation whose ProgramVersion does not equal the displayed ProgramVersion.

## Instructor UI

The real path is:

`My Classes → Classroom → Submitted results → Review`

The review displays the immutable canonical robot program as formatted read-only JSON. It does not render an editable Blockly workspace and never reads the learner's current mutable Program. Assessment and Feedback mutations refresh only the selected submission and its classroom list after the server confirms persistence.

## Student visibility

Existing `/me/submissions/:submissionId/feedback` remains compatible with Gate 4 feedback writes. Gate 4 does not add a new Student review screen or expose assessment scores because no existing score-visibility policy defines that behavior.

## Safety

Instructor review only reads persisted evidence. It does not run Experiments, start VR, create control sessions, call robot-runtime/CHECKIK, or expose physical execution controls.
