# SO-101 supervised physical telemetry test & hardware calibration runbook

## Prerequisites

- A supervising operator is present. Emergency stop and power isolation are accessible.
- VISTA Robot B and organization IDs have been confirmed against the selected physical follower.
- The selected LeLab profile, leader, follower and calibration config names are recorded below.
- The operator has configured the same private HMAC value in `DIGITAL_TWIN_SCOPE_SECRET` and `VISTA_TWIN_AUTH_SECRET`. Never put either secret in this document, the frontend, a command line, or source control.
- An owner-only operator session secret file exists: `$HOME/.config/vista/hardware-adapter-hmac.secret` (mode `0600`).

## Mapping worksheet

| Field | Operator value | Evidence |
| --- | --- | --- |
| LeLab profile | `Teleop` | Saved in `~/.cache/huggingface/lerobot/calibration` |
| Leader device identity | `so101-leader-arm` | Confirmed physically |
| Follower device identity | `so101-follower-arm` | Confirmed physically |
| Leader calibration config | `Teleop.json` | LeLab format |
| Follower calibration config | `Teleop.json` | LeLab format |
| VISTA robot UUID | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` | Database allocation |
| Organization UUID | `a6a03387-bae6-4a8f-947d-298ea828a935` | Database allocation |
| Stable LeLab owner ID | `vista-local-lelab-worker-1` | Must be identical in LeLab, Digital Twin and publisher scope |

Do not use a `/dev/tty*` index as device identity. Current LeLab saved ports are volatile and this host has no `/dev/serial/by-id` directory.

---

## 1. Local Hardware Adapter Startup

The hardware adapter binds strictly to `127.0.0.1:8771` and enforces advisory flock ownership on `/tmp/vista-hardware-locks`.

```bash
# 1. Ensure owner-only secret file exists (at least 32 bytes)
mkdir -p "$HOME/.config/vista" && chmod 0700 "$HOME/.config/vista"
test -f "$HOME/.config/vista/hardware-adapter-hmac.secret" || openssl rand -hex 32 > "$HOME/.config/vista/hardware-adapter-hmac.secret"
chmod 0600 "$HOME/.config/vista/hardware-adapter-hmac.secret"

# 2. Launch the loopback-only adapter
cd /home/quangduc/Code/vista/se/services/robot-hardware-adapter
export VISTA_HARDWARE_ADAPTER_SESSION_SECRET_FILE="$HOME/.config/vista/hardware-adapter-hmac.secret"
export VISTA_HARDWARE_LOCK_DIR="/tmp/vista-hardware-locks"
export VISTA_HARDWARE_ADAPTER_PORT="8771"

/home/quangduc/.local/bin/uv run python -m robot_hardware_adapter.app
```

Verify service health:
```bash
curl -s http://127.0.0.1:8771/health
# Expected: {"status":"ok","binding":"127.0.0.1 only"}
```

---

## 2. Operator Authorization Token Generation

Issue a short-lived HMAC session token (valid 10 minutes) bound to the confirmed robot, device, and role:

```bash
cd /home/quangduc/Code/vista/se/services/robot-hardware-adapter
/home/quangduc/.local/bin/uv run python -m robot_hardware_adapter.operator_cli \
  --secret-file "$HOME/.config/vista/hardware-adapter-hmac.secret" \
  --robot-id "f1c066c4-b5f2-45c4-b933-f034f3824dd9" \
  --device-id "so101-leader-arm" \
  --device-role "LEADER" \
  --ttl-seconds 600
```

Copy the emitted token. It is never stored in persistent browser storage.

---

## 3. Supervised Hardware Calibration Workflow (VISTA Light UI)

1. Open `http://127.0.0.1:5173/lab`.
2. Select **Physical telemetry** and choose the allocated robot (`f1c066c4-b5f2-45c4-b933-f034f3824dd9`).
3. Scroll to the **Hardware setup and calibration** panel.

### Step 3.1: Leader / Follower Configuration
- In **Device Type**, select `Teleoperator (Leader)` or `Follower (Robot)`.
- Open **Advanced Settings**:
  - Paste the operator session token generated in Section 2.
  - Verify **Device Identifier** matches (`so101-leader-arm` or `so101-follower-arm`).
  - Enter the **Profile Name** (`Teleop`).
  - Check *Allow overwriting existing LeLab profile* if replacing a prior profile.

### Step 3.2: USB Port Discovery (Find Port)
- Click **Find**. The **Port Detection** modal appears.
- When prompted **"Unplug the leader arm"**, physically disconnect the USB cable of the arm.
  - Click **Check disconnect after unplugging** (or wait for auto-detection).
- When prompted **"Reconnect the leader arm"**, reconnect the USB cable to the host.
  - Click **Check reconnected port**.
- The candidate port (e.g. `/dev/ttyACM1`) is identified.
- Click **Confirm & Use Port**. The port field is populated and confirmed.

### Step 3.3: Supervised Calibration Sweep
- Click **Start Calibration**.
- Verify the status badge switches to **Recording**.
- The advisory lock `/tmp/vista-hardware-locks/<hash(port)>.lock` is held.
- Follow supervised sweep instructions:
  - Hold the physical arm joints in the center of their travel at start.
  - Move each of the 6 joints through its full physical range of motion:
    1. `shoulder_pan`
    2. `shoulder_lift`
    3. `elbow_flex`
    4. `wrist_flex`
    5. `wrist_roll`
    6. `gripper`
- Observe live joint coverage bars:
  - Current positions update in real time.
  - Observed min/max expand with joint motion.
  - Coverage percentage displays true observed span (requires > 100 motor steps).

### Step 3.4: Review and Save
- Click **Review Ranges**.
- Verify that no joint has identical min/max and all spans exceed 100 steps.
- Click **Confirm & Save**.
- The adapter writes the calibration JSON directly to LeLab's standard path (`~/.cache/huggingface/lerobot/calibration/teleoperators/so_leader/Teleop.json` or `.../robots/so_follower/Teleop.json`).
- The lock is released and the session is completed safely.

### Safe Cancellation
- At any time during detection or calibration, clicking **Cancel** safely aborts the thread, releases serial ownership locks, and resets adapter state.

---

## 4. Visual Calibration Transition

After hardware calibration is saved, calibrate the 3D digital twin pose using the visual calibration CLI:

```bash
cd /home/quangduc/Code/vista/se/services/digital-twin
export VISTA_CALIBRATION_DIR="$HOME/.local/state/vista/calibration"
mkdir -p "$VISTA_CALIBRATION_DIR"

# 1. Create draft referencing the saved LeLab profile
python -m vista_digital_twin.calibration_cli --directory "$VISTA_CALIBRATION_DIR" \
  create-draft \
  --robot-id "f1c066c4-b5f2-45c4-b933-f034f3824dd9" \
  --follower-id "so101-follower-arm" \
  --version "1" \
  --lelab-reference "Teleop.json"

# 2. Inspect profile
python -m vista_digital_twin.calibration_cli --directory "$VISTA_CALIBRATION_DIR" \
  inspect \
  --robot-id "f1c066c4-b5f2-45c4-b933-f034f3824dd9" \
  --version "1"

# 3. Record visual pose observation evidence
python -m vista_digital_twin.calibration_cli --directory "$VISTA_CALIBRATION_DIR" \
  record-evidence \
  --robot-id "f1c066c4-b5f2-45c4-b933-f034f3824dd9" \
  --version "1" \
  --reference "supervised-hardware-calibration-pass-20261105"

# 4. Verify & activate visual profile
python -m vista_digital_twin.calibration_cli --directory "$VISTA_CALIBRATION_DIR" \
  verify \
  --robot-id "f1c066c4-b5f2-45c4-b933-f034f3824dd9" \
  --version "1" \
  --confirm

python -m vista_digital_twin.calibration_cli --directory "$VISTA_CALIBRATION_DIR" \
  activate \
  --robot-id "f1c066c4-b5f2-45c4-b933-f034f3824dd9" \
  --follower-id "so101-follower-arm" \
  --version "1"
```

The Digital Twin panel switches status to **VERIFIED — calibrated pose enabled**.

---

## 5. Teleoperation Handoff and Mutual Exclusion

The adapter and LeLab teleoperation share the same advisory flock protocol:
- If calibration is running, LeLab teleoperation cannot start (`SerialOwnershipError: serial port /dev/ttyACM... is owned by another supported process`).
- If teleoperation is running, calibration cannot start (`DeviceOwnershipConflict: device /dev/ttyACM... is owned by another supported process`).

To launch teleoperation after calibration:
```bash
# Verify no calibration lock is active
ls -la /tmp/vista-hardware-locks

# Start LeLab teleoperation through supported supervised path
cd /home/quangduc/Code/vista/lelab-reference
python -m lelab.teleoperate --robot-name "Teleop"
```

---

## 6. Shutdown Checklist

- Stop teleoperation or calibration through their respective UI/CLI controls.
- Confirm `/tmp/vista-hardware-locks` is clear.
- Confirm Digital Twin panel becomes stale or disconnected.
- Stop the hardware adapter with `Ctrl-C`.
- Record PASS/FAIL in the physical test log.
