# Standalone Vuer test with the real SO-101 follower

This guide creates a clean test project for
[`Oasis-Uniandes/lerobot_teleoperator_so101_vuer`](https://github.com/Oasis-Uniandes/lerobot_teleoperator_so101_vuer)
without starting the dashboard or the existing WebXR bridge.

## Known hardware configuration on this laptop

| Device | Port | LeRobot calibration ID |
|---|---|---|
| Left leader | `/dev/ttyACM0` | `my_awesome_bimanual_leader_left` |
| Left follower | `/dev/ttyACM1` | `my_awesome_bimanual_follower_left` |

The standalone Vuer test must open **only `/dev/ttyACM1`**. It does not need
the leader. Both USB cables may remain connected, but no process should open
`/dev/ttyACM0` during this test.

## 1. Stop every existing teleoperation process

Stop the dashboard session and all old `lerobot-teleoperate`, WebXR, and Vuer
terminals with `Ctrl+C`. Check both serial ports:

```bash
fuser -v /dev/ttyACM0 /dev/ttyACM1
```

There should be no output before starting the standalone test. If a PID is
shown, stop that program first. Do not run two robot-control processes at the
same time.

## 2. Clone the Vuer project into a clean directory

```bash
cd /home/quangduc/Code
git clone https://github.com/Oasis-Uniandes/lerobot_teleoperator_so101_vuer.git vuer_standalone_test
cd /home/quangduc/Code/vuer_standalone_test
```

## 3. Install it in the existing LeRobot environment

The repository's `requirements.txt` names `pyroki`, but PyRoKi is currently
installed from GitHub rather than PyPI. Use these commands:

```bash
/home/quangduc/miniconda3/envs/lerobot/bin/python3 -m pip install \
  vuer scipy robot-descriptions \
  'git+https://github.com/chungmin99/pyroki.git'

/home/quangduc/miniconda3/envs/lerobot/bin/python3 -m pip install -e . --no-deps
```

Verify the imports:

```bash
/home/quangduc/miniconda3/envs/lerobot/bin/python3 -c \
  "import vuer, pyroki, lerobot_teleoperator_so101_vuer; print('Vuer imports OK')"
```

## 4. Create the HTTPS certificate required by Quest WebXR

Run this from the cloned repository root:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj '/CN=so101-vuer.local'
```

## 5. Confirm the follower calibration

The expected calibration file is:

```text
/home/quangduc/.cache/huggingface/lerobot/calibration/robots/so_follower/my_awesome_bimanual_follower_left.json
```

Check it:

```bash
test -f /home/quangduc/.cache/huggingface/lerobot/calibration/robots/so_follower/my_awesome_bimanual_follower_left.json \
  && echo 'Follower calibration found' \
  || echo 'Follower calibration MISSING'
```

Do not recalibrate merely for this experiment if this file exists and the
follower already works in normal leader-follower teleoperation.

## 6. Check whether LeRobot discovered the Vuer plugin

```bash
/home/quangduc/miniconda3/envs/lerobot/bin/lerobot-teleoperate --help \
  | grep so101_vuer
```

If `so101_vuer` appears, run the upstream command below. If it does not appear,
the cloned repository is not auto-imported by this installed LeRobot version;
use the fallback launcher in the next section.

## 7A. Run through `lerobot-teleoperate` when the plugin is discovered

Place the physical follower in a centered, slightly bent pose and keep the
emergency stop ready. Then run:

```bash
cd /home/quangduc/Code/vuer_standalone_test

/home/quangduc/miniconda3/envs/lerobot/bin/lerobot-teleoperate \
  --robot.type=so101_follower \
  --robot.port=/dev/ttyACM1 \
  --robot.id=my_awesome_bimanual_follower_left \
  --robot.max_relative_target=1.5 \
  --teleop.type=so101_vuer \
  --teleop.id=vuer-left \
  --teleop.user_hand=left \
  --teleop.vuer_cert=/home/quangduc/Code/vuer_standalone_test/cert.pem \
  --teleop.vuer_key=/home/quangduc/Code/vuer_standalone_test/key.pem \
  --fps=30
```

If Draccus rejects `--robot.max_relative_target=1.5`, remove only that one
option and keep the initial movements very small.

## 7B. Fallback launcher when `so101_vuer` is missing from CLI help

Create `run_real_follower.py` in the cloned project with this content:

```python
import time

from lerobot.robots.so_follower import SOFollower, SOFollowerRobotConfig
from lerobot_teleoperator_so101_vuer import So101VuerTeleop, So101VuerTeleopConfig


robot = SOFollower(SOFollowerRobotConfig(
    port="/dev/ttyACM1",
    id="my_awesome_bimanual_follower_left",
    use_degrees=True,
    max_relative_target=1.5,
))
teleop = So101VuerTeleop(So101VuerTeleopConfig(
    id="vuer-left",
    user_hand="left",
    vuer_cert="/home/quangduc/Code/vuer_standalone_test/cert.pem",
    vuer_key="/home/quangduc/Code/vuer_standalone_test/key.pem",
))

try:
    robot.connect(calibrate=False)
    # The upstream repository currently defines connect() without arguments.
    teleop.connect()
    print("Vuer and /dev/ttyACM1 follower are ready")
    while True:
        robot.send_action(teleop.get_action())
        time.sleep(1 / 30)
finally:
    teleop.disconnect()
    robot.disconnect()
```

Run it with:

```bash
cd /home/quangduc/Code/vuer_standalone_test
/home/quangduc/miniconda3/envs/lerobot/bin/python3 run_real_follower.py
```

This fallback reproduces the upstream control loop, so it may move toward the
repository's absolute default IK target immediately. Keep one hand on the
emergency stop and stop at once if the robot stretches unexpectedly.

## 8. Open Vuer on Quest 3

This laptop currently uses IP `192.168.123.8`. Laptop and Quest must be on the
same Wi-Fi network. After the terminal says the Vuer server is ready, open:

```text
https://vuer.ai?ws=wss://192.168.123.8:8012
```

If the upstream terminal prints a different Network URL, use exactly the URL
printed by that terminal. Accept the local certificate warning if prompted,
recenter the Quest view, select passthrough/AR, and press **Enter VR**.

## 9. Verify that only the follower is open

While Vuer is running, open another terminal:

```bash
fuser -v /dev/ttyACM0 /dev/ttyACM1
```

Expected result:

- `/dev/ttyACM1` has the Vuer/LeRobot Python PID.
- `/dev/ttyACM0` has no PID.

If `/dev/ttyACM0` has a PID, stop the test and record both the PID and its
command:

```bash
ps -fp <PID>
```

## 10. Information to bring back to the main project

Record these results:

1. Whether `so101_vuer` appeared in `lerobot-teleoperate --help`.
2. The exact command that successfully started the follower.
3. The full Network URL printed by Vuer.
4. Output of `fuser -v /dev/ttyACM0 /dev/ttyACM1` while moving.
5. Whether hand up/down, forward/backward, and pinch mapped correctly.
6. Any traceback or warnings printed in the terminal.
