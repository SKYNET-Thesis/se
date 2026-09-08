"""Fake follower adapter contract for the VR LeKiwi integration.

Ticket 01 deliberately keeps this boundary offline.  The adapter owns the selected
left/right followers and translates the arm-prefixed wire shape used by the control loop
to each follower's local SO-101 joint keys.  A later ticket may provide a real follower
factory; this module does not discover or open serial hardware.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol

from .local_teleop import START_POSE

ArmMode = Literal["left-only", "right-only", "dual-arm"]
Arm = Literal["left", "right"]

_PREFIXES: dict[Arm, str] = {"left": "left_arm_", "right": "right_arm_"}


class Follower(Protocol):
    is_connected: bool

    def connect(self, calibrate: bool = True) -> None: ...

    def get_observation(self) -> dict[str, Any]: ...

    def send_action(self, action: dict[str, float]) -> dict[str, float]: ...

    def disconnect(self) -> None: ...


@dataclass(frozen=True)
class FollowerSpec:
    arm: Arm
    port: str
    device_id: str


class FakeSOFollower:
    """Deterministic follower that records lifecycle and actions without hardware."""

    def __init__(self, port: str, device_id: str) -> None:
        self.port = port
        self.device_id = device_id
        self.is_connected = False
        self.connect_count = 0
        self.disconnect_count = 0
        self.last_action: dict[str, float] = {}
        self._observation = dict(START_POSE)

    def connect(self, calibrate: bool = True) -> None:
        del calibrate
        self.connect_count += 1
        self.is_connected = True

    def get_observation(self) -> dict[str, float]:
        return dict(self._observation)

    def send_action(self, action: dict[str, float]) -> dict[str, float]:
        if not self.is_connected:
            raise RuntimeError(f"fake follower {self.device_id!r} is disconnected")
        self.last_action = {key: float(value) for key, value in action.items()}
        self._observation.update(self.last_action)
        return dict(self.last_action)

    def disconnect(self) -> None:
        self.disconnect_count += 1
        self.is_connected = False


FollowerFactory = Callable[[FollowerSpec], Follower]


class DualSO101FollowerRobot:
    """Manage explicitly selected fake left/right followers as one robot boundary."""

    def __init__(
        self,
        *,
        mode: ArmMode = "dual-arm",
        left_port: str | None = None,
        right_port: str | None = None,
        left_device_id: str | None = None,
        right_device_id: str | None = None,
        follower_factory: FollowerFactory = lambda spec: FakeSOFollower(
            spec.port, spec.device_id
        ),
    ) -> None:
        self.mode = mode
        self._active_arms = self._arms_for_mode(mode)
        specs = {
            "left": FollowerSpec("left", left_port or "", left_device_id or ""),
            "right": FollowerSpec("right", right_port or "", right_device_id or ""),
        }
        self._validate_specs(specs)
        self._followers: dict[Arm, Follower] = {
            arm: follower_factory(specs[arm]) for arm in self._active_arms
        }

    @staticmethod
    def _arms_for_mode(mode: ArmMode) -> tuple[Arm, ...]:
        if mode == "left-only":
            return ("left",)
        if mode == "right-only":
            return ("right",)
        if mode == "dual-arm":
            return ("left", "right")
        raise ValueError(f"unsupported arm mode: {mode!r}")

    def _validate_specs(self, specs: dict[Arm, FollowerSpec]) -> None:
        selected = [specs[arm] for arm in self._active_arms]
        missing = [spec.arm for spec in selected if not spec.port or not spec.device_id]
        if missing:
            raise ValueError(f"explicit port and device ID required for: {', '.join(missing)}")
        if self.mode == "dual-arm":
            ports = {spec.port for spec in selected}
            device_ids = {spec.device_id for spec in selected}
            if len(ports) != len(selected) or len(device_ids) != len(selected):
                raise ValueError("dual-arm followers must have distinct port and device identities")

    @property
    def is_connected(self) -> bool:
        return all(self._followers[arm].is_connected for arm in self._active_arms)

    @property
    def active_arms(self) -> tuple[Arm, ...]:
        return self._active_arms

    @property
    def left_follower(self) -> Follower | None:
        return self._followers.get("left")

    @property
    def right_follower(self) -> Follower | None:
        return self._followers.get("right")

    def connect(self) -> None:
        opened: list[Follower] = []
        try:
            for arm in self._active_arms:
                follower = self._followers[arm]
                opened.append(follower)
                follower.connect()
        except Exception:
            for follower in reversed(opened):
                follower.disconnect()
            raise

    def get_observation(self) -> dict[str, Any]:
        if not self.is_connected:
            raise RuntimeError("follower adapter is disconnected")
        observation: dict[str, Any] = {}
        for arm in self._active_arms:
            prefix = _PREFIXES[arm]
            observation.update(
                {
                    f"{prefix}{key}": value
                    for key, value in self._followers[arm].get_observation().items()
                }
            )
        return observation

    def send_action(self, action: dict[str, float]) -> dict[str, float]:
        if not self.is_connected:
            raise RuntimeError("follower adapter is disconnected")
        routed: dict[Arm, dict[str, float]] = {arm: {} for arm in self._active_arms}
        for key, value in action.items():
            matches = [
                arm for arm in self._active_arms if key.startswith(_PREFIXES[arm])
            ]
            if len(matches) != 1:
                raise KeyError(f"action key is not owned by an active arm: {key}")
            arm = matches[0]
            routed[arm][key.removeprefix(_PREFIXES[arm])] = float(value)

        sent: dict[str, float] = {}
        for arm in self._active_arms:
            local_action = routed[arm]
            if local_action:
                result = self._followers[arm].send_action(local_action)
                sent.update({f"{_PREFIXES[arm]}{key}": value for key, value in result.items()})
        return sent

    def disconnect(self) -> None:
        errors: list[Exception] = []
        for arm in reversed(self._active_arms):
            follower = self._followers[arm]
            try:
                if follower.is_connected:
                    follower.disconnect()
            except Exception as exc:  # cleanup all followers before reporting failure
                errors.append(exc)
        if errors:
            raise errors[0]
