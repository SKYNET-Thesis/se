# Phase 5A — Hardware readiness and supervised calibration procedure

## Security audit

- Education API authenticates with the existing Supabase JWT guard. Scope claims use the server-resolved active membership, `learning.experiment.execute`, classroom allocation and active entitlement; no organization claim comes from the browser.
- Viewer scopes bind organization, robot, audience, expiry and `jti`. They remain memory-only in the browser and are never logged by the application code.
- Publisher scopes use a distinct audience and must match the configured owner, organization and robot before telemetry is accepted.
- The Digital Twin WebSocket verifies the viewer scope when a physical frame is active and closes with `4403` when its expiry is reached. Reconnection requires a fresh scope.
- Allocation revocation is bounded by the 60-second scope TTL. Immediate revocation and replay tracking require a durable revocation/lease store, which does not exist in the current schema and was not invented in Phase 5A.
- Telemetry viewing currently reuses `learning.experiment.execute`; no new permission was introduced. Separating it requires a reviewed permission/data migration.

## Supervised hardware procedure — do not run automatically

1. Confirm emergency stop, workspace clearance, supervision, power, cables, mechanical fasteners and a tested stop path.
2. Record robot asset/serial identity and confirm it equals the configured robot ID, organization and owner identity.
3. Start with motor output disabled according to the approved LeLab procedure. Confirm the endpoint, owner scope and gateway are injected from secret management; never paste scopes into browser tooling.
4. Establish the existing single LeLab owner connection. Confirm no second follower process exists.
5. Capture one raw observation per joint while manually holding a safe neutral pose. Record timestamps and evidence references.
6. For each arm joint, make a small supervised displacement and verify observation sign, zero offset, unit and safe raw range against the URDF visual direction.
7. Verify gripper endpoints separately; derive and record a measured percent-to-jaw conversion. Do not infer it from URDF or prior tests.
8. Compare the calibrated pose visually at neutral and several safe checkpoints. Record screenshots/video and the reviewer identity.
9. Create a CalibrationProfile only after evidence review. Until then retain `UNCALIBRATED`, which displays readings but freezes physical pose animation.
10. Stop immediately on unexpected motion, missing/nonfinite readings, sign mismatch, range breach, stale telemetry, identity mismatch, unauthorized scope, or any safety concern.

## Browser visual checklist

VISUAL VERIFICATION PENDING. Before Phase 5B, an operator must verify URDF/STL loading, white material, camera controls, joint direction, stale/disconnected indication and browser console without severe errors.

## Decision

**READY FOR SUPERVISED HARDWARE TEST.** This is software readiness only; it does not verify hardware, calibration values, camera setup, safety hardware or secret provisioning.
