# Physical SO-101 commissioning runbook — 2026-11-27 (supervised)

Hardware: 2 SO-101 leader arms + 2 SO-101 follower arms. **Nothing in this runbook was executed.** Connecting, calibrating, arming and moving hardware are explicitly authorized and supervised by the owner on the day; no step arms or moves a robot automatically, including after a reconnect. Existing procedures this builds on: `docs/guides/{installation,robot-connection,calibration,teleoperation,troubleshooting}.md`, `docs/operations/aws-iot-so101.md`, `docs/operations/DESKTOP_TWIN_AI_HANDOFF_20261124.md`, `docs/release/ROBOTICS_OWNER_APPROVAL_CHECKPOINT_20261126.md`.

Legend: **[OWNER]** needs the owner present and explicit go; ✔ = record the result in the evidence sheet (section 12).

## 0. Preconditions (must all be true before touching hardware)
- Checkpoint steps 1–6 of the approval checkpoint done and green for **simulation** (hardware still disconnected): Shadow connected/MOCK_RUNTIME, student run completed, evidence MOCK_RUNTIME, DLQs empty.
- #225–#229 deployed; Production smoke tests pass; `VISTA_IOT_START_MODE=simulation` active.
- Owner and a second person on site; clear table; emergency stop reachable; first-aid/safety briefing done.

## 1. Device inventory ✔
Label leader L-A, L-B and follower F-A, F-B; record serials, servo IDs/baud, firmware, cable lengths, power supplies (voltage/current rating), USB-serial adapters, laptop model, OS. Photograph the arms (no personal data).

## 2. USB and serial identification ✔
Connect **one device at a time**, with motor power **off**. For each: `dmesg | tail`, `ls -l /dev/serial/by-id/`, record the stable by-id path. Map: L-A→port, L-B→port, F-A→port, F-B→port. Add the user to the serial group (e.g. `dialout`) if permissions fail; do not use `chmod 777`. Write the mapping into the Edge config (paths by-id, never `/dev/ttyUSBn`).

## 3. Power and workspace safety [OWNER]
Follower workspace clear of people and objects; arms in rest pose; power supply with a physical switch within reach; follower torque disabled at start. Agree the **stop word** and who holds the switch. Verify the local emergency stop (CHECKIK stop / latch) **before** any motor torque: trigger it, confirm the runtime reports `stopped`, confirm it blocks motion and that clearing it does not re-arm automatically.

## 4. Edge machine software ✔
Runtime dependencies per `installation.md` (Python 3.12, uv, runtime/CHECKIK packages); runtime config with `hardwareEnabled=false`, `fakeRobot=true`. Start CHECKIK/R1; confirm `/health` and that the runtime reports a mock mode.

## 5. AWS IoT connectivity (certificate already installed per checkpoint D) ✔
Install key/cert/CA in a root-owned 0700 directory. Start the Edge with IoT on and hardware **disabled**. Verify in AWS (read-only): Thing principal attached, Shadow exists with `connection=connected`, `runtimeKind=MOCK_RUNTIME`, `hardwareEnabled=false`, heartbeat advancing. Disconnect the network: shadow becomes `disconnected` (last will) and the API refuses a start; reconnect: reports again, **no** command replays, no arming.

## 6. Calibration prerequisites [OWNER]
Calibration writes configuration to the motors/host. Back up the existing calibration files first. Calibrate **one arm at a time** (follower first, then its leader) per `calibration.md`; record ranges per joint; verify the joint order/units match the Twin schema. Do not proceed to motion if any range is implausible.

## 7. Individual arm commissioning (F-A, then F-B) [OWNER]
1. Torque on at minimum limits, no program. Hold-position check; immediately disable torque if any unexpected motion.
2. Joint limit verification: command each joint to 10 % of its range, then 50 %, never to a limit; confirm software limits clamp requests beyond range.
3. Velocity limit verification: command a small step; measure peak speed against the configured cap; confirm the cap cannot be exceeded by a large request.
4. Watchdog/disconnect: with a slow motion in progress, unplug the control link → the arm must stop/hold within the configured timeout; confirm no motion resumes on reconnect without an operator action.
5. Gripper open/close at low force; confirm limits.
✔ pass/fail per arm; a failed arm is not used further.

## 8. Leader/follower mapping and teleoperation (single pair) [OWNER]
Map L-A→F-A (then L-B→F-B) per `teleoperation.md` at reduced gain/speed. Verify direction and offset per joint with a small deliberate motion of the leader; confirm follower follows within limits; stop/hold behavior when the leader is released; e-stop mid-motion.

## 9. Dual-arm commissioning (only after both single pairs pass) [OWNER]
Run both pairs simultaneously at reduced speed with an empty workspace; verify no collision zone is entered, independent stop works for each arm and for the pair, and the combined e-stop halts both.

## 10. Recording, Twin and evidence ✔
With a single pair and the owner's go: start a **recorded** episode; confirm local files, `manifest.json` written last with sizes/SHA-256; upload through the student session (presign → S3 → queue → worker); confirm artifacts registered, instructor can view/download, a peer and a foreign teacher cannot; Digital Twin shows telemetry labelled by the runtime's declared kind (physical only if the deployment explicitly declares the adapter mode physical — **do not enable `VISTA_PHYSICAL_RUNTIME_MODES` without a separate owner decision**). Until then physical runs are classified UNVERIFIED_RUNTIME and cannot satisfy a physical lesson.

## 11. Instructor review (WF04) ✔
Instructor opens the R1126-1901 submission with the evidence, scores, releases; student sees the release.

## 12. Evidence sheet and stop conditions
Record per step: time, operator, result, artefact (photo, log path, Shadow JSON with secrets absent), defect id. **Stop immediately and de-energize** on: unexpected motion, any e-stop failure, overheating/smell, cable strain, a limit not enforced, a watchdog that does not trigger. Do not continue the day after a safety-control failure until it is understood.

## 13. Rollback / shutdown
Torque off, power off, unplug; stop the Edge runtime; set `VISTA_IOT_ENABLED=false` and remove `VISTA_IOT_START_MODE` (checkpoint E), redeploy or `action=rollback`; deactivate/detach the certificate if the Edge machine leaves the owner's control. Restore calibration backups if a calibration was abandoned.
