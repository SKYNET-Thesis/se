#!/usr/bin/env python3
"""Drive the relay like a headset would, without a headset.

Connects to a running ``lekiwi-vr-relay``, streams synthetic controller frames, exercises
the STOP latch, and prints what the relay reports back. Use it to check the transport and
the safety gating on a machine with no Quest attached.

    lekiwi-vr-relay --port 8443          # terminal 1
    python tools/fake_headset.py         # terminal 2
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import time

import aiohttp


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8443")
    parser.add_argument("--seconds", type=float, default=6.0)
    parser.add_argument("--rate", type=float, default=60.0)
    parser.add_argument("--squeeze", type=float, default=0.0, help="Held grip value [0..1]")
    args = parser.parse_args()

    ws_url = args.url.replace("http", "ws", 1) + "/ws"
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(ws_url, ssl=False) as ws:
            print(f"connected to {ws_url}")
            await ws.send_json({"type": "session", "active": True})

            reader = asyncio.create_task(_drain(ws))
            started = time.monotonic()
            frames = 0
            while time.monotonic() - started < args.seconds:
                t = time.monotonic() - started
                # A slow circle in the horizontal plane, so poses are obviously live.
                await ws.send_json(
                    {
                        "type": "pose",
                        "sessionActive": True,
                        "controllers": {
                            "right": {
                                "position": [0.1 * math.cos(t), 0.1 * math.sin(t), 0.0],
                                "orientation": [0.0, 0.0, 0.0, 1.0],
                                "trigger": 0.0,
                                "squeeze": args.squeeze,
                                "stickX": 0.0,
                                "stickY": 0.0,
                                "tracked": True,
                            },
                            "left": {
                                "position": [0.0, 0.0, 0.0],
                                "orientation": [0.0, 0.0, 0.0, 1.0],
                                "trigger": 0.0,
                                "squeeze": 0.0,
                                "stickX": 0.0,
                                "stickY": 0.0,
                                "tracked": True,
                            },
                        },
                    }
                )
                frames += 1
                await asyncio.sleep(1.0 / args.rate)

            print(f"sent {frames} pose frames in {args.seconds:.1f} s")
            print("exercising the STOP latch ...")
            await ws.send_json({"type": "stop"})
            await asyncio.sleep(0.5)
            print(json.dumps(await _status(session, args.url), indent=2))
            await ws.send_json({"type": "resume"})
            await asyncio.sleep(0.5)
            print(json.dumps(await _status(session, args.url), indent=2))
            reader.cancel()


async def _drain(ws: aiohttp.ClientWebSocketResponse) -> None:
    """Consume server messages so the socket does not back up."""
    async for _ in ws:
        pass


async def _status(session: aiohttp.ClientSession, url: str) -> dict:
    async with session.get(f"{url}/api/status", ssl=False) as response:
        return await response.json()


if __name__ == "__main__":
    asyncio.run(main())
