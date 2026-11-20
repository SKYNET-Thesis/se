# VISTA AI Integration

Speech-to-text, translation, VLA and external AI client integration layer.

## Status (verified 2026-11-19)

* `src/main.py` is still a startup stub. **No model, dataset, training or inference exists in this repository.**
* `src/vla_contract.py` is the development-side seam for a future VLA provider: language instruction (+ optional camera
  frame reference) in, proposed canonical `robot_program` v1 out (`arm.select`, `home`, `gripper.open`, `gripper.close`,
  `wait`). Every provider's output is re-validated and is never executed here.
* The only provider is `ScriptedBaselinePolicy`, a deterministic keyword mapper. It reports `learned_model: false` and
  `vision_used: false`. It is not a VLA and must not be cited as model performance.
* `tests/test_vla_contract.py` cross-checks the contract against the Robot Runtime (R1) validator so the two cannot drift.

Run: `uv run --with pytest --with 'paho-mqtt>=2.1,<3' pytest -q tests`
