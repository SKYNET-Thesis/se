# WF-04 requirement check — "AI/Data Integration & Teacher Review"

Date: 2026-11-26. Question: does the approved scope make AI-generated assessment mandatory?

## What the approved material says

- Registered activity diagram (`docs/diagrams/workflows/activity-wf04-ai-data-teacher-review.md`, Report 4 Figure 07; draw.io page "07 Activity WF-04 - AI/Data Integration & Teacher Review"): Student *Complete Experiment* → Web *Open Result / Evidence* → Backend API **Link Evidence + Model Metadata** ("Ready for review") → Teacher *Review Evidence* → *Provide Feedback* → Backend API *Store Assessment* ("Feedback available") → Student *View Feedback*.
- Diagram manifest (`docs/review-2/04-diagrams/manifest.md`, row 7): "External AI execution remains planned."
- Conceptual ERD note (`docs/review-2/04-diagrams/database/mermaid-reference/erd-conceptual.md`): the Experiment–AI Model and Submission–AI Model links "have no direct foreign key in the schema; they are conceptual only."
- `docs/review-2/01-registration/approved/` contains only a README in this checkout; no separate registration text beyond the diagram set was found. If a separate approved registration document exists elsewhere, it was not available to this check.

## Conclusion

The registered step is **linking evidence and model *metadata* to the submission, then instructor review and feedback**. Automated programming evaluation, AI-generated assessment and AI inference are **not** named as mandatory steps; the manifest says external AI execution remains planned. I did not assume otherwise and built no AI assessment architecture.

## Existing implementation that satisfies the registered steps

- Evidence linking: persisted experiment events, telemetry and recordings are attached to the correct experiment and submission (see `WF03_ACCEPTANCE_REPORT.md`).
- Model metadata: the teacher review API already projects `modelMetadata` (null when no model is attached) next to the evidence (`assessment.service.ts`), and `EvidenceCard`/`teacherEvidence.ts` render dataset/model information when present; the model registry stores metadata (no inference).
- Instructor review, feedback, score and release to the student: verified locally (`WEB_ACCEPTANCE_MATRIX_2026-11-26.md`, lms-assignment-grading and lms-independent).
- The deterministic quiz recommendations (separate PR) call no external AI.

## Gap to state honestly

When no model is attached to an experiment (the case for every local run), `modelMetadata` is empty, so the "Model Metadata" part of the step is demonstrated as an empty projection. Showing it populated needs a registered model record linked to an experiment; that is an owner decision (demo data) and is **not** done here. AI/VLA inference remains NOT IMPLEMENTED / NOT VERIFIED.
