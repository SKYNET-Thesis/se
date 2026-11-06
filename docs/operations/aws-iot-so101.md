# AWS IoT SO-101 deployment preparation

No command below is run by this repository change.

1. Review `infra/terraform/iot/` separately from production Terraform; configure its existing independent S3 backend as `vista/demo/iot/terraform.tfstate`, then have an authorised operator apply it.
2. Create and activate an IoT certificate outside Terraform. Attach it to `vista-demo-so101-001` and `vista-demo-so101-001-policy`; place the private key, certificate and Amazon Root CA in a root-owned `0700` directory on Ubuntu.
3. Install `services/robot-runtime/requirements.txt`; configure `thingName`, `topicPrefix`, endpoint and TLS file paths in a local, uncommitted runtime configuration. Keep `hardwareEnabled: false` for the first end-to-end test and use `fakeRobot: true`.
4. Give the Education API EC2 role `iot:Publish` only on `vista/demo/robots/so101-001/commands`; set `VISTA_IOT_ENABLED=true`, endpoint, prefix and bounded TTL. Do not set device certificate values in the API.
5. Configure an authenticated acknowledgement/status ingestion path before calling the deployment production-ready. The current API safely reports published commands as queued; it intentionally does not impersonate an edge acknowledgement.
6. Demo with fake follower: start edge runtime, observe status/telemetry/ACK, launch an already-authorised physical execution, inspect Digital Twin, then disconnect edge and verify no stale command executes.

Rollback: disable `VISTA_IOT_ENABLED`, restart API, stop edge runtime, and revoke/detach the device certificate if it is suspected compromised. This is not an emergency stop; use the local CHECKIK safety stop for physical hazards.
