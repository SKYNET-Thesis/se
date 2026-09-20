#!/usr/bin/env python3
"""Small client for the running offline WebSocket integration test."""

import asyncio
import json
import time

from websockets.asyncio.client import connect


async def main() -> None:
    base = {
        "connected": True,
        "enabled": False,
        "position": [0.0, 1.4, -0.4],
        "rotation": [0.0, 0.0, 0.0, 1.0],
        "trigger": 0.0,
        "grip": 0.0,
    }
    replies = []
    async with connect("ws://127.0.0.1:8765") as websocket:
        for sequence, (enabled, x) in enumerate(((False, 0.0), (True, 0.0), (True, 0.02))):
            hand = {
                **base,
                "enabled": enabled,
                "grip": 1.0 if enabled else 0.0,
                "position": [x, 1.4, -0.4],
            }
            packet = {
                "sequence": sequence,
                "timestamp": time.time(),
                "left": hand,
                "right": {**base, "connected": False},
            }
            await websocket.send(json.dumps(packet))
            reply = json.loads(await websocket.recv())
            replies.append(reply)
            print(json.dumps(reply, indent=2))

    assert replies[0]["active_hands"] == []
    assert replies[1]["results"]["left"]["success"]
    final = replies[2]["results"]["left"]
    assert final["success"]
    # Translation scale is 0.5, so a +20 mm mock controller delta is +10 mm robot X.
    delta_x = final["target"][0] - replies[1]["results"]["left"]["target"][0]
    assert abs(delta_x - 0.01) < 1e-9
    assert final["position_error"] <= 1e-4
    print("OFFLINE WEBSOCKET + CLUTCH + IK + FK: PASS")


if __name__ == "__main__":
    asyncio.run(main())
