# WF-02 Gate 2 + 3 — Student learning and C1 evidence

## Authoritative flow

`/my-learning` and `/my-learning/:classroomAssignmentId` read the Education API through classroom-assignment-scoped TanStack Query keys. The detail route lists the authenticated learner's attempts. Only an `in_progress` attempt is continued; submitted or evaluated work starts a numbered server attempt subject to the persisted availability window and `max_attempts`.

`/practice/:attemptId` is explicitly learning-only. It supports Blockly, the local 3D learning preview, and the persisted schematic evidence chain. It does not render physical controls or call robot status/execution APIs.

## C1 evidence chain

The client orchestrates, without replacing, the existing backend sequence: save Program, create ProgramVersion, persist Submission, create or reuse a schematic Experiment for the same Attempt and ProgramVersion, run it when pending, and persist SymbolicEvaluation.

The UI reports the last completed stage when a later stage fails. PASS/FAIL is displayed only from persisted `SymbolicEvaluation`. Reload recovery joins evidence by exact ProgramVersion provenance, preventing an evaluation for version N-1 from being shown with version N.

After symbolic evidence is persisted, the backend updates the owning Attempt to `evaluated` in the same transaction. A failed evidence write does not transition the Attempt.

## Known MVP limitation

A synchronous UI lock prevents same-session double submission. If the browser refreshes after a ProgramVersion is created but before a later orchestration stage completes, the current APIs cannot safely reuse that orphan ProgramVersion. Solving that requires a larger idempotency contract and is intentionally outside this no-migration gate.
