#!/usr/bin/env bash
# One command: forward the port over USB and open the panel inside the headset.
#
# Saves typing a URL with the virtual keyboard in VR. The page still has to be launched
# into VR by pressing the button on it — entering an immersive session requires a user
# gesture, and no amount of automation may forge one.
set -euo pipefail

PORT="${1:-8443}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${HERE}/quest_usb.sh" "${PORT}"

adb shell am start -a android.intent.action.VIEW \
    -d "http://localhost:${PORT}" com.oculus.browser >/dev/null

echo "Panel opened in the headset. Put it on and press «Войти в VR»."
