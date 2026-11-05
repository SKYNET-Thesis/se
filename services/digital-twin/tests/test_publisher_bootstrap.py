import os
import stat
from datetime import datetime, timezone

import pytest

from vista_digital_twin.authorization import AuthorizationError, TwinAuthorizer
from vista_digital_twin.publisher_bootstrap import MAX_TTL_SECONDS, issue_publisher_scope_file


NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)


def test_local_bootstrap_writes_a_restricted_valid_publisher_scope(tmp_path):
    output = tmp_path / "publisher.scope"
    expires_at = issue_publisher_scope_file(
        secret="test-secret", owner_id="lelab-a", organization_id="org-a", robot_id="so101-a",
        ttl_seconds=600, output=output, now=NOW,
    )
    token = output.read_text().strip()
    scope = TwinAuthorizer("test-secret", clock=lambda: NOW).verify_publisher(
        token, owner_id="lelab-a", organization_id="org-a", robot_id="so101-a"
    )
    assert stat.S_IMODE(output.stat().st_mode) == 0o600
    assert scope.kind == "publisher"
    assert scope.token_id
    assert expires_at == scope.expires_at


def test_local_bootstrap_rejects_missing_secret_and_ttl_over_maximum(tmp_path):
    output = tmp_path / "publisher.scope"
    with pytest.raises(ValueError, match="signing secret"):
        issue_publisher_scope_file(
            secret=None, owner_id="lelab-a", organization_id="org-a", robot_id="so101-a",
            ttl_seconds=600, output=output, now=NOW,
        )
    with pytest.raises(ValueError, match="TTL"):
        issue_publisher_scope_file(
            secret="test-secret", owner_id="lelab-a", organization_id="org-a", robot_id="so101-a",
            ttl_seconds=MAX_TTL_SECONDS + 1, output=output, now=NOW,
        )


def test_bootstrapped_scope_fails_closed_for_wrong_claims_expiry_and_signature(tmp_path):
    output = tmp_path / "publisher.scope"
    issue_publisher_scope_file(
        secret="test-secret", owner_id="lelab-a", organization_id="org-a", robot_id="so101-a",
        ttl_seconds=60, output=output, now=NOW,
    )
    token = output.read_text().strip()
    verifier = TwinAuthorizer("test-secret", clock=lambda: NOW)
    for owner_id, organization_id, robot_id in (("wrong-owner", "org-a", "so101-a"), ("lelab-a", "wrong-org", "so101-a"), ("lelab-a", "org-a", "wrong-robot")):
        with pytest.raises(AuthorizationError):
            verifier.verify_publisher(token, owner_id=owner_id, organization_id=organization_id, robot_id=robot_id)
    with pytest.raises(AuthorizationError):
        verifier.verify_viewer(token, robot_id="so101-a", organization_id="org-a")
    with pytest.raises(AuthorizationError):
        TwinAuthorizer("wrong-secret", clock=lambda: NOW).verify_publisher(
            token, owner_id="lelab-a", organization_id="org-a", robot_id="so101-a"
        )
    with pytest.raises(AuthorizationError):
        TwinAuthorizer("test-secret", clock=lambda: NOW.replace(minute=2)).verify_publisher(
            token, owner_id="lelab-a", organization_id="org-a", robot_id="so101-a"
        )


def test_bootstrap_never_writes_the_scope_to_standard_output(tmp_path, capsys, monkeypatch):
    from vista_digital_twin.publisher_bootstrap import main

    monkeypatch.setenv("VISTA_TWIN_AUTH_SECRET", "test-secret")
    output = tmp_path / "publisher.scope"
    assert main([
        "--owner-id", "lelab-a", "--organization-id", "org-a", "--robot-id", "so101-a",
        "--output", str(output),
    ]) == 0
    captured = capsys.readouterr()
    assert output.read_text().strip() not in captured.out + captured.err
