import json
import time
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from robot_hardware_adapter.app import AdapterService, create_app
from robot_hardware_adapter.auth import OperatorSessionIssuer
from robot_hardware_adapter.ownership import DeviceOwner
from robot_hardware_adapter.ports import PortInfo


class MockEnumerator:
    def __init__(self, ports=None):
        self._ports = ports or [PortInfo("/dev/ttyACM9", serial_number="leader-usb")]

    def list(self):
        return list(self._ports)

    def set_ports(self, ports):
        self._ports = list(ports)


class MockCalibrationGateway:
    def __init__(self):
        self.started = []
        self.cancelled = False
        self.completed = False
        self._status = {
            "status": "recording",
            "recorded_ranges": {
                "shoulder_pan": {"min": 500.0, "max": 1500.0, "current": 1000.0},
                "shoulder_lift": {"min": 600.0, "max": 1800.0, "current": 1200.0},
                "elbow_flex": {"min": 700.0, "max": 2100.0, "current": 1400.0},
                "wrist_flex": {"min": 800.0, "max": 2400.0, "current": 1600.0},
                "wrist_roll": {"min": 900.0, "max": 2700.0, "current": 1800.0},
                "gripper": {"min": 1000.0, "max": 2000.0, "current": 1500.0},
            },
        }

    def start(self, *, role, port, profile_id):
        self.started.append((role, port, profile_id))
        return self.status()

    def status(self):
        return dict(self._status)

    def complete(self):
        self.completed = True

    def cancel(self):
        self.cancelled = True


@pytest.fixture
def anyio_backend():
    return "asyncio"


def setup_service(tmp_path: Path):
    issuer = OperatorSessionIssuer(b"test-secret-material-with-at-least-32-bytes")
    calibration = MockCalibrationGateway()
    enumerator = MockEnumerator([PortInfo("/dev/ttyACM9", serial_number="leader-usb")])
    lock_root = tmp_path / "locks"
    leader_cal_dir = tmp_path / "leader_cal"
    follower_cal_dir = tmp_path / "follower_cal"
    leader_cal_dir.mkdir(parents=True, exist_ok=True)
    follower_cal_dir.mkdir(parents=True, exist_ok=True)

    service = AdapterService(
        issuer=issuer,
        port_enumerator=enumerator,
        calibration_factory=lambda: calibration,
        lock_root=lock_root,
        leader_calibration_dir=leader_cal_dir,
        follower_calibration_dir=follower_cal_dir,
    )
    return service, issuer, calibration, enumerator, lock_root, leader_cal_dir, follower_cal_dir


def headers(token, origin="http://localhost:5173"):
    return {"Authorization": f"Bearer {token}", "Origin": origin}


@pytest.mark.anyio
async def test_api_origin_validation_and_session_binding(tmp_path):
    service, issuer, _, _, _, _, _ = setup_service(tmp_path)
    client = AsyncClient(transport=ASGITransport(app=create_app(service)), base_url="http://test")
    token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=60)

    # Reject disallowed origins
    resp = await client.get("/v1/ports", headers=headers(token, "https://malicious.origin"))
    assert resp.status_code == 403

    # Reject wrong device ID
    resp = await client.post(
        "/v1/detection",
        headers=headers(token),
        json={"device_id": "other-device", "device_role": "LEADER"},
    )
    assert resp.status_code == 403

    # Reject wrong device role
    resp = await client.post(
        "/v1/detection",
        headers=headers(token),
        json={"device_id": "leader-1", "device_role": "FOLLOWER"},
    )
    assert resp.status_code == 403

    # Reject expired session token
    expired_token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=1)
    time.sleep(1.1)
    resp = await client.get("/v1/ports", headers=headers(expired_token))
    assert resp.status_code == 401

    # Reject forged token
    resp = await client.get("/v1/ports", headers=headers("invalid.token.signature"))
    assert resp.status_code == 401

    await client.aclose()


@pytest.mark.anyio
async def test_port_detection_api_lifecycle(tmp_path):
    service, issuer, _, enumerator, _, _, _ = setup_service(tmp_path)
    client = AsyncClient(transport=ASGITransport(app=create_app(service)), base_url="http://test")
    token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=60)

    # 1. Start detection
    start_resp = await client.post(
        "/v1/detection",
        headers=headers(token),
        json={"device_id": "leader-1", "device_role": "LEADER"},
    )
    assert start_resp.status_code == 200
    session_id = start_resp.json()["id"]

    # 2. Simulate unplug
    enumerator.set_ports([])
    unplug_resp = await client.post(f"/v1/detection/{session_id}/unplug", headers=headers(token))
    assert unplug_resp.status_code == 200
    assert unplug_resp.json()["phase"] == "RECONNECT"

    # 3. Simulate reconnect
    enumerator.set_ports([PortInfo("/dev/ttyACM9", serial_number="leader-usb")])
    reconnect_resp = await client.post(f"/v1/detection/{session_id}/reconnect", headers=headers(token))
    assert reconnect_resp.status_code == 200
    assert reconnect_resp.json()["phase"] == "CONFIRM"
    assert reconnect_resp.json()["candidate"]["device"] == "/dev/ttyACM9"

    # 4. Confirm port
    confirm_resp = await client.post(f"/v1/detection/{session_id}/confirm", headers=headers(token))
    assert confirm_resp.status_code == 200
    assert service.confirmed_ports["leader-1"].device == "/dev/ttyACM9"

    await client.aclose()


@pytest.mark.anyio
async def test_port_detection_cancel(tmp_path):
    service, issuer, _, _, _, _, _ = setup_service(tmp_path)
    client = AsyncClient(transport=ASGITransport(app=create_app(service)), base_url="http://test")
    token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=60)

    start_resp = await client.post(
        "/v1/detection",
        headers=headers(token),
        json={"device_id": "leader-1", "device_role": "LEADER"},
    )
    session_id = start_resp.json()["id"]

    cancel_resp = await client.post(f"/v1/detection/{session_id}/cancel", headers=headers(token))
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["phase"] == "CANCELLED"

    await client.aclose()


@pytest.mark.anyio
async def test_port_conflicts_prevent_simultaneous_calibration(tmp_path):
    service, issuer, _, _, lock_root, _, _ = setup_service(tmp_path)
    client = AsyncClient(transport=ASGITransport(app=create_app(service)), base_url="http://test")
    token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=60)
    service.confirmed_ports["leader-1"] = PortInfo("/dev/ttyACM9")

    # Another process acquires ownership on /dev/ttyACM9
    with DeviceOwner(lock_root, "/dev/ttyACM9", "teleoperation"):
        # Port list reports locked
        ports_resp = await client.get("/v1/ports", headers=headers(token))
        assert ports_resp.status_code == 200
        port_item = next(p for p in ports_resp.json()["items"] if p["device"] == "/dev/ttyACM9")
        assert port_item["locked"] is True
        assert port_item["locked_by"]["purpose"] == "teleoperation"

        # Starting calibration fails with 409 conflict
        calib_resp = await client.post(
            "/v1/calibrations",
            headers=headers(token),
            json={"robot_id": "robot-a", "device_id": "leader-1", "device_role": "LEADER", "profile_id": "new_profile"},
        )
        assert calib_resp.status_code == 409
        assert "owned by another" in calib_resp.json()["detail"]

    # After lock is released, calibration can start
    calib_resp2 = await client.post(
        "/v1/calibrations",
        headers=headers(token),
        json={"robot_id": "robot-a", "device_id": "leader-1", "device_role": "LEADER", "profile_id": "new_profile"},
    )
    assert calib_resp2.status_code == 200

    await client.aclose()


@pytest.mark.anyio
async def test_silent_overwrite_protection(tmp_path):
    service, issuer, _, _, _, leader_cal_dir, _ = setup_service(tmp_path)
    client = AsyncClient(transport=ASGITransport(app=create_app(service)), base_url="http://test")
    token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=60)
    service.confirmed_ports["leader-1"] = PortInfo("/dev/ttyACM9")

    # Create an existing profile file
    existing_profile = leader_cal_dir / "existing_arm.json"
    existing_profile.write_text(json.dumps({"shoulder_pan": {"range_min": 600, "range_max": 3000}}))

    # Inspect endpoint sees the profile
    profiles_resp = await client.get("/v1/profiles", headers=headers(token))
    assert "existing_arm" in profiles_resp.json()["leader"]

    inspect_resp = await client.get("/v1/profiles/LEADER/existing_arm", headers=headers(token))
    assert inspect_resp.status_code == 200
    assert "shoulder_pan" in inspect_resp.json()["data"]

    # Starting calibration without overwrite=True is rejected with 409
    resp_reject = await client.post(
        "/v1/calibrations",
        headers=headers(token),
        json={"robot_id": "robot-a", "device_id": "leader-1", "device_role": "LEADER", "profile_id": "existing_arm"},
    )
    assert resp_reject.status_code == 409
    assert "already exists" in resp_reject.json()["detail"]

    # Starting calibration with overwrite=True succeeds
    resp_ok = await client.post(
        "/v1/calibrations",
        headers=headers(token),
        json={
            "robot_id": "robot-a",
            "device_id": "leader-1",
            "device_role": "LEADER",
            "profile_id": "existing_arm",
            "overwrite": True,
        },
    )
    assert resp_ok.status_code == 200

    await client.aclose()


@pytest.mark.anyio
async def test_calibration_lifecycle_progress_review_save_and_cancellation(tmp_path):
    service, issuer, calibration, _, _, _, _ = setup_service(tmp_path)
    client = AsyncClient(transport=ASGITransport(app=create_app(service)), base_url="http://test")
    token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=60)
    service.confirmed_ports["leader-1"] = PortInfo("/dev/ttyACM9")

    # Start calibration
    start_resp = await client.post(
        "/v1/calibrations",
        headers=headers(token),
        json={"robot_id": "robot-a", "device_id": "leader-1", "device_role": "LEADER", "profile_id": "demo_calib"},
    )
    assert start_resp.status_code == 200

    # Poll status: structured 6-joint progress events
    poll_resp = await client.get("/v1/calibrations/current", headers=headers(token))
    assert poll_resp.status_code == 200
    data = poll_resp.json()
    assert data["active"] is True
    assert len(data["events"]) == 6
    assert "shoulder_pan" in data["progress_by_joint"]
    pan_event = data["progress_by_joint"]["shoulder_pan"]
    assert pan_event["observed_min"] == 500.0
    assert pan_event["observed_max"] == 1500.0
    assert pan_event["status"] == "RECORDING"

    # Cannot save directly without reviewing
    save_unreviewed = await client.post("/v1/calibrations/current/save", headers=headers(token), json={"confirm": True})
    assert save_unreviewed.status_code == 409
    assert "review calibration" in save_unreviewed.json()["detail"]

    # Review step
    review_resp = await client.post("/v1/calibrations/current/review", headers=headers(token))
    assert review_resp.status_code == 200
    assert review_resp.json()["save_requires_confirmation"] is True

    # Save requires explicit confirm: True
    save_invalid = await client.post("/v1/calibrations/current/save", headers=headers(token), json={"confirm": False})
    assert save_invalid.status_code == 422

    # Save with confirm: True succeeds
    save_ok = await client.post("/v1/calibrations/current/save", headers=headers(token), json={"confirm": True})
    assert save_ok.status_code == 200
    assert save_ok.json()["saved"] is True
    assert calibration.completed is True

    # Active session is cleared
    after_save = await client.get("/v1/calibrations/current", headers=headers(token))
    assert after_save.json()["active"] is False

    await client.aclose()


@pytest.mark.anyio
async def test_calibration_cancellation_releases_lock(tmp_path):
    service, issuer, calibration, _, lock_root, _, _ = setup_service(tmp_path)
    client = AsyncClient(transport=ASGITransport(app=create_app(service)), base_url="http://test")
    token = issuer.issue(robot_id="robot-a", device_id="leader-1", device_role="LEADER", ttl_seconds=60)
    service.confirmed_ports["leader-1"] = PortInfo("/dev/ttyACM9")

    await client.post(
        "/v1/calibrations",
        headers=headers(token),
        json={"robot_id": "robot-a", "device_id": "leader-1", "device_role": "LEADER", "profile_id": "to_cancel"},
    )
    # Lock is held during calibration
    locked, _ = DeviceOwner.check_ownership(lock_root, "/dev/ttyACM9")
    assert locked is True

    # Cancel calibration
    cancel_resp = await client.post("/v1/calibrations/current/cancel", headers=headers(token))
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["cancelled"] is True
    assert calibration.cancelled is True

    # Lock is released
    locked_after, _ = DeviceOwner.check_ownership(lock_root, "/dev/ttyACM9")
    assert locked_after is False

    await client.aclose()
