"""Development-side VLA integration contract (language -> proposed canonical SO-101 program).

This is the *seam* where a learned Vision-Language-Action model will plug in. It is NOT a model:
the only provider shipped here is a deterministic scripted baseline whose output says so
(`provenance.learned_model == false`, `vision_used == false`). Nothing in this module executes a
program, talks to a robot, or claims model quality. A proposed program must still go through the
normal VISTA path: ProgramVersion -> symbolic evaluation -> classroom/robot authorization -> R1.

The action space is exactly the canonical robot_program v1 that the Robot Runtime (R1) accepts:
arm.select, home, gripper.open, gripper.close, wait.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Protocol

ALLOWED_STEPS = ("arm.select", "home", "gripper.open", "gripper.close", "wait")
MAX_INSTRUCTION_CHARS = 500
MAX_STEPS = 32
MAX_WAIT_MS = 60_000  # R1 `lesson` profile default maxWaitMs


class VlaContractError(ValueError):
    """The request or a proposed program violates the contract; the code is stable and safe to show."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Observation:
    """Reference to a camera frame. The scripted baseline ignores it; a learned provider would consume it."""

    image_ref: str
    sha256: str
    captured_at: str


@dataclass(frozen=True)
class VlaRequest:
    instruction: str
    arm: str | None = None
    observation: Observation | None = None


@dataclass(frozen=True)
class VlaPlan:
    program: dict[str, Any]
    provenance: dict[str, Any]
    execution: str = "not_executed"
    warnings: list[str] = field(default_factory=list)


class VlaPolicy(Protocol):
    name: str

    def plan(self, request: VlaRequest) -> VlaPlan: ...


def validate_request(request: VlaRequest) -> None:
    text = request.instruction
    if not isinstance(text, str) or not text.strip():
        raise VlaContractError("instruction_required")
    if len(text) > MAX_INSTRUCTION_CHARS:
        raise VlaContractError("instruction_too_long")
    if request.arm not in (None, "left", "right"):
        raise VlaContractError("arm_invalid")
    if request.observation is not None:
        o = request.observation
        if not (o.image_ref and re.fullmatch(r"[0-9a-f]{64}", o.sha256 or "") and o.captured_at):
            raise VlaContractError("observation_invalid")


def validate_canonical_program(program: Any) -> list[dict[str, Any]]:
    """Mirror of the R1 request validation for the fields a model can influence. Raises VlaContractError."""
    if not isinstance(program, dict) or program.get("kind") != "robot_program" or program.get("schemaVersion") != 1:
        raise VlaContractError("program_not_canonical_v1")
    steps = program.get("steps")
    if not isinstance(steps, list) or not steps or len(steps) > MAX_STEPS:
        raise VlaContractError("program_steps_invalid")
    arm = None
    for step in steps:
        if not isinstance(step, dict) or step.get("type") not in ALLOWED_STEPS:
            raise VlaContractError("program_step_not_allowed")
        kind = step["type"]
        if kind == "arm.select":
            if step.get("arm") not in ("left", "right"):
                raise VlaContractError("selected_arm_invalid")
            arm = step["arm"]
        elif kind in ("home", "gripper.open", "gripper.close"):
            explicit = step.get("arm")
            if explicit not in (None, "left", "right") or (explicit or arm) is None:
                raise VlaContractError("arm_context_missing")
        elif kind == "wait":
            d = step.get("durationMs")
            if not isinstance(d, int) or isinstance(d, bool) or d < 0 or d > MAX_WAIT_MS:
                raise VlaContractError("wait_duration_invalid")
    return steps


_SECONDS = re.compile(r"(?:wait|pause|hold)\D{0,12}?(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b")


class ScriptedBaselinePolicy:
    """Deterministic keyword baseline. Understands only the five canonical actions; anything else is refused, not guessed."""

    name = "scripted-baseline"

    def plan(self, request: VlaRequest) -> VlaPlan:
        validate_request(request)
        text = request.instruction.lower()
        steps: list[dict[str, Any]] = []
        arm = request.arm or ("right" if re.search(r"\bright\b", text) else "left")
        warnings: list[str] = []
        if request.arm is None and not re.search(r"\b(left|right)\b", text):
            warnings.append("no arm named; defaulted to left")
        # Order of appearance in the sentence is the order of actions.
        tokens = [(m.start(), m.group(0)) for m in re.finditer(r"\b(home|open|close|grip(?:per)?|release|grab|wait|pause|hold)\b", text)]
        if not tokens:
            raise VlaContractError("instruction_not_supported")
        steps.append({"type": "arm.select", "arm": arm})
        for position, word in tokens:
            if word == "home":
                steps.append({"type": "home"})
            elif word in ("open", "release"):
                steps.append({"type": "gripper.open"})
            elif word in ("close", "grab"):
                steps.append({"type": "gripper.close"})
            elif word in ("wait", "pause", "hold"):
                found = _SECONDS.search(text[position:])
                ms = int(float(found.group(1)) * 1000) if found else 1000
                steps.append({"type": "wait", "durationMs": min(ms, MAX_WAIT_MS)})
            # bare "gripper"/"grip" adds nothing: the verb decides
        if len(steps) == 1:
            raise VlaContractError("instruction_not_supported")
        program = {"kind": "robot_program", "schemaVersion": 1, "steps": steps}
        validate_canonical_program(program)
        return VlaPlan(
            program=program,
            provenance={"provider": self.name, "learned_model": False, "vision_used": False,
                        "observation_ref": request.observation.image_ref if request.observation else None},
            warnings=warnings,
        )


def propose(policy: VlaPolicy, request: VlaRequest) -> dict[str, Any]:
    """Provider-independent entry point: re-validates whatever a policy returns before it can leave this module."""
    plan = policy.plan(request)
    validate_canonical_program(plan.program)
    if plan.execution != "not_executed" or "learned_model" not in plan.provenance:
        raise VlaContractError("plan_provenance_invalid")
    return {"program": plan.program, "provenance": plan.provenance, "execution": plan.execution, "warnings": plan.warnings}
