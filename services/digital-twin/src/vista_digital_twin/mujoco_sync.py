"""Simulation-only SO-101 telemetry to MuJoCo joint-state synchronization."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from .contracts import JointState, SO101_JOINTS, SourceMode


@lru_cache(maxsize=2)
def _load_model(path: str, mtime_ns: int):
    """The parsed model is immutable here (only `MjData` is written), so one load serves every frame; a changed file reloads."""
    import mujoco

    return mujoco.MjModel.from_xml_path(path)


def synchronize_simulation_state(state: JointState, model_path: str | Path) -> dict[str, Any]:
    """Apply SIMULATION radians to matching MuJoCo qpos; never accept physical input.

    Gripper percent has no approved transfer function, so it is intentionally
    left at the model's neutral qpos. A calibrated rad/deg gripper value works.
    """
    if state.source_mode is not SourceMode.SIMULATION:
        raise ValueError("MuJoCo synchronization accepts SIMULATION telemetry only")
    try:
        import mujoco
    except ImportError as error:  # pragma: no cover - depends on optional extra
        raise RuntimeError("Install the digital-twin simulation extra to use MuJoCo") from error

    resolved = Path(model_path)
    model = _load_model(str(resolved), resolved.stat().st_mtime_ns)
    data = mujoco.MjData(model)
    applied: dict[str, float] = {}
    for reading in state.measured:
        if reading.name == "gripper" and reading.unit == "percent":
            continue
        joint_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, reading.name)
        if joint_id < 0:
            raise ValueError(f"MuJoCo model is missing SO-101 joint {reading.name}")
        value = reading.position
        if reading.unit == "deg":
            value = value * 3.141592653589793 / 180
        elif reading.unit != "rad":
            raise ValueError(f"unsupported unit for joint {reading.name}")
        lower, upper = model.jnt_range[joint_id]
        if model.jnt_limited[joint_id] and not lower <= value <= upper:
            raise ValueError(f"joint {reading.name} is outside the MuJoCo model range")
        address = model.jnt_qposadr[joint_id]
        data.qpos[address] = value
        applied[reading.name] = float(value)
    mujoco.mj_forward(model, data)
    return {"sourceMode": "SIMULATION", "applied": applied, "qpos": data.qpos.tolist()}


__all__ = ["synchronize_simulation_state", "SO101_JOINTS"]
