#!/usr/bin/env bash
# Forward the relay port to the headset over USB.
#
# WebXR only runs in a secure context. http://localhost counts as one, so forwarding the
# Mac's port to the headset's own localhost avoids TLS entirely — and USB has ~1 ms RTT
# with no Wi-Fi jitter. Re-run this after every re-plug: adb reverse does not survive it.
set -euo pipefail

PORT="${1:-8443}"

if ! command -v adb >/dev/null 2>&1; then
    echo "adb not found. Install it with: brew install android-platform-tools" >&2
    exit 1
fi

state="$(adb get-state 2>/dev/null || true)"
if [ "$state" != "device" ]; then
    echo "No authorized headset. Check that:" >&2
    echo "  1. Developer Mode is enabled (Meta Horizon app -> Devices -> Developer Mode)" >&2
    echo "  2. the USB-C cable carries data, not just power" >&2
    echo "  3. 'Always allow USB debugging' was confirmed inside the headset" >&2
    adb devices -l >&2
    exit 1
fi

adb reverse "tcp:${PORT}" "tcp:${PORT}"
echo "Forwarded. In the Quest browser open: http://localhost:${PORT}"
