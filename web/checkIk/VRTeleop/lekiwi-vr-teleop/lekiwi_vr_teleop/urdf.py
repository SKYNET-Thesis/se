"""Fetching the SO-101 URDF.

The control loop does not need this — :mod:`so101_chain` is closed-form and carries the
geometry as constants, so the runtime has no URDF, no meshes and no placo dependency, and
starts in a moment rather than in twenty seconds.

What the URDF is still for is keeping those constants honest: ``tests/test_so101_chain.py``
loads it through placo and checks every hard-coded number against it. That test is the only
thing standing between a URDF revision and a headset confidently drawing the wrong arm, so
the download stays.
"""

from __future__ import annotations

import logging

from lerobot.utils.constants import HF_LEROBOT_HOME

logger = logging.getLogger(__name__)


def ensure_so101_urdf() -> str:
    """Return the cached SO-101 URDF path, fetching it on first use.

    Mirrors ``_ensure_so101_urdf`` from the LeRobot example: the URDF and its meshes come
    from the public ``lerobot/robot-urdfs`` bucket, and a marker file is written only after
    a complete sync so an interrupted download does not leave a URDF whose meshes are
    missing (the URDF's mere existence would otherwise hide that forever).
    """
    dest_dir = HF_LEROBOT_HOME / "robot-urdfs" / "so101"
    urdf_path = dest_dir / "so101_new_calib.urdf"
    marker = dest_dir / ".sync_complete"
    if not marker.exists():
        from huggingface_hub import sync_bucket

        logger.info("Fetching the SO-101 URDF into %s ...", dest_dir)
        sync_bucket("hf://buckets/lerobot/robot-urdfs/so101", str(dest_dir), quiet=True)
        marker.touch()
    return str(urdf_path)
