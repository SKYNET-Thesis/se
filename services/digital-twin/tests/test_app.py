import asyncio
import json

from vista_digital_twin.app import create_app


async def http_request(app, method, path):
    sent = []
    received = False
    async def send(message):
        sent.append(message)

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": b"", "more_body": False}
        await asyncio.Event().wait()

    scope = {
        "type": "http", "method": method, "path": path, "raw_path": path.encode(),
        "query_string": b"", "headers": [], "scheme": "http",
        "server": ("127.0.0.1", 8000), "client": ("127.0.0.1", 1234),
        "http_version": "1.1",
    }
    await app(scope, receive, send)
    return sent


async def receive_frames(app, count):
    incoming = asyncio.Queue()
    outgoing = asyncio.Queue()
    await incoming.put({"type": "websocket.connect"})
    scope = {
        "type": "websocket", "path": "/ws/twin", "raw_path": b"/ws/twin",
        "query_string": b"", "headers": [], "scheme": "ws",
        "server": ("127.0.0.1", 8000), "client": ("127.0.0.1", 1234),
        "subprotocols": [], "extensions": {},
    }
    async with app.router.lifespan_context(app):
        task = asyncio.create_task(app(scope, incoming.get, outgoing.put))
        try:
            assert (await asyncio.wait_for(outgoing.get(), 2))["type"] == "websocket.accept"
            frames = [json.loads((await asyncio.wait_for(outgoing.get(), 2))["text"]) for _ in range(count)]
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    return frames


def test_mock_websocket_sends_simulation_frames_and_health_is_explicit():
    app = create_app(rate_hz=30)
    async def run():
        response = await http_request(app, "GET", "/health")
        assert response[0]["status"] == 200
        assert json.loads(response[1]["body"]) == {"status": "ok", "mode": "mock"}
        return await receive_frames(app, 2)

    first, second = asyncio.run(run())
    assert first["source_mode"] == "SIMULATION"
    assert first["controller_id"] == "offline-fixture"
    assert len(first["measured"]) == 6
    assert second["sequence"] > first["sequence"]
    assert "commanded" not in first


def test_mock_websocket_exposes_disconnect_and_reconnect_without_new_measurements():
    app = create_app(rate_hz=100, disconnect_at=1, reconnect_at=3)
    frames = asyncio.run(receive_frames(app, 4))
    assert [frame["connection"] for frame in frames] == [
        "connected", "disconnected", "disconnected", "connected"
    ]
    assert frames[1]["measured_at"] == frames[0]["measured_at"]
    assert frames[3]["measured_at"] != frames[0]["measured_at"]


def test_mock_service_has_no_hardware_control_routes():
    async def run():
        app = create_app()
        assert (await http_request(app, "POST", "/move-arm"))[0]["status"] == 404
        assert (await http_request(app, "POST", "/runs"))[0]["status"] == 404

    asyncio.run(run())
