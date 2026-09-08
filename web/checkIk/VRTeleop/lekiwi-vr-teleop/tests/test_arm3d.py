"""The headset's forward kinematics must be the robot's forward kinematics.

``web/arm3d.js`` re-implements ``so101_chain.forward`` in JavaScript, because the page draws
at 72-90 Hz from a status channel that arrives at ~10 and therefore has to interpolate joint
angles and re-derive link poses per frame. Two implementations of the same geometry will
drift apart the moment one is edited; this test runs the real JavaScript in Node and
compares it against the Python, so they cannot.

Skipped where Node is unavailable — it is a check on the model, not on the robot, and it
must never be the reason a control-loop test suite cannot run.
"""

import json
import math
import random
import shutil
import subprocess
from pathlib import Path

import pytest

from lekiwi_vr_teleop import so101_chain as chain

NODE = shutil.which("node")
ARM3D = Path(__file__).resolve().parent.parent / "lekiwi_vr_teleop" / "web" / "arm3d.js"

pytestmark = pytest.mark.skipif(NODE is None, reason="Node is needed to run the page's own JS")


def _run_js(poses):
    """Evaluate armPoints() in Node for a list of joint dicts."""
    script = f"""
      global.window = {{}};
      require({json.dumps(str(ARM3D))});
      const poses = {json.dumps(poses)};
      console.log(JSON.stringify(poses.map((p) => window.armPoints(p))));
    """
    result = subprocess.run(
        [NODE, "--input-type=commonjs", "-e", script],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def _sample(rng):
    return {
        name: rng.uniform(*[0.9 * bound for bound in chain.JOINT_LIMITS[name]])
        for name in ("shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex")
    }


def test_the_javascript_chain_matches_the_python_one():
    rng = random.Random(20260804)
    poses = [_sample(rng) for _ in range(120)]
    worst = {"tool": 0.0, "elbow": 0.0, "wrist": 0.0, "shoulder": 0.0, "approach": 0.0}
    for pose, js in zip(poses, _run_js(poses)):
        py = chain.forward(pose)
        for key in worst:
            worst[key] = max(worst[key], math.dist(js[key], py[key]))
    for key, error in worst.items():
        assert error < 1e-9, f"{key} differs between arm3d.js and so101_chain.py by {error}"


ZERO = {"shoulder_pan": 0.0, "shoulder_lift": 0.0, "elbow_flex": 0.0, "wrist_flex": 0.0}


def test_the_javascript_constants_are_the_python_constants():
    """Catches a constant edited on one side only, even where it barely moves the tool.

    The zero pose isolates the mounting angles; a single flexed joint exposes each link
    length on its own.
    """
    poses = {
        "zero": ZERO,
        "lift": {**ZERO, "shoulder_lift": 90.0},
        "elbow": {**ZERO, "elbow_flex": 90.0},
        "flex": {**ZERO, "wrist_flex": 90.0},
        "pan": {**ZERO, "shoulder_pan": 90.0},
    }
    js = dict(zip(poses, _run_js(list(poses.values()))))
    for name, joints in poses.items():
        py = chain.forward(joints)
        for key in ("base", "shoulder", "elbow", "wrist", "tool"):
            assert js[name][key] == pytest.approx(py[key], abs=1e-12), f"{name}/{key}"


def test_the_javascript_tolerates_a_partial_joint_set():
    """Telemetry can arrive incomplete across a reconnect; the page must draw, not throw.

    Python's forward() is deliberately strict — a missing joint in the control path is a
    bug, and defaulting it to zero would command the arm somewhere. The page has the
    opposite priority, so the asymmetry is intentional and pinned here.
    """
    (partial,) = _run_js([{"shoulder_lift": -40.0}])
    assert partial["tool"] == pytest.approx(
        chain.forward({**ZERO, "shoulder_lift": -40.0})["tool"], abs=1e-12
    )
    with pytest.raises(KeyError):
        chain.forward({"shoulder_lift": -40.0})
