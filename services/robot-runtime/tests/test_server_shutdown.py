import json
import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen


SERVER = Path(__file__).resolve().parents[1] / "src" / "server.py"


def test_sigterm_releases_loopback_runtime_server(tmp_path):
    with socket.socket() as candidate:
        candidate.bind(("127.0.0.1", 0))
        port = candidate.getsockname()[1]
    config = tmp_path / "runtime.json"
    config.write_text(json.dumps({"bindHost": "127.0.0.1", "port": port, "hardwareEnabled": False}))
    environment = {**os.environ, "VISTA_RUNTIME_TOKEN": "local-shutdown-test"}
    process = subprocess.Popen(
        [sys.executable, str(SERVER), "--config", str(config)],
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    try:
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise AssertionError(f"runtime server exited during startup: {process.stderr.read().decode()}")
            try:
                with urlopen(f"http://127.0.0.1:{port}/health", timeout=0.2) as response:
                    assert response.status == 200
                break
            except OSError:
                time.sleep(0.05)
        else:
            raise AssertionError("runtime server did not become ready")

        process.send_signal(signal.SIGTERM)
        assert process.wait(timeout=2) == 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=2)
