#!/usr/bin/env bash
# Forward the relay port to an untethered headset, over Wi-Fi.
#
# WebXR only runs in a secure context, and http://localhost is one. `adb reverse` gives the
# headset a localhost that points back at this machine — and it works over a TCP adb
# connection just as well as over USB. So the cable is needed once, to authorise the
# wireless connection, and then not at all: no certificates, no browser warnings, no
# third-party tunnel carrying the robot's camera feed off the LAN.
#
# The cost is latency, and it is not evenly spread. Measured on a comparable stack: USB
# p50 1.6 ms with a 3.8 ms worst case, Wi-Fi p50 7.6 ms but a p95 of 130 ms. The medians
# are both fine; it is the tail that makes an arm feel unpredictable. Bring a new setup up
# on the cable first so that "the arm feels wrong" cannot be the network.
set -euo pipefail

PORT="${1:-8443}"
ADB_PORT=5555

if ! command -v adb >/dev/null 2>&1; then
    echo "adb not found. Install it with: brew install android-platform-tools" >&2
    exit 1
fi

# An already-connected wireless headset is the steady state; re-running then just
# re-establishes the forward, which does not survive the headset sleeping.
wireless="$(adb devices | awk '/:'"${ADB_PORT}"'[[:space:]]+device$/ {print $1; exit}')"

if [ -z "$wireless" ]; then
    usb="$(adb devices | awk '!/:[0-9]+[[:space:]]/ && /[[:space:]]device$/ {print $1; exit}')"
    if [ -z "$usb" ]; then
        cat >&2 <<'EOF'
No headset found, by cable or over Wi-Fi.

The first time, the cable is required to authorise wireless debugging:
  1. enable Developer Mode (Meta Horizon app -> Devices -> Developer Mode)
  2. plug in a USB-C cable that carries data
  3. confirm "Always allow USB debugging" inside the headset
  4. run this script again, still plugged in — after that the cable can come out
EOF
        adb devices -l >&2
        exit 1
    fi

    ip="$(adb -s "$usb" shell ip -f inet addr show wlan0 2>/dev/null \
          | awk '/inet /{sub(/\/.*/, "", $2); print $2; exit}')"
    if [ -z "$ip" ]; then
        echo "The headset is not on Wi-Fi (no address on wlan0). Connect it to the same network first." >&2
        exit 1
    fi

    echo "Headset at ${ip}; switching adb to TCP on port ${ADB_PORT} ..."
    adb -s "$usb" tcpip "${ADB_PORT}" >/dev/null
    # adbd restarts on the headset; connecting immediately races that restart.
    sleep 2
    adb connect "${ip}:${ADB_PORT}" >/dev/null
    wireless="${ip}:${ADB_PORT}"
    echo "Connected wirelessly. The cable can be unplugged now."
fi

adb -s "$wireless" reverse "tcp:${PORT}" "tcp:${PORT}"

cat <<EOF
Forwarded over Wi-Fi via ${wireless}.
In the Quest browser open: http://localhost:${PORT}

Re-run this after the headset sleeps or rejoins the network — the reverse forward does not
survive either. If it stops connecting entirely, plug the cable back in once and re-run.
EOF
