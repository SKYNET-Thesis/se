# API and Protocol Baseline

## Phone WebSocket protocol v1

The mobile app connects to `ws(s)://<host>:<port>/ws`. Observed message types: `hello`, `phone_pose`, `control_disabled`, `recenter`; server responses include acknowledgement/status/error. `phone_pose` carries session/sequence/timestamp, tracking state, enabled/fine mode, position, quaternion and gripper velocity. Invalid/stale/out-of-order input must be rejected.

## Current HTTP status

VR/control documentation identifies `/api/status` for relay/dashboard health. .NET API exposes `/health`; controllers/endpoints beyond this are not documented here because they were not verified in source.

## Safety contract

Input timeout >1 second causes Hold. E-stop locks motion. Recovery requires reconnect, recenter and preflight. This is a behavioral contract, not an authorization API.

