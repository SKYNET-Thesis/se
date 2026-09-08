#!/usr/bin/env python3
import asyncio
import json
import subprocess
import sys
import time
from pathlib import Path

from websockets.asyncio.client import connect


ROOT = Path(__file__).resolve().parents[1]


def hand(*, connected=True, enabled=False, position=(0.0, 1.4, -0.4), trigger=0.0):
    return {
        "connected": connected,
        "enabled": enabled,
        "position": list(position),
        "rotation": [0.0, 0.0, 0.0, 1.0],
        "trigger": trigger,
        "grip": 1.0 if enabled else 0.0,
    }


async def exercise_server():
    replies = []
    async with connect("ws://127.0.0.1:8765") as websocket:
        packets = [
            (hand(), hand()),
            (hand(enabled=True), hand(enabled=True)),
            (hand(enabled=True, position=(0.02, 1.4, -0.4), trigger=1.0),
             hand(enabled=True, position=(-0.02, 1.4, -0.4), trigger=0.5)),
        ]
        for sequence, (left, right) in enumerate(packets):
            await websocket.send(json.dumps({
                "sequence": sequence,
                "timestamp": time.time(),
                "left": left,
                "right": right,
            }))
            replies.append(json.loads(await websocket.recv()))
    assert replies[0]["active_hands"] == []
    assert set(replies[1]["active_hands"]) == {"left", "right"}
    assert replies[2]["results"]["left"]["success"]
    assert replies[2]["results"]["right"]["success"]
    assert replies[2]["results"]["left"]["gripper"] == 1.0
    assert replies[2]["results"]["right"]["gripper"] == 0.5
    print("DUAL ARM WEBXR PACKET + CLUTCH + IK + FK: PASS")


def main():
    server = subprocess.Popen(
        [sys.executable, str(ROOT / "backend" / "offline_teleop_server.py")],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        time.sleep(1.0)
        asyncio.run(exercise_server())
    finally:
        server.terminate()
        server.wait(timeout=5)


if __name__ == "__main__":
    main()
