"""Fail-closed R1 execution contract; intentionally no browser or raw motor API."""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import json
from threading import Event, Lock, Thread
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ALLOWED_STEPS = {"arm.select", "home", "gripper.open", "gripper.close", "wait"}
TERMINAL = {"preflight_failed", "succeeded", "failed", "cancelled", "stopped"}


class ContractError(ValueError):
    """Input is not a safe R1 canonical program request."""


class CheckikAdapterError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class CheckikHttpAdapter:
    """Private checked-command client; its URL is loaded only from R1 config."""

    def __init__(self, base_url: str, token: str, timeout_s: float = 2.0):
        self.base_url, self.token, self.timeout_s = base_url.rstrip("/"), token, timeout_s

    def _request(self, path: str, payload: dict[str, Any] | None = None, timeout_s: float | None = None) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode()
        request = Request(f"{self.base_url}{path}", data=body, method="GET" if body is None else "POST", headers={
            "Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {self.token}"})
        try:
            with urlopen(request, timeout=timeout_s if timeout_s is not None else self.timeout_s) as response:
                value = json.loads(response.read())
            if not isinstance(value, dict):
                raise RuntimeError("checkik_response_invalid")
            return value
        except HTTPError as error:
            try:
                payload = json.loads(error.read())
                code = payload.get("error") if isinstance(payload, dict) else None
            except Exception:
                code = None
            raise CheckikAdapterError(code if isinstance(code, str) else "checkik_adapter_rejected") from error
        except (URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError("checkik_adapter_unavailable") from error

    def status(self) -> dict[str, Any]:
        return self._request("/status")

    def execute(self, run_id: str, step: dict[str, Any], timeout_ms: int) -> dict[str, Any]:
        return self._request("/execute", {"runId": run_id, "step": step, "timeoutMs": timeout_ms}, max(self.timeout_s, timeout_ms / 1000))

    def cancel(self, run_id: str) -> None:
        self._request("/cancel", {"runId": run_id})

    def stop(self, run_id: str | None = None) -> None:
        self._request("/stop", {"runId": run_id} if run_id else {})


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
    def __init__(self, config: dict[str, Any], checkik_adapter: Any | None = None):
        self.config = config
        self.checkik_adapter = checkik_adapter
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
        if self.checkik_adapter is not None:
            try:
                return {"reachable": True, "snapshot": self.checkik_adapter.status()}
            except Exception:
                return {"reachable": False, "reason": "checkik_unavailable"}
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
        if self.config.get("adapterMode") != "fake_follower":
            return "adapter_mode_not_supported"
        if self.checkik_adapter is None:
            return "checkik_adapter_missing"
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
        program_hash = self._hash(request["program"])
        with self._lock:
            if run_id in self._runs:
                existing = self._runs[run_id]
                if existing.program_version_id != version_id or existing.profile != profile or existing.program_hash != program_hash:
                    raise ContractError("run_identity_conflict")
                return existing.snapshot()
            if self._active:
                raise ContractError("execution_already_active")
            run = Run(run_id=run_id, program_version_id=version_id, profile=profile, program_hash=program_hash)
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
            max_run_ms = self.config["profiles"][run.profile].get("maxRunMs", 60000)
            run_deadline = time.monotonic() + max_run_ms / 1000
            for index, step in enumerate(steps):
                if run.cancel.is_set() or self._stopped:
                    run.state = "stopped" if self._stopped else "cancelled"
                    run.events.append({"index": index, "type": "execution_cancelled", "atMs": self._now()})
                    return
                if time.monotonic() >= run_deadline:
                    raise TimeoutError("whole_run_deadline")
                event = {"index": index, "type": step["type"], "atMs": self._now()}
                if "resolvedArm" in step:
                    event["arm"] = step["resolvedArm"]
                remaining_ms = max(1, round((run_deadline - time.monotonic()) * 1000))
                adapter_result = self.checkik_adapter.execute(run.run_id, step, remaining_ms)
                if not isinstance(adapter_result, dict) or adapter_result.get("ok") is not True:
                    raise RuntimeError("checkik_command_rejected")
                if run.cancel.is_set() or self._stopped:
                    run.state = "stopped" if self._stopped else "cancelled"
                    run.events.append({"index": index, "type": "execution_cancelled", "atMs": self._now()})
                    return
                if step["type"] == "wait":
                    event["durationMs"] = step["durationMs"]
                run.events.append(event)
            run.state = "succeeded"
        except (TimeoutError, CheckikAdapterError) as error:
            if isinstance(error, CheckikAdapterError) and error.code != "execution_timeout":
                if run.cancel.is_set() or self._stopped:
                    run.state = "stopped" if self._stopped else "cancelled"
                    run.events.append({"type": "execution_cancelled", "atMs": self._now()})
                    return
                run.state = "failed"
                run.error_code = "runtime_execution_failed"
                run.events.append({"type": "execution_failed", "atMs": self._now(), "code": run.error_code})
                return
            run.state = "failed"
            run.error_code = "runtime_execution_timeout"
            run.events.append({"type": "execution_failed", "atMs": self._now(), "code": run.error_code})
        except Exception:
            if run.cancel.is_set() or self._stopped:
                run.state = "stopped" if self._stopped else "cancelled"
                run.events.append({"type": "execution_cancelled", "atMs": self._now()})
            else:
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
            if self.checkik_adapter is not None:
                try:
                    self.checkik_adapter.cancel(run_id)
                except Exception:
                    pass
        return run.snapshot() if run else None

    def stop(self) -> None:
        self._stopped = True
        if self.checkik_adapter is not None:
            try:
                self.checkik_adapter.stop(self._active)
            except Exception:
                pass
        if self._active and self._active in self._runs:
            self._runs[self._active].cancel.set()
