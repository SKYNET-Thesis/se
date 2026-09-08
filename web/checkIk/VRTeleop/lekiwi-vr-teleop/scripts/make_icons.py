#!/usr/bin/env python3
"""Generate the PWA icons.

Committed as a script rather than hand-drawn assets so the icon can be regenerated
(different size, different palette) without a design tool. Run from the repo root:

    python scripts/make_icons.py
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

BACKGROUND = (26, 21, 18)  # BGR of #12151a
ACCENT = (168, 110, 47)  # BGR of #2f6ea8
LIGHT = (244, 237, 232)  # BGR of #e8edf4

WEB_DIR = Path(__file__).resolve().parent.parent / "lekiwi_vr_teleop" / "web"


def draw_icon(size: int) -> np.ndarray:
    """A stylised side view: three arm segments over the omni base's three wheels."""
    scale = size / 512
    image = np.zeros((size, size, 3), dtype=np.uint8)
    image[:] = BACKGROUND

    def point(x: float, y: float) -> tuple[int, int]:
        return int(x * scale), int(y * scale)

    # Keep the glyph inside the central 80% so a maskable crop cannot clip it.
    thickness = max(2, int(26 * scale))

    # Base plate.
    cv2.line(image, point(140, 360), point(372, 360), ACCENT, thickness, cv2.LINE_AA)
    # Three wheels, drawn as rings: the omni base is what makes this robot mobile, and a
    # ring only reads as a wheel while the hub stays open (thickness < radius).
    for cx in (166, 256, 346):
        cv2.circle(image, point(cx, 398), int(32 * scale), ACCENT, int(13 * scale), cv2.LINE_AA)

    # Arm: shoulder -> elbow -> wrist -> jaw.
    joints = [(256, 350), (200, 240), (300, 170), (352, 208)]
    for start, end in zip(joints, joints[1:], strict=False):
        cv2.line(image, point(*start), point(*end), LIGHT, thickness, cv2.LINE_AA)
    for x, y in joints[:-1]:
        cv2.circle(image, point(x, y), int(15 * scale), LIGHT, -1, cv2.LINE_AA)

    # Open jaw at the tip.
    cv2.line(image, point(352, 208), point(392, 178), LIGHT, thickness, cv2.LINE_AA)
    cv2.line(image, point(352, 208), point(398, 226), LIGHT, thickness, cv2.LINE_AA)

    return image


def main() -> None:
    for size in (192, 512):
        path = WEB_DIR / f"icon-{size}.png"
        cv2.imwrite(str(path), draw_icon(size))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
