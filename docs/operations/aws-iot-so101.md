# AWS IoT SO-101 production rollout runbook

No command below is run by this repository change. It is an operator runbook;
all AWS, Supabase, certificate and robot actions require their normal approval.

## Topology and IAM boundary

The existing Education API EC2 instance runs two independent containers from
the same immutable Education API image SHA:

- `vista-education-api` exposes only `127.0.0.1:3000` to nginx.
- `vista-iot-feedback-worker` has no published port and runs
  `node dist/scripts/iot-feedback-worker.js`.

The worker is created only when `VISTA_IOT_FEEDBACK_WORKER_ENABLED=true` is in
the EC2 secret-derived environment file. With the default `false`, deployment
removes any old worker container rather than entering a restart loop.

The GitHub API deployment path uploads the reviewed host wrapper from
`infra/terraform/scripts/deploy-api.sh` through SSM before it starts an image.
Changes to that wrapper select the API deployment target. Rollback uses the
previously installed wrapper and previous shared image SHA; it does not select
or publish a new image.

The main Terraform root accepts two optional, exact ARNs from the independent
IoT root. It adds no IoT permissions until both are present:

- `iot:Publish` on the one command-topic ARN.
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility`,
  and `sqs:GetQueueAttributes` on the one feedback-queue ARN.

The IoT rule role is separate and has only `sqs:SendMessage` on that queue.

## Preflight: Supabase and Terraform

1. Obtain the approved Supabase migration-history/schema exports and a tested
   PITR or backup restore point. Do not run a migration with an unknown
   `_prisma_migrations` history.
2. Review the two additive migrations in order:
   `20261106_iot_command_lifecycle`, then `20261106_iot_publish_intent`.
3. Run `terraform fmt -check -recursive` and `terraform validate` in both
   `infra/terraform` and `infra/terraform/iot`.
4. Run a reviewed `terraform plan -refresh-only -lock=false` in the main root.
   If it reports drift, reconcile or explicitly exclude every difference before
   any IAM apply. Never use a refresh-only plan as approval to apply.
5. In the IoT root, record the reviewed outputs `command_topic_arn`,
   `feedback_queue_arn`, `feedback_queue_url`, `iot_endpoint`, and
   `mqtt_topic_prefix`. Copy only the two ARNs into protected main-root
   tfvars; do not copy credentials.

## Infrastructure and application rollout

1. Apply the reviewed independent IoT root. It creates the Thing, robot policy,
   feedback queue/DLQ, and rule. It does not create a device certificate.
2. Add the exact output ARNs to the main-root tfvars and review a new plan that
   changes only the EC2 inline policy statements needed above. Apply only after
   main-root drift is resolved.
3. Apply the approved Supabase migrations through the direct migration
   connection, then verify migration records, lifecycle columns, constraint and
   indexes with read-only SQL.
4. Store these server-side environment values in the existing secret without
   exposing them to the web build: `VISTA_IOT_ENABLED`,
   `VISTA_IOT_DATA_ENDPOINT`, `VISTA_IOT_TOPIC_PREFIX`,
   `VISTA_IOT_COMMAND_TTL_MS`, `VISTA_IOT_PUBLISH_RECOVERY_ENABLED`,
   `VISTA_IOT_PUBLISH_RECOVERY_INTERVAL_MS`,
   `VISTA_IOT_FEEDBACK_WORKER_ENABLED`, `VISTA_IOT_FEEDBACK_QUEUE_URL`,
   `VISTA_IOT_FEEDBACK_WORKER_CONCURRENCY`, and
   `VISTA_IOT_FEEDBACK_VISIBILITY_SECONDS`.
5. First deploy the shared image with IoT publishing and the worker feature flag
   off. Confirm API health, image SHA, and that no worker container is running.
6. Enable the worker with the exact queue URL; deploy the same image SHA and
   confirm `vista-iot-feedback-worker` is running without a public port.
7. Enable IoT publishing/recovery only after the worker is healthy. Check the
   API and worker CloudWatch streams, queue depth, DLQ depth and lifecycle
   state transitions.

## Edge certificate provisioning

1. Create a certificate and key using an approved operator workstation or edge
   provisioning flow; never use Terraform state, Git, CI variables, or the API
   secret for its private key.
2. Attach the certificate to `vista-demo-so101-001`, attach
   `vista-demo-so101-001-policy` to that certificate, and activate it.
3. Store the private key, certificate and Amazon Root CA in a root-owned `0700`
   directory on the edge host. The runtime configuration references paths only.
4. Configure the edge with the output endpoint and topic prefix. Keep
   `hardwareEnabled: false` and `fakeRobot: true` for initial validation.
5. Rotate by creating and validating a second certificate before activating it;
   then detach/deactivate the old certificate and securely remove its key.
   On suspected compromise, immediately deactivate/revoke and detach the old
   certificate. This is not an emergency stop; use the local CHECKIK safety
   stop for a physical hazard.

## Fake telemetry and commissioning

1. Publish fake `telemetry`, `status`, and correlated `ack` payloads. Confirm
   the IoT rule writes only `ack`/`status` payloads to SQS and the worker
   commits before deleting each receipt.
2. Confirm duplicate delivery is idempotent, a failed transaction retains the
   message, and the DLQ stays empty.
3. Create an already-authorised physical execution against a fake follower;
   verify `pending_publish → publishing → queued → acknowledged` and expiry or
   unknown outcomes never replay a physical command.
4. Only after the fake-follower evidence is approved may an operator perform
   controlled follower commissioning under the existing CHECKIK safety process.

## Rollback

Disable `VISTA_IOT_ENABLED` and `VISTA_IOT_FEEDBACK_WORKER_ENABLED`, deploy the
previous shared image SHA, and verify the worker container is absent. Stop the
edge runtime. Do not reverse Prisma migrations during an application rollback;
they are additive and must be handled through a separately reviewed recovery.
