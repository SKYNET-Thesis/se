#!/usr/bin/env python3
"""Probe a V4L2 camera or write an MJPEG stream to stdout."""

from __future__ import annotations

import argparse
import json
import sys
import time

import cv2


def open_camera(path: str):
    capture = cv2.VideoCapture(path, cv2.CAP_V4L2)
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    capture.set(cv2.CAP_PROP_FPS, 30)
    return capture


def probe(paths: list[str]) -> None:
    result = []
    for path in paths:
        capture = open_camera(path)
        ok, frame = capture.read() if capture.isOpened() else (False, None)
        if ok and frame is not None:
            height, width = frame.shape[:2]
            fps = capture.get(cv2.CAP_PROP_FPS)
            result.append({
                "path": path,
                "connection": "connected",
                "resolution": f"{width}×{height}",
                "fps": round(fps) if 1 <= fps <= 240 else 30,
            })
        capture.release()
    print(json.dumps(result), flush=True)


def stream(path: str) -> None:
    capture = open_camera(path)
    if not capture.isOpened():
        raise RuntimeError(f"could not open {path}")
    output = sys.stdout.buffer
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                time.sleep(0.05)
                continue
            encoded, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not encoded:
                continue
            payload = jpeg.tobytes()
            output.write(
                b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                + str(len(payload)).encode()
                + b"\r\n\r\n"
                + payload
                + b"\r\n"
            )
            output.flush()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
    finally:
        capture.release()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("probe", "stream"))
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    if args.mode == "probe":
        probe(args.paths)
    else:
        stream(args.paths[0])


if __name__ == "__main__":
    main()
