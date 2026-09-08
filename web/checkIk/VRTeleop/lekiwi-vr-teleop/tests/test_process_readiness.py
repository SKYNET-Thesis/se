import asyncio
import shutil
import socket
import subprocess
from pathlib import Path

import aiohttp
import pytest

from lekiwi_vr_teleop import process
from lekiwi_vr_teleop.follower_adapter import FakeSOFollower
from lekiwi_vr_teleop.process import parse_process_args, start_ready_runtime


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
def tls_files(tmp_path: Path) -> tuple[Path, Path]:
    if shutil.which("openssl") is None:
        pytest.skip("openssl is required for the HTTPS relay fixture")
    cert = tmp_path / "test-cert.pem"
    key = tmp_path / "test-key.pem"
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-days",
            "1",
            "-nodes",
            "-subj",
            "/CN=localhost",
        ],
        check=True,
        capture_output=True,
    )
    return cert, key


def _config(mode: str = "dual-arm", port: int | None = None):
    args = [
        "--mode",
        mode,
        "--certificate",
        "unused-cert.pem",
        "--key",
        "unused-key.pem",
        "--relay-port",
        str(port or 9443),
    ]
    if mode in ("left-only", "dual-arm"):
        args += ["--left-port", "/dev/fake-left", "--left-device-id", "left-id"]
    if mode in ("right-only", "dual-arm"):
        args += ["--right-port", "/dev/fake-right", "--right-device-id", "right-id"]
    return parse_process_args(args)


def test_status_endpoint_reports_process_relay_mode_and_active_arms(tls_files):
    cert, key = tls_files
    config = _config(port=_free_port())
    config = config.__class__(**{**config.__dict__, "certificate": cert, "key": key})
    runtime = start_ready_runtime(config)
    try:
        async def fetch():
            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(connector=connector) as client:
                async with client.get(f"{runtime.relay.url}/api/status") as response:
                    return response.status, await response.json()

        status, payload = asyncio.run(fetch())
        assert status == 200
        assert payload["processState"] == "ready"
        assert payload["relayState"] == "listening"
        assert payload["mode"] == "dual-arm"
        assert payload["activeArms"] == ["left", "right"]
    finally:
        runtime.close()


class RecordingRelay:
    def __init__(self, config, _state, status_provider):
        self.config = config
        self._status_provider = status_provider
        self.events = []

    @property
    def operator_url(self):
        return f"https://127.0.0.1:{self.config.port}"

    def start(self):
        self.events.append("relay-listen")

    def health_check(self):
        self.events.append("health-ready")
        return {"processState": "ready"}

    def stop(self):
        self.events.append("relay-stop")


@pytest.mark.parametrize(
    "mode, expected",
    [("left-only", ["left"]), ("right-only", ["right"]), ("dual-arm", ["left", "right"])],
)
def test_readiness_payload_supports_each_arm_mode(mode, expected):
    relay = None

    def factory(*args, **kwargs):
        nonlocal relay
        relay = RecordingRelay(*args, **kwargs)
        return relay

    runtime = start_ready_runtime(_config(mode), relay_factory=factory)
    try:
        assert runtime.readiness == {
            "mode": mode,
            "activeArms": expected,
            "operatorUrl": f"https://127.0.0.1:{runtime.config.relay_port}",
            "relayPort": runtime.config.relay_port,
        }
    finally:
        runtime.close()


def test_readiness_relay_starts_after_connect_and_pose_seed():
    events = []

    class RecordingFollower(FakeSOFollower):
        def connect(self, calibrate=True):
            events.append(f"{self.device_id}:connect")
            super().connect(calibrate)

        def get_observation(self):
            events.append(f"{self.device_id}:pose-seed")
            return super().get_observation()

    def relay_factory(*args, **kwargs):
        relay = RecordingRelay(*args, **kwargs)
        relay.events = events
        return relay

    runtime = start_ready_runtime(
        _config(),
        follower_factory=lambda spec: RecordingFollower(spec.port, spec.device_id),
        relay_factory=relay_factory,
    )
    try:
        assert events == [
            "left-id:connect",
            "right-id:connect",
            "left-id:pose-seed",
            "right-id:pose-seed",
            "relay-listen",
            "health-ready",
        ]
    finally:
        runtime.close()


def test_relay_start_failure_does_not_emit_runtime_and_cleans_followers():
    created = []

    class FailingRelay(RecordingRelay):
        def start(self):
            raise OSError("port is unavailable")

    def follower_factory(spec):
        follower = FakeSOFollower(spec.port, spec.device_id)
        created.append(follower)
        return follower

    with pytest.raises(OSError, match="port is unavailable"):
        start_ready_runtime(_config(), follower_factory=follower_factory, relay_factory=FailingRelay)

    assert [f.disconnect_count for f in created] == [1, 1]
    assert all(not follower.is_connected for follower in created)


def test_process_emits_readiness_payload_only_after_runtime_is_ready(monkeypatch, capsys):
    runtime = start_ready_runtime(_config(), relay_factory=RecordingRelay)
    monkeypatch.setattr(process, "start_ready_runtime", lambda _config: runtime)
    monkeypatch.setattr(
        process.signal,
        "pause",
        lambda: (_ for _ in ()).throw(KeyboardInterrupt),
    )

    with pytest.raises(KeyboardInterrupt):
        process.run(_config())

    line = capsys.readouterr().out.strip()
    assert line.startswith("VR_LEKIWI_READY ")
    assert '"mode": "dual-arm"' in line
    assert '"activeArms": ["left", "right"]' in line
    assert '"operatorUrl": "https://127.0.0.1:9443"' in line
    assert '"relayPort": 9443' in line
    assert runtime.relay.events[-1] == "relay-stop"


@pytest.mark.parametrize("failure", ["connect", "pose"])
def test_follower_startup_or_pose_seed_failure_cleans_all_opened_followers(failure):
    created = []

    class FailingFollower(FakeSOFollower):
        def connect(self, calibrate=True):
            super().connect(calibrate)
            if failure == "connect" and self.device_id == "right-id":
                raise RuntimeError("connect failed")

        def get_observation(self):
            if failure == "pose" and self.device_id == "right-id":
                raise RuntimeError("pose seed failed")
            return super().get_observation()

    def factory(spec):
        follower = FailingFollower(spec.port, spec.device_id)
        created.append(follower)
        return follower

    with pytest.raises(RuntimeError, match="failed"):
        start_ready_runtime(_config(), follower_factory=factory)

    assert [f.disconnect_count for f in created] == [1, 1]
    assert all(not follower.is_connected for follower in created)
