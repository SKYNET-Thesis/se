# Robotics cloud-simulation activation plan (2026-11-26) — for owner approval

Nothing here has been executed except the read-only dry run in section 1. Production serves `0b77ad2`; #225–#230 are merged in `develop` (`b1a5c3f`), no migration or Terraform change is required (`git diff main..develop -- database infra prisma .github` is empty; merge into `main` is clean, 12 commits ahead).

## 1. WF01 provisioning — dry-run result (read-only)
Command (production DB credentials from the local env, nothing printed):
`provision-robot-entitlement --organization 597cd591-ba63-4a27-af5d-12fede921fad --robot f1c066c4-b5f2-45c4-b933-f034f3824dd9`
```
mode: dry-run   organization: VISTA E2E Acceptance Academy R1126-1901
robot: f1c066c4-b5f2-45c4-b933-f034f3824dd9  serial VISTA-WF01-DEMO-ROBOT-01  willRegister: false
entitlement: create     existing allocations of this robot (untouched): 2
```
**Exact row that `--confirm` would insert** into `public.org_entitlements`: `organization_id=597cd591-ba63-4a27-af5d-12fede921fad`, `resource_type='robot'`, `robot_id=f1c066c4-b5f2-45c4-b933-f034f3824dd9`, `valid_from=now()`, `valid_to=NULL`, `seats` default (NULL). No `robots` row is created or changed and no allocation is created. Awaiting your review; the write has **not** been run.

## 2. Commissioning isolation (resolving the VISTA Academy risk)
**Authorization boundary (from `PhysicalExecutionService.resolveScope`):** a student can start a physical/IoT run only if all hold: their own attempt in a **published** classroom assignment; the classroom is **active** and allocated this robot; the student is an active classroom member with permission `learning.experiment.execute`; the classroom's **organization has a current entitlement** for the robot (`valid_from<=now`, `valid_to` null or future — otherwise `ROBOT_ENTITLEMENT_INVALID`); a submitted program with a passing symbolic evaluation; a safety profile. VISTA Academy "Robotics Class A" and "Robotics Fundamentals Class" have 6 published assignments each and 6 active members, so those students are, in principle, eligible.
**Minimum reversible mechanism (PR below):** end VISTA Academy's single open entitlement instead of touching allocations.
| Record | Value | Treatment |
|---|---|---|
| Entitlement (VISTA Academy → robot) | `e5739cc3-1572-4e8e-9bd1-cadab9735137`, `valid_to` NULL since 2026-10-21 | set `valid_to=now()` (one UPDATE) |
| Allocation "Robotics Class A" | `6fdd856a-1d5f-4052-b4cd-6ec0ebd26eee` | **unchanged** |
| Allocation "Class B" | `8052674c-2624-4ffc-a257-86d154f141ac` | **unchanged** |
Dry run / apply: `… --organization <R1126-1901 org> --robot <robot> --isolate-others [--confirm]` (the dry run prints the exact rows to end). **Restore:** `… --restore e5739cc3-1572-4e8e-9bd1-cadab9735137 --confirm` (clears `valid_to`; equivalent SQL: `UPDATE org_entitlements SET valid_to=NULL WHERE id='e5739cc3-1572-4e8e-9bd1-cadab9735137'`). Effect while isolated: VISTA Academy students get `ROBOT_ENTITLEMENT_INVALID` and no command can be created for them; their classes, content and allocation rows are intact. Other organizations never had an entitlement. Needs your approval before it is run, and must run **before** MQTT is enabled.

## 3. Device certificate — procedure for the existing Thing (owner, on the Edge machine only)
Policy already verified (section 5 of the readiness report): Connect only as client `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9`; Publish `…/f1c066c4-…/{telemetry,status,ack}`; Subscribe/Receive `…/f1c066c4-…/commands`; shadow update/get of this Thing only; no wildcard across robots, no `iot:*`. It is attached to nothing today.
Run on the Edge machine with your own AWS credentials (never in this repository, CI, the API secret or an agent session):
```
umask 077 && mkdir -p ~/vista-edge-certs && cd ~/vista-edge-certs
THING=vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9
POLICY=$THING-policy
# 1. create the certificate INACTIVE; AWS returns the private key exactly once and it is written only here
ARN=$(aws iot create-keys-and-certificate --certificate-pem-outfile device.pem.crt \
      --public-key-outfile public.pem.key --private-key-outfile private.pem.key \
      --query certificateArn --output text --profile vista --region ap-southeast-1)
# 2. bind it to the Thing and the policy, then activate
aws iot attach-thing-principal --thing-name $THING --principal "$ARN" --profile vista --region ap-southeast-1
aws iot attach-policy --policy-name $POLICY --target "$ARN" --profile vista --region ap-southeast-1
aws iot update-certificate --certificate-id "${ARN##*/}" --new-status ACTIVE --profile vista --region ap-southeast-1
curl -fsSo AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem
chmod 600 private.pem.key device.pem.crt; chmod 700 .
```
The Edge config references these paths only. **Rollback:** `aws iot update-certificate --certificate-id <id> --new-status INACTIVE`, `detach-policy`, `detach-thing-principal`, `delete-certificate`, delete the files. Verify afterwards (read-only): `list-thing-principals --thing-name $THING` shows one principal; `list-attached-policies` shows only `$POLICY`.

## 4. Edge heartbeat (Codex)
Hand `docs/operations/EDGE_CONTRACT_HANDOFF_20261126.md` to Codex (no Codex session was reachable from here). Priorities: Shadow `reported` heartbeat every 10 s refreshing `reportedAtMs` (API accepts ≤30 s); `runtimeKind=MOCK_RUNTIME`; `hardwareEnabled=false`; `stopped=false` only when genuinely ready; command/ACK/status correlation; Twin telemetry labelled SIMULATION; safe shutdown/reconnect without replay or auto-arming.

## 5. Production configuration — activation gate (all must be true, in this order)
| # | Gate | How verified |
|---|---|---|
| 1 | #229 (and the isolation PR) merged and **deployed** to Production | `version.json`/`/api/v1/version` = merge SHA; with flags still off a student start returns `LOCAL_FAKE_RUNTIME_REQUIRED` |
| 2 | WF01 provisioning done; **isolation applied** | DB read-only: entitlement rows; UI: School Admin sees the robot, allocation works, org B does not |
| 3 | Edge heartbeat implemented | Shadow `reportedAtMs` advances every ≤10 s on a test publish |
| 4 | Certificate attached, policy verified | section 3 read-only checks |
| 5 | Hardware **disabled and disconnected** | Shadow `hardwareEnabled=false`; owner confirms |
| 6 | API and workers healthy, DLQs empty | `/health/ready`, `docker ps`, SQS attributes |
| 7 | Rollback ready | section 7 |
Then (owner) set in the existing secret: `VISTA_IOT_ENABLED=true`, `VISTA_IOT_START_MODE=simulation`, `VISTA_IOT_THING_PREFIX=vista-demo`; redeploy the API container. Not modified by me.

## 6. Cloud simulation acceptance (after sections 1–5; same R1126-1901 data; hardware untouched)
Steps: School Admin allocates the robot to "VISTA Robotics Acceptance Class" (WF01) → the instructor assigns an activity with a physical-experiment step (WF02; **note:** the Advanced course currently has a reading only, so an activity that carries the physical-experiment step must exist — see risk below) → Edge online (Shadow connected/fresh) → student passes the simulation, starts the experiment (safety confirmations) → API publishes; verify the lifecycle `pending_publish→publishing→queued→acknowledged→executing→completed` in `iot_command_lifecycles` → feedback worker commits, queues/DLQ empty → experiment `succeeded` with runtime mode `fake_follower` and provenance **MOCK_RUNTIME** → Twin telemetry from the Edge visible only to that student/instructor (a peer is refused) → evidence downloadable → instructor reviews and releases (WF04). A mock-browser run does **not** count; only the chain above with Edge-originated events counts.
**Known risk:** the Production Advanced course I authored has no physical-experiment activity (Course Builder offers readings/videos/quizzes; the SO-101 curriculum's physical activity is seeded content). If the seeded SO-101 course is not delivered to the test classroom, delivery of that course (existing offering mechanism) is an additional step; I will confirm the exact activity route before the run.

## 7. Rollback
Secret: `VISTA_IOT_ENABLED=false`, remove `VISTA_IOT_START_MODE`; redeploy or `action=rollback`. Edge: stop runtime; deactivate/detach/delete certificate (section 3). Isolation: `--restore e5739cc3-…`. WF01: the R1126-1901 entitlement can be ended with `valid_to=now()`. No data to reverse.
