"""Fail-closed signed scopes for Digital Twin publishers and viewers."""

import base64
import hashlib
import hmac
import json
from uuid import uuid4
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal


class AuthorizationError(ValueError):
    pass


@dataclass(frozen=True)
class TwinScope:
    kind: Literal["viewer", "publisher", "simulation_publisher"]
    subject: str
    organization_id: str
    robot_ids: tuple[str, ...]
    expires_at: datetime
    audience: str
    token_id: str
    attempt_id: str | None = None
    assignment_id: str | None = None
    classroom_id: str | None = None


class TwinAuthorizer:
    """HMAC scope verifier; token issuance belongs to VISTA's authenticated gateway."""

    def __init__(self, secret: str | None, *, clock: Callable[[], datetime] | None = None):
        self._secret = secret.encode() if secret else None
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def _b64(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

    @staticmethod
    def _unb64(value: str) -> bytes:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

    def _issue(self, payload: dict[str, object]) -> str:
        if self._secret is None:
            raise AuthorizationError("twin authorization is not configured")
        encoded = self._b64(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode())
        signature = self._b64(hmac.new(self._secret, encoded.encode(), hashlib.sha256).digest())
        return f"v1.{encoded}.{signature}"

    def issue_viewer(self, *, subject: str, organization_id: str, robot_ids: list[str], expires_at: datetime | None = None,
                     attempt_id: str | None = None, assignment_id: str | None = None, classroom_id: str | None = None) -> str:
        extra = {k: v for k, v in (("attempt_id", attempt_id), ("assignment_id", assignment_id), ("classroom_id", classroom_id)) if v}
        return self._issue({**extra, "aud": "vista-digital-twin-viewer", "jti": str(uuid4()), "kind": "viewer", "sub": subject, "org": organization_id, "robots": robot_ids, "exp": int((expires_at or self._clock() + timedelta(minutes=5)).timestamp())})

    def issue_publisher(self, *, owner_id: str, organization_id: str, robot_id: str, expires_at: datetime | None = None) -> str:
        return self._issue({"aud": "vista-digital-twin-publisher", "jti": str(uuid4()), "kind": "publisher", "sub": owner_id, "org": organization_id, "robots": [robot_id], "exp": int((expires_at or self._clock() + timedelta(minutes=5)).timestamp())})

    def issue_simulation_publisher(self, *, subject: str, organization_id: str, robot_id: str, expires_at: datetime | None = None) -> str:
        return self._issue({"aud": "vista-digital-twin-simulation-publisher", "jti": str(uuid4()), "kind": "simulation_publisher", "sub": subject, "org": organization_id, "robots": [robot_id], "exp": int((expires_at or self._clock() + timedelta(minutes=1)).timestamp())})

    def _scope(self, token: str) -> TwinScope:
        if self._secret is None:
            raise AuthorizationError("twin authorization is not configured")
        try:
            version, encoded, supplied = token.split(".")
            expected = self._b64(hmac.new(self._secret, encoded.encode(), hashlib.sha256).digest())
            raw = json.loads(self._unb64(encoded))
            if version != "v1" or not hmac.compare_digest(supplied, expected) or not isinstance(raw, dict):
                raise AuthorizationError("invalid twin token")
            kind, subject, organization, robots, exp, audience, token_id = raw.get("kind"), raw.get("sub"), raw.get("org"), raw.get("robots"), raw.get("exp"), raw.get("aud"), raw.get("jti")
            if kind not in {"viewer", "publisher", "simulation_publisher"} or not all(isinstance(value, str) and value for value in (subject, organization, audience, token_id)) or not isinstance(robots, list) or not robots or not all(isinstance(robot, str) and robot for robot in robots) or not isinstance(exp, int):
                raise AuthorizationError("invalid twin token claims")
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
            if expires_at <= self._clock():
                raise AuthorizationError("twin token expired")
            optional = {key: raw.get(key) for key in ("attempt_id", "assignment_id", "classroom_id")}
            if any(value is not None and not (isinstance(value, str) and value) for value in optional.values()):
                raise AuthorizationError("invalid twin token claims")
            return TwinScope(kind=kind, subject=subject, organization_id=organization, robot_ids=tuple(robots), expires_at=expires_at, audience=audience, token_id=token_id, **optional)
        except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as error:
            if isinstance(error, AuthorizationError):
                raise
            raise AuthorizationError("invalid twin token") from error

    def verify_viewer(self, token: str, *, robot_id: str, organization_id: str) -> TwinScope:
        scope = self._scope(token)
        if scope.kind != "viewer" or scope.audience != "vista-digital-twin-viewer" or scope.organization_id != organization_id or robot_id not in scope.robot_ids:
            raise AuthorizationError("viewer scope denied")
        return scope

    def presented_attempt_viewer(self, token: str) -> TwinScope | None:
        """A valid, unexpired attempt-bound viewer scope, or None. Lets the Twin hold the viewer for its own run before the first frame."""
        try:
            scope = self._scope(token)
        except AuthorizationError:
            return None
        if scope.kind != "viewer" or scope.audience != "vista-digital-twin-viewer" or not scope.attempt_id:
            return None
        return scope

    def verify_publisher(self, token: str, *, owner_id: str, robot_id: str, organization_id: str) -> TwinScope:
        scope = self._scope(token)
        if scope.kind != "publisher" or scope.audience != "vista-digital-twin-publisher" or scope.subject != owner_id or scope.organization_id != organization_id or robot_id not in scope.robot_ids:
            raise AuthorizationError("publisher scope denied")
        return scope

    def verify_simulation_publisher(self, token: str, *, robot_id: str, organization_id: str) -> TwinScope:
        scope = self._scope(token)
        if scope.kind != "simulation_publisher" or scope.audience != "vista-digital-twin-simulation-publisher" or scope.organization_id != organization_id or robot_id not in scope.robot_ids:
            raise AuthorizationError("simulation publisher scope denied")
        return scope
