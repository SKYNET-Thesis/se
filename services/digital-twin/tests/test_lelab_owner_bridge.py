from datetime import datetime, timezone

from vista_digital_twin.lelab_owner_bridge import LeLabOwnerPublisher


def test_owner_bridge_forwards_existing_observation_without_robot_api(monkeypatch):
    sent = {}
    class Response:
        status = 202
        def __enter__(self): return self
        def __exit__(self, *_): return None
    def fake_urlopen(request, timeout):
        sent["url"], sent["body"], sent["auth"], sent["timeout"] = request.full_url, request.data, request.get_header("Authorization"), timeout
        return Response()
    monkeypatch.setattr("vista_digital_twin.lelab_owner_bridge.urlopen", fake_urlopen)
    publisher = LeLabOwnerPublisher(endpoint="http://127.0.0.1:8767", token="publisher-token", owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")
    assert not hasattr(publisher, "connect")
    assert not hasattr(publisher, "send_action")
    publisher.publish_observation({"shoulder_pan.pos": 1}, measured_at=datetime(2026, 11, 5, tzinfo=timezone.utc))
    assert sent["url"].endswith("/internal/physical-telemetry")
    assert b'"shoulder_pan.pos": 1' in sent["body"]
    assert sent["auth"] == "Bearer publisher-token"
