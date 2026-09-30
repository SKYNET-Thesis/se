#!/usr/bin/env python3
"""Render the colored command-center PLY as a lightweight 360 background."""

import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SOURCE = Path(
    "/home/quangduc/Downloads/unity_soarm/SO101_Arm/Assets/"
    "Earth_View_Command_Center_Edited.reconstructed_mesh.ply"
)
OUTPUT = Path("webxr/public/assets/command_center_360.jpg")
WIDTH, HEIGHT = 4096, 2048


def load_vertices(path: Path):
    with path.open("rb") as stream:
        header = []
        while True:
            line = stream.readline()
            header.append(line.decode("ascii").strip())
            if line == b"end_header\n":
                break
        count = int(next(line.split()[2] for line in header if line.startswith("element vertex")))
        # double xyz, uchar rgba, double quality
        dtype = np.dtype([
            ("xyz", "<f8", (3,)), ("rgba", "u1", (4,)), ("quality", "<f8")
        ])
        vertices = np.fromfile(stream, dtype=dtype, count=count)
    return vertices["xyz"], vertices["rgba"][:, :3]


def fill_holes(rgb, valid, rounds=10):
    rgb = rgb.astype(np.float32)
    for _ in range(rounds):
        if valid.all():
            break
        color_sum = np.zeros_like(rgb)
        neighbor_count = np.zeros(valid.shape, np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            shifted_valid = np.roll(valid, (dy, dx), axis=(0, 1))
            shifted_rgb = np.roll(rgb, (dy, dx), axis=(0, 1))
            if dy < 0: shifted_valid[dy:] = False
            if dy > 0: shifted_valid[:dy] = False
            color_sum += shifted_rgb * shifted_valid[..., None]
            neighbor_count += shifted_valid
        new_pixels = (~valid) & (neighbor_count > 0)
        rgb[new_pixels] = color_sum[new_pixels] / neighbor_count[new_pixels, None]
        valid |= new_pixels
    return np.clip(rgb, 0, 255).astype(np.uint8)


def main():
    xyz, colors = load_vertices(SOURCE)
    radius = np.linalg.norm(xyz, axis=1)
    usable = radius > 0.05
    xyz, colors, radius = xyz[usable], colors[usable], radius[usable]

    # Scan coordinates use +Y down and +Z forward.  Panorama V therefore maps
    # directly from elevation in that camera coordinate system.
    longitude = np.arctan2(xyz[:, 0], xyz[:, 2])
    elevation = np.arctan2(xyz[:, 1], np.hypot(xyz[:, 0], xyz[:, 2]))
    px = np.mod(((longitude / (2 * np.pi)) + 0.5) * WIDTH, WIDTH).astype(np.int32)
    py = np.clip(((elevation / np.pi) + 0.5) * HEIGHT, 0, HEIGHT - 1).astype(np.int32)
    pixel = py.astype(np.int64) * WIDTH + px

    # Retain the closest sample for each panorama pixel.
    order = np.lexsort((radius, pixel))
    sorted_pixel = pixel[order]
    first = np.r_[True, sorted_pixel[1:] != sorted_pixel[:-1]]
    chosen = order[first]
    image = np.zeros((HEIGHT, WIDTH, 3), np.uint8)
    valid = np.zeros((HEIGHT, WIDTH), bool)
    image[py[chosen], px[chosen]] = colors[chosen]
    valid[py[chosen], px[chosen]] = True

    image = fill_holes(image, valid)
    result = Image.fromarray(image).filter(ImageFilter.GaussianBlur(0.65))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    result.save(OUTPUT, quality=92, subsampling=0)
    print(f"PANORAMA_OK {OUTPUT} {OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
