# Data Flow

`operator input → protocol validation → clutch/reference → coordinate transform → FK/IK → safety limits → follower action → observation/telemetry`.

Dataset flow: `real/sim episode → provenance + camera metadata + instruction + outcome → Hub dataset version → SmolVLA training run → checkpoint → evaluation run`.

