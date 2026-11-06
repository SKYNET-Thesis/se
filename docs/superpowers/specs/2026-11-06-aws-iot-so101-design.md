# AWS IoT SO-101 Integration Design

## Goal

Connect the existing authorised physical-execution flow to an SO-101 edge
runtime through AWS IoT Core without giving browsers, Terraform state, or the
API access to robot X.509 credentials.

## Boundaries

`PhysicalExecutionService` remains the sole user-facing physical command
boundary.  It validates learner entitlement, program evidence, exclusive
control-session ownership, and safety confirmation before publishing a
versioned command.  The API publishes with the EC2 IAM role.  The Ubuntu edge
runtime is the sole MQTT/TLS X.509 client and is still responsible for
fail-closed execution through CHECKIK.

The device only subscribes to `vista/demo/robots/so101-001/commands`; it
publishes `telemetry`, `status`, and `ack`.  Commands carry a UUID command ID,
robot identity, monotonic sequence, and absolute expiration.  A stale,
duplicate, malformed, or incorrectly addressed command never reaches
`Runtime.submit`; it produces a sanitized negative acknowledgement instead.

## Implementation slices

1. Add a language-neutral JSON schema/document for the four messages and a
   Python MQTT bridge.  The bridge uses Paho MQTT TLS with the Amazon Root CA,
   client certificate, and private key from local paths.  It performs bounded
   exponential reconnect, status/telemetry publication, acknowledgement, and
   graceful disconnect.  Fake follower remains explicit; hardware remains off
   unless its existing commissioning configuration says otherwise.
2. Add an IAM-authenticated AWS IoT Data Plane publisher to Education API.
   Publish only after the existing service creates the control session.  Store
   command state by command ID in memory for the process lifetime and expose it
   only through the existing execution status response.  Runtime terminal
   polling remains a conservative compatibility fallback until a deployed
   acknowledgement ingestion route is provisioned.
3. Translate edge telemetry into the already-versioned Digital Twin input,
   preserving calibrated/uncalibrated semantics and never forwarding commands
   back to the device.  The existing UI remains read-only and gains execution
   and connectivity state from the authorised backend response.

## Security and safety

- IoT certificates are provisioned outside Terraform and Git; the policy is
  limited to the Thing client ID and its four topics.
- No command is a servo command, an emergency stop, or a bypass of CHECKIK.
- The edge bridge never enables hardware and stops accepting commands when its
  connection is unhealthy; local CHECKIK/watchdog mechanisms remain primary.
- API credentials use the EC2 role/default AWS credential provider.  Browsers
  receive only normal authenticated API responses and Digital Twin scopes.

## Non-goals

No production Terraform mutation, certificate creation, AWS deployment,
secret change, real hardware movement, IoT Rule creation, or Cloud GPU work is
included.
