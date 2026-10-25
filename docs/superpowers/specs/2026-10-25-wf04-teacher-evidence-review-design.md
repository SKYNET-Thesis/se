# WF-04 Teacher Evidence Review Design

## Boundary

`LearningSubmission` remains the review aggregate. An authorized teacher reaches evidence only through Classroom → Attempt → Submission. The existing assessment and feedback models remain unchanged.

## Read projection

`AssessmentService.instructorSubmission` returns the existing submission detail plus a bounded `experiments` collection. The server batch-loads persisted experiments, ordered events, artifact metadata, Control Session/Robot summaries, optional Demonstration metadata, reflection, DatasetVersion associations, and related EvaluationRun/ModelCheckpoint metadata. It never queries R1 or CHECKIK and never accepts evidence IDs from the browser.

## C3 persistence

Finalizing an existing C3 recording creates or reuses a `demonstration_episodes` record, populates its organization provenance, and creates or reuses a succeeded `learning_experiments` record linked to the current Submission and Demonstration Episode. Reflection is stored in `learning_reflections` and recovered on reload. Existing recorder payloads and formats do not change.

## UI

The existing Teacher Submission Review page adds compact evidence cards for schematic, physical, and demonstration experiments. Events form a collapsible ordered timeline. Artifact, dataset, model, and evaluation metadata appear only when returned by the authorized projection. Missing evidence is a valid empty state.

## Security and truthfulness

Evidence reads require `learning.work.review` and teacher/TA membership in the exact Classroom. Assessment continues to require `learning.assessment.assess`. Output is allowlisted and excludes runtime infrastructure. Training and VLA inference are not implemented or implied.

## Data

No migration is required. Existing relational columns are sufficient. JSON provenance is displayed only as a safe allowlisted summary and is never an authorization source.
