import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT.parent / "robot-runtime" / "src"))
from vla_contract import ScriptedBaselinePolicy, VlaContractError, VlaPlan, VlaRequest, Observation, propose, validate_canonical_program  # noqa: E402
from runtime import Runtime, ContractError  # noqa: E402

R1 = Runtime({"hardwareEnabled": False, "profiles": {"lesson": {"maxWaitMs": 60000, "maxRunMs": 120000}}, "arms": {}})


def r1_accepts(program):
    try:
        R1._validate_request({"runId": "r", "programVersionId": "v", "profile": "lesson", "robotId": "x", "program": program})
        return True
    except ContractError:
        return False


@pytest.mark.parametrize("text,expected", [
    ("go home", [{"type": "arm.select", "arm": "left"}, {"type": "home"}]),
    ("Open the gripper, wait 2 seconds, then close it", [{"type": "arm.select", "arm": "left"}, {"type": "gripper.open"}, {"type": "wait", "durationMs": 2000}, {"type": "gripper.close"}]),
    ("use the right arm to grab and then release", [{"type": "arm.select", "arm": "right"}, {"type": "gripper.close"}, {"type": "gripper.open"}]),
])
def test_scripted_baseline_maps_language_to_canonical_steps_that_r1_accepts(text, expected):
    result = propose(ScriptedBaselinePolicy(), VlaRequest(text))
    assert result["program"]["steps"] == expected
    assert r1_accepts(result["program"])  # contract cannot drift from the Robot Runtime validator
    assert result["execution"] == "not_executed"
    assert result["provenance"] == {"provider": "scripted-baseline", "learned_model": False, "vision_used": False, "observation_ref": None}


def test_refuses_instead_of_guessing_unsupported_instructions():
    for text in ("pick up the red cube and place it in zone A", "   ", "dance"):
        with pytest.raises(VlaContractError):
            ScriptedBaselinePolicy().plan(VlaRequest(text))
    with pytest.raises(VlaContractError) as caught:
        ScriptedBaselinePolicy().plan(VlaRequest("x" * 501))
    assert caught.value.code == "instruction_too_long"


def test_observation_is_referenced_but_never_claimed_as_used():
    obs = Observation("frames/a.jpg", "a" * 64, "2026-11-19T10:00:00Z")
    out = propose(ScriptedBaselinePolicy(), VlaRequest("home", observation=obs))
    assert out["provenance"]["observation_ref"] == "frames/a.jpg" and out["provenance"]["vision_used"] is False
    with pytest.raises(VlaContractError):
        ScriptedBaselinePolicy().plan(VlaRequest("home", observation=Observation("f", "not-a-digest", "t")))


class Rogue:
    name = "rogue"
    def __init__(self, program, execution="not_executed", provenance=None):
        self._plan = VlaPlan(program=program, execution=execution, provenance={"learned_model": True} if provenance is None else provenance)
    def plan(self, request):
        return self._plan


def test_any_provider_output_is_revalidated_before_it_can_leave_the_module():
    bad_programs = [
        {"kind": "robot_program", "schemaVersion": 1, "steps": [{"type": "move_joint", "joint": "shoulder_pan", "deg": 90}]},  # raw joints are not model-controllable
        {"kind": "robot_program", "schemaVersion": 1, "steps": [{"type": "gripper.open"}]},  # no arm context
        {"kind": "robot_program", "schemaVersion": 1, "steps": [{"type": "arm.select", "arm": "left"}, {"type": "wait", "durationMs": 10**9}]},
        {"kind": "robot_program", "schemaVersion": 2, "steps": []},
    ]
    for program in bad_programs:
        with pytest.raises(VlaContractError):
            propose(Rogue(program), VlaRequest("anything"))
        assert not r1_accepts(program)
    good = {"kind": "robot_program", "schemaVersion": 1, "steps": [{"type": "arm.select", "arm": "left"}, {"type": "home"}]}
    with pytest.raises(VlaContractError):
        propose(Rogue(good, execution="executed"), VlaRequest("x"))
    with pytest.raises(VlaContractError):
        propose(Rogue(good, provenance={}), VlaRequest("x"))
    assert validate_canonical_program(good)
