import pytest

from vista_digital_twin.app import create_app_from_environment


def test_partial_physical_configuration_fails_closed(monkeypatch):
    monkeypatch.setenv("VISTA_TWIN_PHYSICAL_OWNER_ID", "lelab-a")
    with pytest.raises(RuntimeError, match="physical telemetry configuration is incomplete"):
        create_app_from_environment()


def test_complete_physical_configuration_creates_no_hardware_connection(monkeypatch):
    monkeypatch.setenv("VISTA_TWIN_PHYSICAL_OWNER_ID", "lelab-a")
    monkeypatch.setenv("VISTA_TWIN_PHYSICAL_ORGANIZATION_ID", "org-a")
    monkeypatch.setenv("VISTA_TWIN_PHYSICAL_ROBOT_ID", "so101-a")
    monkeypatch.setenv("VISTA_TWIN_AUTH_SECRET", "test-secret")
    app = create_app_from_environment()
    assert any(route.path == "/internal/physical-telemetry" for route in app.routes)
