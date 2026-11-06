from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Literal


class SessionError(ValueError): pass


@dataclass(frozen=True)
class OperatorSession:
    robot_id: str
    device_id: str
    device_role: Literal["LEADER", "FOLLOWER"]
    expires_at: int
    jti: str


class OperatorSessionIssuer:
    """HMAC-signed short-lived operator credential; no browser gets the signing key."""
    def __init__(self, secret: bytes):
        if len(secret) < 32: raise ValueError("operator session secret must be at least 32 bytes")
        self.secret = secret
    @staticmethod
    def _encode(value: bytes) -> str: return base64.urlsafe_b64encode(value).rstrip(b"=").decode()
    @staticmethod
    def _decode(value: str) -> bytes: return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    def issue(self, *, robot_id: str, device_id: str, device_role: Literal["LEADER", "FOLLOWER"], ttl_seconds: int = 600) -> str:
        if not 1 <= ttl_seconds <= 900: raise ValueError("operator session TTL must be between 1 and 900 seconds")
        payload = {"aud": "vista-local-hardware-adapter", "robot_id": robot_id, "device_id": device_id,
                   "device_role": device_role, "exp": int(time.time()) + ttl_seconds, "jti": secrets.token_urlsafe(16)}
        encoded = self._encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
        signature = self._encode(hmac.new(self.secret, encoded.encode(), hashlib.sha256).digest())
        return f"{encoded}.{signature}"
    def verify(self, token: str) -> OperatorSession:
        try: encoded, supplied = token.split(".", 1)
        except ValueError as exc: raise SessionError("malformed operator session") from exc
        expected = self._encode(hmac.new(self.secret, encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, supplied): raise SessionError("invalid operator session signature")
        try: payload = json.loads(self._decode(encoded))
        except Exception as exc: raise SessionError("malformed operator session payload") from exc
        if payload.get("aud") != "vista-local-hardware-adapter" or payload.get("exp", 0) <= time.time(): raise SessionError("operator session expired or has wrong audience")
        if payload.get("device_role") not in {"LEADER", "FOLLOWER"}: raise SessionError("invalid device role")
        return OperatorSession(payload["robot_id"], payload["device_id"], payload["device_role"], payload["exp"], payload["jti"])
