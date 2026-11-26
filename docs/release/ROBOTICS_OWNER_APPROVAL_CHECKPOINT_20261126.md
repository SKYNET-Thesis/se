# Robotics commissioning — consolidated owner approval checkpoint (2026-11-26)

Nothing below has been executed. Each numbered step needs your explicit approval; I will execute only what you approve, in this order.

## A. Code and release
| Item | Detail |
|---|---|
| PRs | #225 True/False IDs · #226 roster label · #227 login accessibility · #228 Production E2E docs · **#229 simulation-only IoT start mode + robot-entitlement provisioning script** (all CI green except #229, whose CI was running when written). A docs PR with this checkpoint follows |
| Revision | after merging to `develop`, a new `develop`→`main` release PR; the deployed revision becomes the merge SHA (Production now `0b77ad2`) |
| Migrations | **none** (no `database/` or `prisma/` change in any PR) |
| Terraform | **none required** for the recommended option (identity already provisioned). No plan/hash exists because nothing is applied |
| Deploy | normal gated path: merge to `main` → Education CI → Auto Deploy → `schema-gate` → `aws-demo` approval (API) → `aws-demo` approval (web). The host deploy script hash is unchanged (`ef5a33bf…04bd`) |

## B. WF01 provisioning for the R1126-1901 organization (operator, DB write via existing mechanism)
Entitle the robot to the test organization (`597cd591-ba63-4a27-af5d-12fede921fad`). Dry run first, then confirm (needs production DB credentials, run by you or by me with your approval; creates **one** `org_entitlements` row, touches no allocation):
```
cd services/education-api
npm run provision:robot-entitlement -- --organization 597cd591-ba63-4a27-af5d-12fede921fad --robot f1c066c4-b5f2-45c4-b933-f034f3824dd9            # dry run
npm run provision:robot-entitlement -- --organization 597cd591-ba63-4a27-af5d-12fede921fad --robot f1c066c4-b5f2-45c4-b933-f034f3824dd9 --confirm
```
Then, in the real UI: School Admin → classroom → Allocate robot (verifies eligible-robot listing, allocation, conflicts); Instructor sees it; foreign organizations (the isolation org B `689d24cd-…`) must not. Existing VISTA Academy allocations are preserved. **Decision for you:** accept that this robot is also allocated to VISTA Academy "Robotics Class A" (6 members), or ask me to prepare a reversible removal of those two allocations for the commissioning window.

## C. Identity choice (decision)
**Option R (recommended):** reuse the provisioned, never-connected identity `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` (0 certificates, no shadow, no events; designated in the 2026-11-24 handoff as the physical device identity). No new fixed cost, no new IAM/queue/bucket.
**Option N (not for tomorrow):** a dedicated second robot UUID needs a second IoT Terraform instance (separate state), new EC2-role statements, backend multi-queue/multi-bucket support, and a host-script refresh. Cost is pay-per-use (no compute), but it is several approval gates and code changes; do after the defense.

## D. AWS IoT certificate (owner at the Edge machine; no Terraform)
1. Create the certificate/key on the Edge workstation (`aws iot create-keys-and-certificate` or CSR flow); the private key never leaves that machine and is never committed or put in a secret.
2. Attach the certificate to the Thing, attach `vista-demo-f1c066c4-…-policy` to the certificate, activate. (No policy change: it is already restricted to this one client id, its own topics and its own shadow.)
3. Store key/cert/Amazon Root CA in a root-owned 0700 directory; the runtime config references paths only.
Rollback: deactivate and detach the certificate, detach the policy, delete the key.

## E. Secrets Manager configuration diff (existing secret `vista/demo/education-api/env`; names only, values written by you)
| Key | Now | Change to | Effect |
|---|---|---|---|
| `VISTA_IOT_ENABLED` | `false` | `true` | API may publish commands; student starts remain refused unless the next key is set |
| `VISTA_IOT_START_MODE` | (absent) | `simulation` | enables the Device Shadow preflight; MOCK_RUNTIME with hardware disabled only |
| `VISTA_IOT_THING_PREFIX` | (absent) | `vista-demo` | Thing = `vista-demo-<robot uuid>` |
| `VISTA_IOT_SHADOW_MAX_AGE_MS` | (absent) | optional `30000` | staleness bound |
| unchanged | | | endpoint, topic prefix, queue URLs, worker `true`, TTL 10000, recovery `false`, Twin and recordings keys already present |
Then redeploy/restart the API container (the deploy workflow does this). Recovery (`VISTA_IOT_PUBLISH_RECOVERY_ENABLED`) stays `false`: an unknown publish outcome must never be replayed.
**Rollback:** set `VISTA_IOT_ENABLED=false` and remove `VISTA_IOT_START_MODE`; redeploy (or `action=rollback` to the previous image). The Edge side: stop the runtime, deactivate the certificate. No data to reverse.

## F. Sequence (each step verified before the next)
1. Merge #225–#229; release PR; deploy API then web (gated). Verify health, version, `quiz-result` 401, and that with the flags still off a student start still returns `LOCAL_FAKE_RUNTIME_REQUIRED` (safety lock unchanged).
2. Provisioning command (section B), UI verification of WF01.
3. Edge host: certificate (D), Edge config `iot.enabled=true`, `fakeRobot=true`, **`hardwareEnabled=false`**, hardware **physically disconnected**.
4. Edge connects; verify the Shadow appears (`connection=connected`, `runtimeKind=MOCK_RUNTIME`, `hardwareEnabled=false`).
5. Secret change (E) and API restart.
6. Student starts the physical-experiment activity in the R1126-1901 classroom; verify `pending_publish→publishing→queued→acknowledged→executing→completed`, feedback worker commits, DLQs empty, experiment evidence with provenance **MOCK_RUNTIME**, Twin telemetry from the Edge visible only to the authorized student/instructor, instructor review and release.
7. Stop here for tonight. Physical steps only in the supervised runbook (`docs/operations/PHYSICAL_COMMISSIONING_RUNBOOK_20261127.md`).

## G. Cost
No new fixed-cost resource. Per run: a handful of MQTT messages, SQS requests, a few MB of S3, Shadow operations; well below US$1/day. Option N would add only pay-per-use resources plus engineering time.

## H. Boundaries kept
No Production MQTT until you approve E; no certificates before D; no Terraform apply; no physical connection or actuation tonight; no merge to `main` or deploy without you; SIMULATION/MOCK_RUNTIME are never labelled PHYSICAL_ROBOT.
