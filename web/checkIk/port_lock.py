"""Cross-process exclusive ownership of one serial device (advisory flock).

CHECKIK, LeLab, lerobot CLIs and the VISTA real-follower adapter can all open the same /dev/ttyACM*. This helper gives the
adapter a single owner: the first process holds an exclusive non-blocking flock on a per-port lock file for as long as it
owns the arm; every cooperating process refuses to start when the lock is held. It never opens the serial device itself.
"""
from __future__ import annotations

import fcntl
import os
import re
from pathlib import Path


class PortBusy(RuntimeError):
    pass


class PortLease:
    def __init__(self, port: str, lock_dir: str | os.PathLike[str] | None = None) -> None:
        if not port or "\0" in port:
            raise ValueError("serial port identity is required")
        directory = Path(lock_dir or os.environ.get("CHECKIK_PORT_LOCK_DIR") or "/tmp/checkik-port-locks")
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", port.strip("/"))
        self.path = directory / f"{name}.lock"
        self.port = port
        self._fd: int | None = None

    def acquire(self) -> "PortLease":
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(fd)
            raise PortBusy(f"serial port {self.port} is owned by another process") from None
        os.ftruncate(fd, 0)
        os.write(fd, f"{os.getpid()}\n".encode())
        self._fd = fd
        return self

    def release(self) -> None:
        if self._fd is not None:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
            finally:
                os.close(self._fd)
                self._fd = None

    @property
    def held(self) -> bool:
        return self._fd is not None

    def __enter__(self) -> "PortLease":
        return self.acquire()

    def __exit__(self, *_exc: object) -> None:
        self.release()
