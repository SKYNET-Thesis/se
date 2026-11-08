from datetime import datetime, timedelta, timezone

import pytest

from vista_digital_twin.authorization import AuthorizationError, TwinAuthorizer


NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)


def authorizer() -> TwinAuthorizer:
    return TwinAuthorizer("test-secret", clock=lambda: NOW)


def test_signed_scope_allows_only_its_robot_and_organization():
    token = authorizer().issue_viewer(subject="user-a", organization_id="org-a", robot_ids=["so101-a"])
    scope = authorizer().verify_viewer(token, robot_id="so101-a", organization_id="org-a")
    assert scope.subject == "user-a"
    with pytest.raises(AuthorizationError):
        authorizer().verify_viewer(token, robot_id="so101-b", organization_id="org-a")
    with pytest.raises(AuthorizationError):
        authorizer().verify_viewer(token, robot_id="so101-a", organization_id="org-b")


def test_publisher_token_cannot_subscribe_and_expired_token_is_rejected():
    token = authorizer().issue_publisher(owner_id="lelab-a", organization_id="org-a", robot_id="so101-a")
    with pytest.raises(AuthorizationError):
        authorizer().verify_viewer(token, robot_id="so101-a", organization_id="org-a")
    expired = authorizer().issue_viewer(
        subject="user-a", organization_id="org-a", robot_ids=["so101-a"], expires_at=NOW - timedelta(seconds=1)
    )
    with pytest.raises(AuthorizationError):
        authorizer().verify_viewer(expired, robot_id="so101-a", organization_id="org-a")
