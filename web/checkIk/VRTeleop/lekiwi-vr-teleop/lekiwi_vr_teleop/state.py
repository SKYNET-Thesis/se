"""Thread-safe hand-off between the asyncio relay and the synchronous control loop.

The relay thread writes controller frames as they arrive from the headset (72-90 Hz); the
control loop reads a snapshot once per tick (30 Hz). Everything the loop needs to decide
whether it may command the robot is in :class:`XRSnapshot` — including how old the data is,
so a frozen or disconnected headset degrades to "no input" rather than to "last input,
forever".
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

import numpy as np

from .phone import PhonePose, phone_orientation, phone_position


@dataclass
class ControllerState:
    """One controller as reported by the WebXR page, already in the arm base frame."""

    position: np.ndarray = field(default_factory=lambda: np.zeros(3))
    orientation: np.ndarray = field(default_factory=lambda: np.array([0.0, 0.0, 0.0, 1.0]))
    trigger: float = 0.0
    squeeze: float = 0.0
    stick_x: float = 0.0
    stick_y: float = 0.0
    # True while the page reports a valid tracked pose for this controller.
    tracked: bool = False
    # "controller" or "hand". For a bare hand, squeeze carries the page's latched
    # thumb-to-middle clutch gesture rather than a physical grip button.
    kind: str = "controller"
    # Operator is asking the arm to travel to its ready posture. Honoured only while the
    # clutch is also held, so the deadman still governs every millimetre of that motion.
    ready: bool = False
    # Raw button states by index, for diagnosing a controller whose layout is not the one
    # the xr-standard mapping promises.
    buttons: tuple[int, ...] = ()


@dataclass
class XRSnapshot:
    """Immutable view of the headset input at one instant."""

    controllers: dict[str, ControllerState]
    age_s: float
    stopped: bool
    session_active: bool
    frames_received: int

    def controller(self, hand: str) -> ControllerState:
        return self.controllers.get(hand, ControllerState())

    def is_fresh(self, timeout_s: float) -> bool:
        """True when the loop may act on this input at all."""
        return self.session_active and not self.stopped and self.age_s <= timeout_s


def _finite_control(value: object, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    if not np.isfinite(number):
        return 0.0
    return float(np.clip(number, minimum, maximum))


class XRState:
    """Shared, lock-guarded controller state plus the latched emergency stop."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._controllers: dict[str, ControllerState] = {}
        self._last_update_at: float | None = None
        self._stopped = False
        self._session_active = False
        self._frames = 0
        # Round-trip time measured by the page and reported back, for the status line.
        self._rtt_ms: float | None = None
        self._owner: str | None = None
        self._phone_session: str | None = None
        self._phone_hand = "right"
        self._phone_gripper_trigger = 0.0
        self._phone_last_at: float | None = None
        self._phone_last_sequence = -1

    def update_from_page(self, payload: dict) -> None:
        """Ingest one ``pose`` message from the WebXR page.

        The page sends positions/orientations already converted to the arm base frame, so
        the frame convention lives in exactly one place that a reviewer can check
        (``web/app.js`` -> ``VR_TO_BASE``, mirrored by ``frames.py`` for the Python side).
        """
        with self._lock:
            if self._owner not in (None, "vr"):
                return
        controllers: dict[str, ControllerState] = {}
        for hand, raw in (payload.get("controllers") or {}).items():
            try:
                position = np.asarray(raw.get("position", [0.0, 0.0, 0.0]), dtype=float)
                orientation = np.asarray(raw.get("orientation", [0.0, 0.0, 0.0, 1.0]), dtype=float)
            except (TypeError, ValueError):
                position = np.zeros(3)
                orientation = np.array([0.0, 0.0, 0.0, 1.0])
                valid = False
            else:
                valid = position.shape == (3,) and orientation.shape == (4,)
            valid = valid and bool(np.all(np.isfinite(position))) and bool(np.all(np.isfinite(orientation)))
            quat_norm = float(np.linalg.norm(orientation)) if valid else 0.0
            valid = valid and 0.5 < quat_norm < 1.5
            if valid:
                orientation = orientation / quat_norm
            with self._lock:
                previous = self._controllers.get(hand)
            # A human hand cannot teleport 25 cm between adjacent WebXR packets.
            # Reject the sample and let the clutch release rather than forwarding a spike.
            if valid and previous is not None and previous.tracked:
                valid = float(np.linalg.norm(position - previous.position)) <= 0.25
            controllers[hand] = ControllerState(
                position=position if position.shape == (3,) else np.zeros(3),
                orientation=orientation if orientation.shape == (4,) else np.array([0.0, 0.0, 0.0, 1.0]),
                trigger=_finite_control(raw.get("trigger", 0.0), 0.0, 1.0),
                squeeze=_finite_control(raw.get("squeeze", 0.0), 0.0, 1.0),
                stick_x=_finite_control(raw.get("stickX", 0.0), -1.0, 1.0),
                stick_y=_finite_control(raw.get("stickY", 0.0), -1.0, 1.0),
                tracked=bool(raw.get("tracked", False)) and valid,
                kind=str(raw.get("kind", "controller")),
                ready=bool(raw.get("ready", False)),
                buttons=tuple(int(b) for b in raw.get("buttons", []) or []),
            )
        with self._lock:
            self._controllers = controllers
            self._last_update_at = time.monotonic()
            self._frames += 1
            self._session_active = bool(payload.get("sessionActive", True))
            if payload.get("rttMs") is not None:
                self._rtt_ms = float(payload["rttMs"])
    def set_session_active(self, active: bool) -> None:
        with self._lock:
            if active and self._owner not in (None, "vr"):
                return
            if active:
                self._owner = "vr"
            self._session_active = active
            if not active:
                self._controllers = {}
                if self._owner == "vr":
                    self._owner = None

    def start_phone_session(self, session_id: str, hand: str) -> bool:
        with self._lock:
            if self._owner not in (None, "phone"):
                return False
            self._owner = "phone"
            self._phone_session = session_id
            self._phone_hand = hand
            self._phone_last_sequence = -1
            self._phone_last_at = None
            self._phone_gripper_trigger = 0.0
            return True

    def update_from_phone(self, pose: PhonePose) -> bool:
        with self._lock:
            if self._owner != "phone" or pose.sessionId != self._phone_session:
                return False
            if pose.sequence <= self._phone_last_sequence:
                raise ValueError("stale or out-of-order phone sequence")
            self._phone_last_sequence = pose.sequence
            now = time.monotonic()
            previous = self._phone_last_at
            self._phone_last_at = now
            dt = 0.05 if previous is None else float(np.clip(now - previous, 0.01, 0.1))
            self._phone_gripper_trigger = float(np.clip(self._phone_gripper_trigger - pose.gripperVelocity * dt, 0.0, 1.0))
            tracked = pose.trackingState != "lost" and pose.enabled
            self._controllers[self._phone_hand] = ControllerState(
                position=phone_position(pose.position),
                orientation=phone_orientation(pose.quaternion),
                trigger=self._phone_gripper_trigger,
                squeeze=1.0 if tracked else 0.0,
                tracked=tracked,
                kind="phone",
            )
            self._last_update_at = now
            self._frames += 1
            self._session_active = tracked
            return True

    def phone_recenter(self) -> None:
        with self._lock:
            if self._owner == "phone":
                self._controllers.pop(self._phone_hand, None)
                self._session_active = False

    def phone_disconnected(self) -> None:
        with self._lock:
            if self._owner == "phone":
                self._controllers = {}
                self._session_active = False
                self._owner = None
                self._phone_session = None

    def trigger_stop(self) -> None:
        """Latch the emergency stop. Only :meth:`clear_stop` releases it."""
        with self._lock:
            self._stopped = True

    def clear_stop(self) -> None:
        with self._lock:
            self._stopped = False

    @property
    def stopped(self) -> bool:
        with self._lock:
            return self._stopped

    def snapshot(self) -> XRSnapshot:
        with self._lock:
            age = 1e6 if self._last_update_at is None else time.monotonic() - self._last_update_at
            return XRSnapshot(
                controllers=dict(self._controllers),
                age_s=age,
                stopped=self._stopped,
                session_active=self._session_active,
                frames_received=self._frames,
            )

    def status(self) -> dict:
        """Human-readable state for the 2D page and the ``/api/status`` endpoint."""
        snap = self.snapshot()
        with self._lock:
            owner = self._owner
            phone_hand = self._phone_hand
        return {
            "sessionActive": snap.session_active,
            "stopped": snap.stopped,
            "ageS": round(snap.age_s, 3) if snap.age_s < 1e5 else None,
            "framesReceived": snap.frames_received,
            "rttMs": self._rtt_ms,
            "hands": sorted(snap.controllers),
            "owner": owner,
            "phoneHand": phone_hand if owner == "phone" else None,
            # The operator's hand as the loop sees it. Without this, a mapping that misreads
            # the hand is indistinguishable from kinematics that mishandle a correct read —
            # the joints are visible and their cause is not.
            "controllers": {
                hand: {
                    "position": [round(float(v), 4) for v in c.position],
                    "orientation": [round(float(v), 4) for v in c.orientation],
                    "squeeze": round(float(c.squeeze), 2),
                    "trigger": round(float(c.trigger), 2),
                    "tracked": bool(c.tracked),
                    "kind": c.kind,
                    "buttons": list(c.buttons),
                }
                for hand, c in snap.controllers.items()
            },
        }
