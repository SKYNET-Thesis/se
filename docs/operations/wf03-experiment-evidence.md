# WF-03 simulation evidence storage

WF-03 runtime telemetry artifacts are server-produced JSON from an R1 deployment explicitly configured with `adapterMode=fake_follower`. They are stored in the existing private Learning Media bucket under `learning-media/experiments/<organization>/<classroom>/<experiment>/<student>/<experiment>.json`.

The Education API task role needs only `s3:PutObject` and `s3:GetObject` on `learning-media/experiments/*`; it receives no bucket listing or deletion permission. Objects use the existing `learning_experiment_artifacts` table and its approved `other` artifact type; `metadata.schema=vista.experiment.telemetry.v1` identifies this contract without a schema change. Object metadata and SHA-256, byte size, experiment, student, classroom, and organization are checked with `HeadObject` before an artifact is reported as available or a short-lived download URL is issued. Database metadata alone is not evidence that the object exists. Missing or unverified objects are returned as unavailable. `local://` references are never signed.

Student retrieval is limited to the owning learner with active classroom enrollment. Teacher retrieval first checks `learning.work.review` on the submission's classroom and then requires that the experiment is linked to the same submission, assignment delivery, and classroom. The database key remains server-side; clients receive only a short-lived download URL.

This repository change does not apply Terraform or modify any bucket. Existing deployed roles require an independently reviewed infrastructure release before this prefix is usable. If the role, bucket, or local S3-compatible endpoint is unavailable, the API persists an unavailable artifact record without claiming delivery.

The artifact contains simulation provenance only. It does not contain or imply VLA inference, model training, physical robot telemetry, or hardware verification.
