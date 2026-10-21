"""Fail-closed R1 execution contract; intentionally no browser or raw motor API."""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
from threading import Event, Lock, Thread
import time
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen


ALLOWED_STEPS = {"arm.select", "home", "gripper.open", "gripper.close", "wait"}
TERMINAL = {"preflight_failed", "succeeded", "failed", "cancelled", "stopped"}


class ContractError(ValueError):
    """Input is not a safe R1 canonical program request."""


@dataclass
class Run:
    run_id: str
    program_version_id: str
    profile: str
    program_hash: str
    state: str = "queued"
    events: list[dict[str, Any]] = field(default_factory=list)
    error_code: str | None = None
    started_at_ms: int | None = None
    ended_at_ms: int | None = None
    cancel: Event = field(default_factory=Event, repr=False)

    def snapshot(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "programVersionId": self.program_version_id,
            "profile": self.profile,
            "programHash": self.program_hash,
            "state": self.state,
            "errorCode": self.error_code,
            "startedAtMs": self.started_at_ms,
            "endedAtMs": self.ended_at_ms,
            "events": list(self.events),
        }


class Runtime:
    def __init__(self, config: dict[str, Any]):
        self.config = config
        self._runs: dict[str, Run] = {}
        self._active: str | None = None
        self._stopped = False
        self._lock = Lock()

    @staticmethod
    def _now() -> int:
        return round(time.time() * 1000)

    @staticmethod
    def _hash(value: Any) -> str:
        return sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    def checkik_status(self) -> dict[str, Any]:
        url = self.config.get("checkikStatusUrl")
        if not isinstance(url, str) or not url:
            return {"reachable": False, "reason": "checkik_status_url_missing"}
        try:
            request = Request(url, headers={"Accept": "application/json"})
            with urlopen(request, timeout=2) as response:  # local private control plane only
                value = json.loads(response.read())
            if not isinstance(value, dict):
                return {"reachable": False, "reason": "checkik_status_invalid"}
            return {"reachable": True, "snapshot": value}
        except (URLError, TimeoutError, ValueError, json.JSONDecodeError):
            return {"reachable": False, "reason": "checkik_unavailable"}

    def status(self) -> dict[str, Any]:
        checkik = self.checkik_status()
        return {
            "name": "vista-robot-runtime",
            "version": "r1-foundation",
            "hardwareEnabled": self.config.get("hardwareEnabled") is True,
            "stopped": self._stopped,
            "activeRunId": self._active,
            "checkik": checkik,
        }

    def _validate_request(self, request: Any) -> tuple[str, str, str, list[dict[str, Any]]]:
        if not isinstance(request, dict):
            raise ContractError("request_malformed")
        run_id = request.get("runId")
        version_id = request.get("programVersionId")
        profile = request.get("profile")
        program = request.get("program")
        if not all(isinstance(value, str) and value for value in (run_id, version_id, profile)):
            raise ContractError("run_identity_invalid")
        profiles = self.config.get("profiles")
        if not isinstance(profiles, dict) or profile not in profiles:
            raise ContractError("profile_not_allowed")
        if not isinstance(program, dict) or program.get("kind") != "robot_program" or program.get("schemaVersion") != 1:
            raise ContractError("program_not_canonical_v1")
        steps = program.get("steps")
        if not isinstance(steps, list) or not steps:
            raise ContractError("program_steps_invalid")
        arm: str | None = None
        normalized: list[dict[str, Any]] = []
        for item in steps:
            if not isinstance(item, dict) or item.get("type") not in ALLOWED_STEPS:
                raise ContractError("program_step_not_allowed")
            step = dict(item)
            kind = step["type"]
            if kind == "arm.select":
                if step.get("arm") not in {"left", "right"}:
                    raise ContractError("selected_arm_invalid")
                arm = step["arm"]
            elif kind in {"home", "gripper.open", "gripper.close"}:
                explicit = step.get("arm")
                if explicit is not None and explicit not in {"left", "right"}:
                    raise ContractError("step_arm_invalid")
                resolved = explicit or arm
                if resolved not in {"left", "right"}:
                    raise ContractError("arm_context_missing")
                step["resolvedArm"] = resolved
            elif kind == "wait":
                duration = step.get("durationMs")
                max_wait = profiles[profile].get("maxWaitMs", 60000)
                if not isinstance(duration, int) or duration < 0 or duration > max_wait:
                    raise ContractError("wait_duration_invalid")
            normalized.append(step)
        return run_id, version_id, profile, normalized

    def _preflight(self, steps: list[dict[str, Any]]) -> str | None:
        if self._stopped:
            return "runtime_stopped"
        if self.config.get("hardwareEnabled") is not True:
            return "hardware_not_commissioned"
        status = self.checkik_status()
        snapshot = status.get("snapshot") if status.get("reachable") else None
        if not isinstance(snapshot, dict):
            return "checkik_unavailable"
        backend = snapshot.get("backend")
        readiness = snapshot.get("readiness")
        if not isinstance(backend, dict) or backend.get("motionEnabled") is not True or backend.get("latchedMotionLock") is True:
            return "checkik_motion_not_authorized"
        if not isinstance(readiness, dict) or readiness.get("ready") is not True:
            return "checkik_not_ready"
        arms = self.config.get("arms", {})
        for step in steps:
            arm = step.get("resolvedArm")
            if arm:
                arm_config = arms.get(arm) if isinstance(arms, dict) else None
                if not isinstance(arm_config, dict) or arm_config.get("enabled") is not True:
                    return "arm_not_commissioned"
                if step["type"] == "home" and not isinstance(arm_config.get("safeHomeJointDegrees"), list):
                    return "safe_home_missing"
                if step["type"].startswith("gripper.") and not all(isinstance(arm_config.get(key), (int, float)) for key in ("gripperOpen", "gripperClosed")):
                    return "gripper_calibration_missing"
        return None

    def submit(self, request: Any) -> dict[str, Any]:
        run_id, version_id, profile, steps = self._validate_request(request)
        with self._lock:
            if run_id in self._runs:
                return self._runs[run_id].snapshot()
            if self._active:
                raise ContractError("execution_already_active")
            run = Run(run_id=run_id, program_version_id=version_id, profile=profile, program_hash=self._hash(request["program"]))
            self._runs[run_id] = run
            reason = self._preflight(steps)
            if reason:
                run.state = "preflight_failed"
                run.error_code = reason
                run.ended_at_ms = self._now()
                run.events.append({"type": "preflight_failed", "atMs": run.ended_at_ms, "code": reason})
                return run.snapshot()
            self._active = run_id
            thread = Thread(target=self._execute, args=(run, steps), daemon=True)
            thread.start()
            return run.snapshot()

    def _execute(self, run: Run, steps: list[dict[str, Any]]) -> None:
        run.state = "running"
        run.started_at_ms = self._now()
        try:
            # Deliberate hardware boundary: the future checked CHECKIK adapter is
            # the sole place where home/gripper calls will be implemented.
            for index, step in enumerate(steps):
                if run.cancel.is_set() or self._stopped:
                    run.state = "stopped" if self._stopped else "cancelled"
                    run.events.append({"index": index, "type": "execution_cancelled", "atMs": self._now()})
                    return
                event = {"index": index, "type": step["type"], "atMs": self._now()}
                if "resolvedArm" in step:
                    event["arm"] = step["resolvedArm"]
                if step["type"] == "wait":
                    deadline = time.monotonic() + step["durationMs"] / 1000
                    while time.monotonic() < deadline:
                        if run.cancel.is_set() or self._stopped:
                            run.state = "stopped" if self._stopped else "cancelled"
                            run.events.append({"index": index, "type": "wait_cancelled", "atMs": self._now()})
                            return
                        time.sleep(min(0.05, max(0, deadline - time.monotonic())))
                    event["durationMs"] = step["durationMs"]
                else:
                    # Never fall through to a best-effort servo command. This
                    # guard stays until commissioning installs the checked adapter.
                    raise RuntimeError("hardware_adapter_not_installed")
                run.events.append(event)
            run.state = "succeeded"
        except Exception:
            run.state = "failed"
            run.error_code = "runtime_execution_failed"
            run.events.append({"type": "execution_failed", "atMs": self._now(), "code": run.error_code})
        finally:
            run.ended_at_ms = self._now()
            with self._lock:
                if self._active == run.run_id:
                    self._active = None

    def get(self, run_id: str) -> dict[str, Any] | None:
        run = self._runs.get(run_id)
        return run.snapshot() if run else None

    def cancel_run(self, run_id: str) -> dict[str, Any] | None:
        run = self._runs.get(run_id)
        if run and run.state not in TERMINAL:
            run.cancel.set()
        return run.snapshot() if run else None

    def stop(self) -> None:
        self._stopped = True
        if self._active and self._active in self._runs:
            self._runs[self._active].cancel.set()
