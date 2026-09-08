#!/usr/bin/env bash
# Self-signed certificate for serving the panel over HTTPS on the LAN.
#
# This is the fallback for running with no adb at all. WebXR needs a secure context, and
# over the LAN that means TLS. A self-signed certificate is not trusted by anything, so the
# Quest browser will interrupt with a warning that has to be accepted by hand, once per
# certificate — which is why `quest_wifi.sh` is the better road: it keeps http://localhost,
# and localhost is trusted without any of this.
#
# The address must be baked in as a subjectAltName. A certificate whose name does not match
# the address in the URL is rejected outright by modern browsers, with no way to proceed,
# and a CN alone has not been accepted for years.
set -euo pipefail

IP="${1:-}"
DAYS="${2:-825}"   # Browsers reject leaf certificates valid for much longer than this.
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"

if [ -z "$IP" ]; then
    cat >&2 <<EOF
Usage: $0 <this-machine's-LAN-address> [days]

The address the headset will type, not the robot's. For example:
  $0 192.168.1.10

Candidates on this machine:
$(ipconfig getifaddr en0 2>/dev/null || true)
$(ipconfig getifaddr en1 2>/dev/null || true)
EOF
    exit 2
fi

mkdir -p "$OUT_DIR"
openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$OUT_DIR/key.pem" -out "$OUT_DIR/cert.pem" \
    -days "$DAYS" -subj "/CN=${IP}" \
    -addext "subjectAltName=IP:${IP}" \
    -addext "basicConstraints=critical,CA:FALSE" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth" 2>/dev/null
chmod 600 "$OUT_DIR/key.pem"

cat <<EOF
Written $OUT_DIR/cert.pem and key.pem (valid ${DAYS} days, for IP ${IP}).
The certs/ directory is git-ignored; key material must never be committed.

Serve with:
  lekiwi-vr-teleop --host 0.0.0.0 --cert $OUT_DIR/cert.pem --key $OUT_DIR/key.pem

Then in the Quest browser open https://${IP}:8443 and accept the warning once
("Advanced" -> "Proceed"). Binding to 0.0.0.0 exposes the panel to the whole
network, so do this only on a network you control.
EOF
