from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path


class DeviceOwnershipConflict(RuntimeError):
    pass


class DeviceOwner:
    """Advisory inter-process lock shared by supported hardware launch paths.

    ``flock`` is released by the kernel if the process crashes. Every supported
    serial owner must claim this lock before opening a device.
    """

    def __init__(self, lock_root: Path, device_id: str, purpose: str):
        self.lock_root, self.device_id, self.purpose = lock_root, device_id, purpose
        digest = hashlib.sha256(device_id.encode()).hexdigest()
        self.path = lock_root / f"{digest}.lock"
        self._file = None

    def acquire(self) -> "DeviceOwner":
        self.lock_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            os.chmod(self.lock_root, 0o700)
        except OSError:
            pass
        self._file = self.path.open("a+", encoding="utf-8")
        try:
            fcntl.flock(self._file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            self._file.close()
            self._file = None
            raise DeviceOwnershipConflict(f"device {self.device_id} is owned by another supported process") from exc
        self._file.seek(0)
        self._file.truncate()
        self._file.write(json.dumps({"pid": os.getpid(), "device_id": self.device_id, "purpose": self.purpose}))
        self._file.flush()
        try:
            os.fchmod(self._file.fileno(), 0o600)
        except OSError:
            pass
        return self

    def release(self) -> None:
        if self._file is not None:
            try:
                fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
            self._file.close()
            self._file = None

    def __enter__(self) -> "DeviceOwner":
        return self.acquire()

    def __exit__(self, *_args) -> None:
        self.release()

    @classmethod
    def check_ownership(cls, lock_root: Path | None, device_id: str) -> tuple[bool, dict | None]:
        """Check whether `device_id` is currently locked by any process without altering lock state."""
        if lock_root is None:
            return False, None
        digest = hashlib.sha256(device_id.encode()).hexdigest()
        path = lock_root / f"{digest}.lock"
        if not path.is_file():
            return False, None
        try:
            f = path.open("r+", encoding="utf-8")
        except OSError:
            return False, None
        try:
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                # Not locked
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                return False, None
            except BlockingIOError:
                # Locked by another process
                try:
                    f.seek(0)
                    info = json.loads(f.read().strip())
                    return True, info
                except Exception:
                    return True, {"device_id": device_id, "locked": True}
        finally:
            f.close()
