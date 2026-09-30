# VR Teleop

This repository collects two Python implementations for controlling SO-101/LeKiwi robots from a VR headset:

- [`lekiwi-vr-teleop`](lekiwi-vr-teleop/README.md): WebXR teleoperation for a LeKiwi mobile manipulator, including SO-101 arm control, mobile-base control, safety limits, telemetry, and tests.
- [`lerobot_teleoperator_so101_vuer`](lerobot_teleoperator_so101_vuer/README.md): a Vuer-based LeRobot teleoperator for driving an SO-101 arm from Meta Quest hand tracking.

See each package's README for installation, certificate setup, hardware-safety guidance, and usage instructions.

## Security note

WebXR requires HTTPS. Generate TLS certificates locally as described in the package documentation. Private keys and certificates (`*.pem`) are intentionally excluded from version control.
