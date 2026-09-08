"""Tunables for the LeKiwi WebXR teleoperation loop.

Every safety-relevant number lives here so a review can read the whole envelope in one
place. Defaults follow the LeRobot ``isaac_teleop_to_so101`` example where an equivalent
knob exists there.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

# Follower joints, in the order the SO-101 kinematics and the LeKiwi bus expect them.
ARM_MOTORS: tuple[str, ...] = (
    "shoulder_pan",
    "shoulder_lift",
    "elbow_flex",
    "wrist_flex",
    "wrist_roll",
    "gripper",
)

# LeKiwi prefixes every arm key on the wire; the base keys are unprefixed. A two-armed
# robot gives each arm its own prefix, which is why this is a per-arm setting rather than a
# constant — see ArmConfig.prefix.
ARM_PREFIX = "arm_"
BASE_KEYS: tuple[str, ...] = ("x.vel", "y.vel", "theta.vel")


@dataclass
class RelayConfig:
    """HTTP/WebSocket server that serves the WebXR page and receives controller poses."""

    host: str = "127.0.0.1"
    port: int = 8443
    # TLS is only needed for the LAN transport; over `adb reverse` the page is served to
    # the headset as http://localhost:PORT, which WebXR already treats as a secure context.
    cert_file: Path | None = None
    key_file: Path | None = None
    # Cameras mirrored into VR as world-locked panels, in LeKiwi observation-key order.
    camera_keys: tuple[str, ...] = ("front", "wrist")
    jpeg_quality: int = 60
    # A phone is a single-arm operator surface. LeKiwi's default arm is driven by the
    # right WebXR hand, so phone sessions use the same arm unless explicitly configured.
    phone_hand: str = "right"


@dataclass
class ArmConfig:
    """Clutch + inverse-kinematics envelope for the arm."""

    # Which controller drives this arm. One controller carries a whole arm — pose, clutch,
    # jaw and stick are independent channels on a Touch — so a second arm is a second
    # ArmConfig on the other hand and nothing else has to move.
    hand: str = "right"
    # What the robot calls this arm's motors on the wire. LeKiwi has one arm and prefixes
    # it "arm_"; a two-armed robot gives each arm its own prefix.
    prefix: str = ARM_PREFIX
    # Squeeze (grip) value above which the clutch engages. The arm is commanded ONLY while
    # this is held: release freezes it.
    clutch_threshold: float = 0.5
    # Absolute workspace box in the arm base frame [m]. z_min = 0.0 keeps a stray target
    # above the deck the arm is bolted to.
    bounds_min: tuple[float, float, float] = (-0.5, -0.5, 0.0)
    bounds_max: tuple[float, float, float] = (0.5, 0.5, 0.6)
    # Per-frame EE rate limit [m]. At 30 FPS, 0.05 m/frame caps EE speed at ~1.5 m/s —
    # half of the Isaac example's default, because our arm rides a mobile base.
    max_ee_step_m: float = 0.05
    # Rate limits above/below are expressed at this nominal loop rate. The controller
    # scales them by the measured dt, so a slow frame does not make the arm slow down and
    # a burst of fast frames cannot make it speed up.
    nominal_rate_hz: float = 30.0
    # Degrees of jaw travel per degree of hand rotation. Negative flips the direction —
    # which way "roll right" should turn the jaw depends on how the arm is mounted, so
    # this is meant to be set from watching the real robot.
    roll_gain: float = 1.0
    pitch_gain: float = 1.0
    # ---- the two limiters, which are different devices and must not be conflated ----
    #
    # RATE limit [deg/frame], measured against the LAST COMMANDED joint angle. This is the
    # arm's speed limit: 6 deg at 30 FPS is 180 deg/s, against a servo capable of roughly
    # 300 deg/s unloaded. It is open-loop, so it cannot deadlock and does not care how
    # stale the telemetry is.
    #
    # This used to be measured against the MEASURED angle instead, which is a following-
    # error limit wearing a rate limiter's clothes. Inside a feedback path delayed by d
    # seconds it imposes a hard ceiling of (limit / d) on joint speed — at 8 deg and a
    # ~100 ms round trip through Wi-Fi and ZMQ, about 80 deg/s, a quarter of what the
    # hardware can do. Worse, d fluctuates with network jitter, so the hand-to-arm gain
    # changed frame to frame for no observable reason, and the unspent command was
    # discarded each frame so the arm never caught up. That is what "mushy and
    # unpredictable" was. LeRobot's own Cartesian pipeline (EEBoundsAndSafety) anchors to
    # the last command for the same reason.
    max_joint_step_deg: float = 6.0
    # EMA applied inside the command-state loop. 1 disables smoothing. Keeping it here
    # (rather than after compute()) ensures every limiter knows the action actually sent.
    joint_smoothing_alpha: float = 1.0
    #
    # FAULT limit [deg], measured against the measured angle. This one is a following-error
    # limit on purpose: it catches a genuinely stuck or obstructed joint, where the command
    # would otherwise keep running away from an arm that is not moving. Budget it well
    # above the standing error a healthy servo needs at full speed, so it never binds
    # during ordinary motion — it is a fault detector, not a governor. The host's own
    # --robot.max_relative_target is the independent second layer, and unlike this one it
    # reads the position microseconds before writing, so it can afford to be tight.
    max_tracking_error_deg: float = 25.0
    # ---- the jaw ----
    #
    # Jaw travel the trigger spans, in SO-101 RANGE_0_100 units (100 = fully open). The
    # mapping was always proportional — the same one lerobot's own example uses — but the
    # whole finger travel was stretched over the whole jaw range, and most of that range is
    # the jaw closing through empty air. Narrowing it to the aperture the work actually
    # needs puts the finger's resolution where the operator can use it.
    gripper_open: float = 100.0
    gripper_closed: float = 0.0
    # Per-frame jaw rate limit, against the last command. 4 units at 30 FPS closes the full
    # range in about 0.8 s, so the jaw can be walked onto an object instead of snapping shut.
    gripper_max_step: float = 4.0
    # How far the jaw command may run past where the jaw actually is.
    #
    # Below the point of contact, a position command IS a force command: the jaw cannot
    # move, the error grows, and the servo winds up to its torque limit with nothing to
    # report it. There is no force feedback on this arm and none on the controller, so
    # nothing tells the operator the difference between "gripped" and "crushing". This caps
    # the wind-up. Budget it above the lag a freely closing jaw shows, so it limits force
    # and not speed — the same distinction as max_tracking_error_deg for the joints.
    gripper_squeeze_margin: float = 18.0
    # Command-minus-measured gap that counts as "the jaw is holding something". Free travel
    # never reaches it; contact passes it within a frame or two.
    gripper_contact: float = 8.0
    # How far behind the controller's grip origin the operator's hand actually pivots [m].
    #
    # A controller does not rotate about its own origin: it rotates about the wrist, which
    # sits several centimetres back along the direction the controller points. So "turning
    # the hand on the spot" also translates the grip pose, that translation lands in the
    # position channel, and the arm sets off across the workspace for what the operator
    # experienced as a pure rotation. Driving the arm from a point offset back toward the
    # wrist removes most of it, and makes turning the jaw in place possible at all.
    #
    # Set to 0.0 for the raw grip pose. The right value is anatomy, so it is measured
    # rather than assumed — see docs/ARM_CONTROL.md.
    hand_pivot_m: float = 0.08
    # Bare-hand palm tracking is noisier than a Touch grip pose, and ordinary reach/lift
    # motions naturally rotate the palm. Keep the tool orientation latched by default so
    # translation cannot make the gripper dive or roll. Controllers still track rotation.
    track_hand_orientation: bool = False
    # Human arm motion follows arcs: lifting the hand also moves it slightly forward.
    # When one translation axis clearly dominates, keep only that intent for XRHand.
    # Set to 0 to preserve unrestricted diagonal motion.
    hand_axis_lock_ratio: float = 1.25
    hand_axis_lock_min_m: float = 0.001
    # Posture the arm ramps to when the operator asks for it.
    #
    # A stowed arm is folded into a corner of its own workspace, and teleoperation from
    # there is not merely awkward — it is impossible. Measured on the parked pose: of six
    # directions, moving back falls 5.5 cm short, down 8 cm, left 1 cm, and only forward,
    # right and up work at all. From mid-workspace every direction solves. No mapping
    # change can fix that, so the operator needs a way to get out of the corner first.
    ready_pose: dict[str, float] = field(
        default_factory=lambda: {
            "shoulder_pan": 0.0,
            "shoulder_lift": -40.0,
            "elbow_flex": 50.0,
            "wrist_flex": 20.0,
            "wrist_roll": 0.0,
        }
    )
    # Which way the elbow folds. The SO-101's joint limits admit the mirrored branch in
    # about 1% of the workspace and never exclusively, so this is very nearly a formality —
    # but naming it means the solver can never quietly flip branches mid-stroke.
    elbow_up: bool = True
    # 1:1 by default. Below 1.0 the arm moves less than your hand — useful for fine work.
    position_scale: float = 1.0
    # How the arm's base frame is turned relative to the operator, in degrees about the
    # base Z axis. The page already removes the operator's own heading, so this covers the
    # remaining, fixed question: which way is the robot standing? 0 assumes the operator
    # faces the same way as the arm; use 180 when standing in front of it, looking at it.
    base_yaw_offset_deg: float = 0.0


@dataclass
class BaseConfig:
    """Thumbstick mapping for the omni base."""

    # Which stick translates the base, and which one turns it. Independent of the arms:
    # a stick is usable while the same hand's grip and trigger are held, so both hands can
    # drive an arm and still steer.
    hand: str = "left"
    turn_hand: str = "right"
    linear_speed_m_s: float = 0.1
    angular_speed_deg_s: float = 30.0
    # Stick travel below this is treated as zero (Quest sticks do not rest at exactly 0).
    deadzone: float = 0.15
    # Longitudinal sign convention inherited from the existing screen panel: pushing the
    # stick forward drives the robot physically forward. See docs/LEKIWI_SETUP_AND_TELEOP.md.
    invert_longitudinal: bool = True


@dataclass
class TeleopConfig:
    """Top-level configuration for the full loop."""

    # No default: the address of someone else's robot is not a sensible fallback, and a
    # baked-in one is a LAN layout published to everyone who clones this. Supplied by
    # --remote-ip or the LEKIWI_REMOTE_IP environment variable; None is legitimate for the
    # relay-only mode, which never connects to a robot.
    remote_ip: str | None = None
    robot_id: str = "lekiwi_01"
    fps: int = 30
    # Run the whole loop against the real robot — observations, cameras, clutch, IK,
    # telemetry — but never call send_action. The first run of new teleoperation code
    # against a real machine should not be the run that also moves it.
    dry_run: bool = False
    # Controller data older than this counts as lost tracking: the base is zeroed and the
    # arm holds. The Pi host watchdog (500 ms) is the second, independent layer.
    input_timeout_s: float = 0.25
    relay: RelayConfig = field(default_factory=RelayConfig)
    # One entry per arm; which controller drives it lives on the ArmConfig. LeKiwi has a
    # single arm, and a two-armed robot such as XLeRobot is two entries and no code change.
    arms: tuple[ArmConfig, ...] = field(default_factory=lambda: (ArmConfig(),))
    base: BaseConfig = field(default_factory=BaseConfig)

    def __post_init__(self) -> None:
        hands = [arm.hand for arm in self.arms]
        if len(set(hands)) != len(hands):
            raise ValueError(f"two arms cannot share one controller: {hands}")
        if not self.arms:
            raise ValueError("at least one arm is required")

    @property
    def arm(self) -> ArmConfig:
        """The single arm, for the one-armed case the tests still talk about.

        Raises rather than guessing when there is more than one: silently picking the first
        would make a two-armed misconfiguration look like it worked.
        """
        if len(self.arms) != 1:
            raise ValueError(f"this robot has {len(self.arms)} arms; iterate over .arms")
        return self.arms[0]
