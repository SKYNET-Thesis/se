# WF-04 Teacher Evidence Review & Assessment

## Architecture

The authoritative review root is `LearningSubmission`. An Education API query first resolves the Submission through its Attempt and ClassroomAssignment, then applies active teacher/TA Classroom membership and `learning.work.review`. Only after that check does it project related persisted evidence.

The browser calls the Education API only. Historical review never queries R1 or CHECKIK.

## Evidence projection

The existing Submission review now includes all related LearningExperiments with allowlisted provenance, safe results, metrics, ordered events, artifact availability, optional Control Session/Robot identity, Demonstration metadata, reflection, related DatasetVersion metadata, and related evaluation/model metadata. Runtime configuration, URLs, tokens, ports, raw paths, and stack traces are excluded.

ProgramVersion remains the immutable submitted program authority. Persisted SymbolicEvaluation is displayed without recomputation.

## C3 integration

When the existing C3 Education API finalizes a recording, it creates or reuses the DemonstrationEpisode and links it to a succeeded LearningExperiment rooted in the current Submission. Organization, Classroom, Attempt, Submission, and ProgramVersion provenance are captured using existing columns and snapshots. The recorder format is unchanged.

C3 reflection is persisted in `learning_reflections` against the Submission and Experiment and is restored after reload.

## Dataset and model boundary

Dataset metadata is returned only through an authorized DemonstrationEpisode → DatasetEpisode → DatasetVersion relation. Model metadata is returned only through Experiment → EvaluationRun → ModelCheckpoint → AIModel. Absence is normal and no relationship is fabricated.

Training workers and VLA inference are not implemented. Metadata displayed by this review is history/reference only.

## Assessment and feedback

Existing WF-02 LearningAssessment, rubric scoring, and LearningFeedback remain anchored to the Submission. Assessment mutation additionally requires `learning.assessment.assess`.

## Known limitations

- Existing C3 recording endpoints were not confirmed in the current CHECKIK source tree.
- C3 artifacts may be `local://` and unavailable outside the recording host.
- Dataset/model support remains metadata-only.
- No operational model training or VLA inference is provided.
- No live remote database records were created for this implementation gate.
- Real hardware was not used or verified.

## Truthful demo claim

VISTA preserves student robot-learning evidence and lets authorized teachers inspect the submitted program, experiment lifecycle, robot execution result, demonstration metadata, and associated data references before recording assessment and feedback.
