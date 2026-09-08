"""The control loop, driven against a fake robot, with one arm and with two.

The per-arm bookkeeping is exactly the kind of thing that looks right and is half-wired:
an arm that is commanded but never held, or held from the other arm's observation, or two
arms whose actions collide on the wire. None of that shows up in a unit test of
``ArmController``, so the loop itself is exercised here.
"""

import numpy as np
import pytest

from lekiwi_vr_teleop import teleop
from lekiwi_vr_teleop.config import ARM_MOTORS, ArmConfig, BaseConfig, RelayConfig, TeleopConfig
from lekiwi_vr_teleop.state import ControllerState

REST = {
    "shoulder_pan": 0.0,
    "shoulder_lift": -40.0,
    "elbow_flex": 50.0,
    "wrist_flex": 20.0,
    "wrist_roll": 0.0,
    "gripper": 60.0,
}


class FakeRobot:
    """A robot that answers observations and records what it was told, then stops the loop.

    The arms follow their commands exactly, which keeps the limiters out of the way: this
    is a test of the plumbing, not of the envelope.
    """

    def __init__(self, prefixes, ticks=6):
        self.prefixes = prefixes
        self.state = {
            f"{prefix}{name}.pos": REST[name] for prefix in prefixes for name in ARM_MOTORS
        }
        self.sent = []
        self.ticks = ticks
        self.stopped = False
        self.is_connected = False

    def connect(self):
        self.is_connected = True

    def disconnect(self):
        self.is_connected = False

    def get_observation(self):
        if self.ticks > 0:
            self.ticks -= 1
            return dict(self.state)
        if not self.stopped:
            # Ends the loop the way Ctrl-C does. Raised once only: the shutdown path reads
            # one more observation to latch the final hold, and it catches Exception, which
            # KeyboardInterrupt is not.
            self.stopped = True
            raise KeyboardInterrupt
        return dict(self.state)

    def send_action(self, action):
        self.sent.append(dict(action))
        for key, value in action.items():
            if key in self.state:
                self.state[key] = value


@pytest.fixture
def driven(monkeypatch):
    """Run the loop with a squeezed clutch on both hands and a fake robot."""

    def run(arms):
        robot = FakeRobot([arm.prefix for arm in arms])
        monkeypatch.setattr(teleop, "LeKiwiClient", lambda _config: robot)
        monkeypatch.setattr(teleop, "LeKiwiClientConfig", lambda **_kwargs: None)

        config = TeleopConfig(arms=tuple(arms), base=BaseConfig(), fps=200)

        # Drive the clutch directly rather than through a socket: the transport has its own
        # tests, and a real headset cannot be part of a unit test.
        engaged = ControllerState(
            position=np.zeros(3),
            orientation=np.array([0.0, 0.0, 0.0, 1.0]),
            squeeze=1.0,
            trigger=0.0,
            tracked=True,
        )
        published = []

        class Stub:
            """Stands in for the relay: no port to bind, no thread to join."""

            url = "http://test"

            def __init__(self, *_a, **_k):
                pass

            def start(self):
                pass

            def stop(self):
                pass

            def publish_cameras(self, _observation):
                pass

            def publish_telemetry(self, telemetry):
                published.append(telemetry)

        monkeypatch.setattr(teleop, "Relay", Stub)

        class FreshSnapshot:
            controllers = {"left": engaged, "right": engaged}
            age_s = 0.0

            def is_fresh(self, _timeout):
                return True

            def controller(self, hand):
                return self.controllers[hand]

        monkeypatch.setattr(teleop.XRState, "snapshot", lambda _self: FreshSnapshot())
        teleop.run(config)
        return robot, published

    return run


def test_one_arm_is_commanded_on_lekiwis_prefix(driven):
    robot, published = driven([ArmConfig(hand="right")])
    assert robot.sent
    keys = set(robot.sent[-1])
    assert {f"arm_{name}.pos" for name in ARM_MOTORS} <= keys
    assert published[-1]["arms"].keys() == {"right"}


def test_two_arms_are_both_commanded_and_never_collide(driven):
    arms = [
        ArmConfig(hand="left", prefix="left_arm_"),
        ArmConfig(hand="right", prefix="right_arm_"),
    ]
    robot, published = driven(arms)
    last = robot.sent[-1]
    for prefix in ("left_arm_", "right_arm_"):
        assert {f"{prefix}{name}.pos" for name in ARM_MOTORS} <= set(last)
    # Every arm key belongs to exactly one arm: a shared prefix would silently halve the
    # number of commanded motors, and the robot would look like it was working.
    arm_keys = [key for key in last if key.endswith(".pos")]
    assert len(arm_keys) == 2 * len(ARM_MOTORS)


def test_telemetry_is_keyed_by_hand_for_both_arms(driven):
    arms = [
        ArmConfig(hand="left", prefix="left_arm_"),
        ArmConfig(hand="right", prefix="right_arm_"),
    ]
    _robot, published = driven(arms)
    arms_telemetry = published[-1]["arms"]
    assert arms_telemetry.keys() == {"left", "right"}
    for hand in ("left", "right"):
        entry = arms_telemetry[hand]
        assert entry["engaged"] is True
        assert set(entry["joints"]) == set(ARM_MOTORS)
        assert set(entry["jointsTarget"]) == set(ARM_MOTORS)
        assert "trackingErrorDeg" in entry


def test_each_arm_reads_its_own_joints(driven):
    """A second arm at a different pose must not be commanded from the first arm's angles."""
    arms = [
        ArmConfig(hand="left", prefix="left_arm_"),
        ArmConfig(hand="right", prefix="right_arm_"),
    ]
    robot = FakeRobot(["left_arm_", "right_arm_"], ticks=0)
    robot.state["left_arm_elbow_flex.pos"] = 10.0
    robot.state["right_arm_elbow_flex.pos"] = 80.0

    left = teleop._Arm(arms[0])
    right = teleop._Arm(arms[1])
    assert left.observation(robot.state)["elbow_flex.pos"] == 10.0
    assert right.observation(robot.state)["elbow_flex.pos"] == 80.0


def test_a_dry_run_simulates_an_arm_that_follows(driven, monkeypatch):
    """A dry run must be able to answer "is the mapping right", and it could not.

    Nothing is sent, so the measured pose never changes, so the following-error limiter
    correctly refuses to let the command travel more than max_tracking_error_deg from an
    arm that is standing still. That reads as erratic kinematics and is nothing of the
    kind — a whole debugging session went into it.
    """
    arm = teleop._Arm(ArmConfig(hand="right"), simulate=True)
    raw = {f"arm_{name}.pos": REST[name] for name in ARM_MOTORS}
    assert arm.observation(raw)["elbow_flex.pos"] == REST["elbow_flex"]

    # The simulated arm arrives where it was told, and the next observation reflects that.
    arm.accept({f"{name}.pos": 12.0 for name in ARM_MOTORS})
    assert arm.observation(raw)["elbow_flex.pos"] == 12.0
    # ... while the real robot's own reading is untouched and still says otherwise.
    assert raw["arm_elbow_flex.pos"] == REST["elbow_flex"]


def test_a_live_run_never_simulates():
    """The moment motors can move, the measurement must be the robot's own."""
    arm = teleop._Arm(ArmConfig(hand="right"), simulate=False)
    raw = {f"arm_{name}.pos": REST[name] for name in ARM_MOTORS}
    arm.accept({f"{name}.pos": 12.0 for name in ARM_MOTORS})
    assert arm.observation(raw)["elbow_flex.pos"] == REST["elbow_flex"]


def test_telemetry_flags_a_simulated_arm(driven):
    """The panel must never present a simulation as the robot's real pose."""
    _robot, published = driven([ArmConfig(hand="right")])
    assert published[-1]["arms"]["right"]["simulated"] is False
