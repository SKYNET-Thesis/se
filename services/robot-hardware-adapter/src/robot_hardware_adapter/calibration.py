from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Literal, Protocol


class CalibrationGateway(Protocol):
    def start(self, *, role: Literal["LEADER", "FOLLOWER"], port: str, profile_id: str) -> dict[str, Any]: ...
    def status(self) -> dict[str, Any]: ...
    def complete(self) -> None: ...
    def cancel(self) -> None: ...


def get_calibration_dir(role: Literal["LEADER", "FOLLOWER"]) -> Path:
    """Return the filesystem directory where LeLab stores calibration files for the given role."""
    base_leader = os.environ.get(
        "LELAB_LEADER_CALIBRATION_DIR",
        str(Path.home() / ".cache/huggingface/lerobot/calibration/teleoperators/so_leader"),
    )
    base_follower = os.environ.get(
        "LELAB_FOLLOWER_CALIBRATION_DIR",
        str(Path.home() / ".cache/huggingface/lerobot/calibration/robots/so_follower"),
    )
    return Path(base_leader) if role == "LEADER" else Path(base_follower)


def list_profiles(role: Literal["LEADER", "FOLLOWER"] | None = None) -> dict[str, list[str]]:
    """List available LeLab calibration profiles for leader and/or follower."""
    result: dict[str, list[str]] = {}
    roles_to_check: list[Literal["LEADER", "FOLLOWER"]] = [role] if role else ["LEADER", "FOLLOWER"]
    for r in roles_to_check:
        key = "leader" if r == "LEADER" else "follower"
        directory = get_calibration_dir(r)
        configs: list[str] = []
        if directory.is_dir():
            try:
                for entry in sorted(directory.iterdir()):
                    if entry.is_file() and entry.suffix == ".json":
                        configs.append(entry.stem)
            except OSError:
                pass
        result[key] = configs
    return result


def load_profile(role: Literal["LEADER", "FOLLOWER"], profile_id: str) -> dict[str, Any] | None:
    """Load and parse an existing LeLab calibration JSON file."""
    if not profile_id or "/" in profile_id or "\\" in profile_id or ".." in profile_id:
        return None
    directory = get_calibration_dir(role)
    target = directory / f"{profile_id}.json"
    if not target.is_file():
        return None
    try:
        return json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return None


def profile_exists(role: Literal["LEADER", "FOLLOWER"], profile_id: str) -> bool:
    """Check if a calibration file already exists on disk."""
    if not profile_id or "/" in profile_id or "\\" in profile_id or ".." in profile_id:
        return False
    target = get_calibration_dir(role) / f"{profile_id}.json"
    return target.is_file()


def get_profile_ranges(role: Literal["LEADER", "FOLLOWER"], profile_id: str) -> dict[str, tuple[float, float]] | None:
    """Extract trusted joint ranges (min, max) from an existing profile if available."""
    data = load_profile(role, profile_id)
    if not data or not isinstance(data, dict):
        return None
    ranges: dict[str, tuple[float, float]] = {}
    for joint, cfg in data.items():
        if isinstance(cfg, dict) and "range_min" in cfg and "range_max" in cfg:
            try:
                rmin = float(cfg["range_min"])
                rmax = float(cfg["range_max"])
                if rmax > rmin:
                    ranges[joint] = (rmin, rmax)
            except (ValueError, TypeError):
                continue
    return ranges or None


class LeLabCalibrationGateway:
    """Thin adapter over LeLab's existing CalibrationManager.

    Importing LeLab and any hardware library is delayed until a real operator
    starts calibration. Calling this class does not create a serial connection.
    """
    def __init__(self):
        from lelab.calibrate import CalibrationManager, CalibrationRequest
        self.manager, self.request_type = CalibrationManager(), CalibrationRequest

    def start(self, *, role: Literal["LEADER", "FOLLOWER"], port: str, profile_id: str) -> dict[str, Any]:
        result = self.manager.start_calibration(
            self.request_type(device_type="teleop" if role == "LEADER" else "robot", port=port, config_file=profile_id)
        )
        if not result.get("success"):
            raise RuntimeError(result.get("message", "LeLab refused calibration"))
        return self.status()

    def status(self) -> dict[str, Any]:
        return self.manager.get_status().__dict__

    def complete(self) -> None:
        result = self.manager.complete_step()
        if not result.get("success"):
            raise RuntimeError(result.get("message", "LeLab refused completion"))

    def cancel(self) -> None:
        self.manager.stop_calibration_process()
