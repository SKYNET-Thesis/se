"""AWS IoT Core transport; MQTT only carries authorised high-level jobs."""
from __future__ import annotations
import json
import logging
import ssl
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable

LOG = logging.getLogger(__name__)

@dataclass(frozen=True)
class TlsSettings:
    endpoint: str
    thing_name: str
    ca_path: str
    certificate_path: str
    private_key_path: str

class IotBridge:
    """Rejects unsafe envelopes before delegating only run jobs to Runtime."""
    def __init__(self, config: dict[str, Any], runtime: Any, *, clock: Callable[[], int] | None = None):
        self.config, self.runtime = config, runtime
        self.clock = clock or (lambda: round(time.time() * 1000))
        self.topic_prefix, self.thing_name = str(config["topicPrefix"]).rstrip("/"), str(config["thingName"])
        # The envelope identity is the robot id the Education API uses (the database robot UUID, also the topic segment); the Thing name only names the
        # MQTT client and the shadow. Without `robotId` the Thing name is used, as before.
        self.robot_id = str(config.get("robotId") or config["thingName"])
        self.last_sequence, self.acks, self._publications, self._client, self.connected = -1, [], [], None, False
        self._shadow_publications: list[tuple[str, dict[str, Any]]] = []
        self._seen_commands: dict[str, tuple[str, str | None]] = {}
        self._max_seen_commands = max(1, int(config.get("commandDedupLimit", 1024)))
        self._retry_seconds = 1
        self._reported: set[tuple[str, str]] = set()
        self._lock = threading.Lock()
        self._watchers: list[threading.Thread] = []
        self._closing = threading.Event()
        # Idle Device Shadow heartbeat: the Education API refuses a start when the Shadow is older than its freshness limit, so an idle edge keeps reporting.
        self._heartbeat_seconds = min(10.0, max(1.0, float(config.get("heartbeatSeconds", 5))))
        self._heartbeat_timer: threading.Timer | None = None
        # Command-correlated simulation telemetry (status "telemetry"): per-command last sequence, count and last publish time.
        self._telemetry_sequence: dict[str, int] = {}
        self._telemetry_count: dict[str, int] = {}
        self._telemetry_last_s: dict[str, float] = {}
    def _publish(self, suffix: str, value: dict[str, Any]) -> None:
        topic = f"{self.topic_prefix}/{suffix}"; self._publications.append((topic, value))
        if self._client is not None and self.connected: self._client.publish(topic, json.dumps(value, separators=(",", ":")), qos=1)
    def shadow_topic(self, operation: str = "update") -> str:
        return f"$aws/things/{self.thing_name}/shadow/{operation}"
    def _runtime_kind(self) -> str:
        """What this edge runtime is. R1 only drives the checked fake follower today, so it can never report PHYSICAL_ROBOT."""
        runtime_config = getattr(self.runtime, "config", None)
        adapter = runtime_config.get("adapterMode") if isinstance(runtime_config, dict) else None
        return "MOCK_RUNTIME" if self.config.get("fakeRobot") is True or adapter == "fake_follower" else "UNVERIFIED_RUNTIME"
    def _report_shadow(self, status: dict[str, Any]) -> None:
        """Device Shadow `reported` state: last-known edge state for the console and the API. No secrets, no joint data, no commands."""
        kind = self._runtime_kind()
        runtime_config = getattr(self.runtime, "config", None)
        adapter = runtime_config.get("adapterMode") if isinstance(runtime_config, dict) else None
        # R1 drives only the checked fake follower: there is no physical hardware, so the Shadow must say so even though the runtime's own
        # `hardwareEnabled` config switch is on (it enables the simulated follower). Readiness fields are reported honestly: nothing is armed or calibrated.
        reported = {"schemaVersion": 1, "connection": "connected" if self.connected else "disconnected", "runtimeKind": kind,
                    "hardwareEnabled": False if kind != "PHYSICAL_ROBOT" else status.get("hardwareEnabled") is True, "stopped": status.get("stopped") is True,
                    "activeRunId": status.get("activeRunId") if isinstance(status.get("activeRunId"), str) else None,
                    "lastCommandSequence": max(0, self.last_sequence), "adapterMode": adapter if isinstance(adapter, str) and adapter else "unknown",
                    "armed": False, "calibrationReady": False, "fault": None, "reportedAtMs": self.clock()}
        topic, payload = self.shadow_topic(), {"state": {"reported": reported}}
        self._shadow_publications.append((topic, payload))
        if self._client is not None and self.connected: self._client.publish(topic, json.dumps(payload, separators=(",", ":")), qos=1)
    def drain_shadow_publications(self) -> list[tuple[str, dict[str, Any]]]:
        result, self._shadow_publications = self._shadow_publications, []; return result
    def drain_publications(self) -> list[tuple[str, dict[str, Any]]]:
        result, self._publications = self._publications, []; return result
    def _ack(self, command: dict[str, Any], status: str, code: str | None = None) -> None:
        # The Education feedback worker needs eventId (idempotency), sequence (ordering) and occurredAtMs; `atMs` is kept for older readers.
        sequence = command.get("sequence") if isinstance(command.get("sequence"), int) and not isinstance(command.get("sequence"), bool) else 0
        ack = {"schemaVersion": 1, "kind": "ack", "robotId": self.robot_id, "commandId": command.get("commandId"), "status": status, "atMs": self.clock(),
               "eventId": f"{command.get('commandId')}:ack:{status}", "sequence": max(0, sequence), "occurredAtMs": self.clock()}
        if code: ack["code"] = code
        self.acks.append(ack); self._publish("ack", ack)
    _EXECUTION = {"running": "executing", "succeeded": "completed"}
    _TERMINAL = {"succeeded", "failed", "preflight_failed", "cancelled", "stopped", "timeout"}
    def report_progress(self, command_id: str, sequence: int, snapshot: dict[str, Any]) -> None:
        """Publish the run's execution lifecycle (executing, then completed or failed) as `status` events the feedback worker understands.
        Each (command, status) is published once; sequences continue after the ack so ordering is strict."""
        state = snapshot.get("state") if isinstance(snapshot, dict) else None
        if isinstance(snapshot, dict): self._publish_telemetry(command_id, snapshot.get("telemetry"), terminal=state in self._TERMINAL)
        status = self._EXECUTION.get(state) if isinstance(state, str) else None
        if status is None and state in self._TERMINAL: status = "failed"
        if status is None: return
        with self._lock:
            if (command_id, status) in self._reported: return
            self._reported.add((command_id, status))
        event = {"schemaVersion": 1, "kind": "status", "robotId": self.robot_id, "commandId": command_id, "status": status,
                 "eventId": f"{command_id}:status:{status}", "sequence": sequence + (1 if status == "executing" else 2), "occurredAtMs": self.clock(), "atMs": self.clock()}
        code = snapshot.get("errorCode") if isinstance(snapshot.get("errorCode"), str) else (state if status == "failed" else None)
        if code: event["code"] = code
        self._publish("status", event)
    def _publish_telemetry(self, command_id: str, telemetry: Any, *, terminal: bool = False) -> None:
        """Relay a validated SIMULATION frame on the `status` topic, correlated to the command, for the Education API's Digital Twin bridge.
        Never carries setpoints; one frame per telemetry sequence, at most 2 per second and 120 per command (the final frame bypasses only the rate limit)."""
        if not isinstance(telemetry, dict) or telemetry.get("source_mode") != "SIMULATION" or telemetry.get("robot_id") != self.robot_id: return
        sequence = telemetry.get("sequence")
        if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 0: return
        with self._lock:
            if sequence <= self._telemetry_sequence.get(command_id, -1) or self._telemetry_count.get(command_id, 0) >= 120: return
            now = time.monotonic(); last = self._telemetry_last_s.get(command_id)
            if not terminal and last is not None and now - last < 0.5: return
            self._telemetry_sequence[command_id], self._telemetry_last_s[command_id] = sequence, now
            self._telemetry_count[command_id] = self._telemetry_count.get(command_id, 0) + 1
            while len(self._telemetry_sequence) > 64:
                oldest = next(iter(self._telemetry_sequence)); self._telemetry_sequence.pop(oldest); self._telemetry_count.pop(oldest, None); self._telemetry_last_s.pop(oldest, None)
        self._publish("status", {"schemaVersion": 1, "kind": "status", "status": "telemetry", "robotId": self.robot_id, "commandId": command_id,
                                 "eventId": f"{command_id}:telemetry:{sequence}", "sequence": sequence, "occurredAtMs": self.clock(), "telemetry": telemetry})
    def _schedule_heartbeat(self) -> None:
        if self._closing.is_set(): return
        timer = threading.Timer(self._heartbeat_seconds, self._heartbeat); timer.daemon = True
        previous, self._heartbeat_timer = self._heartbeat_timer, timer
        if previous is not None: previous.cancel()
        timer.start()
    def _heartbeat(self) -> None:
        try:
            if self.connected and self.config.get("deviceShadow", True) is not False: self._report_shadow(self.runtime.status())
        except Exception as error:  # a failed status read must never stop the heartbeat loop or publish invented readiness
            LOG.warning("shadow heartbeat skipped: %s", type(error).__name__)
        finally:
            if self.connected: self._schedule_heartbeat()
    def _watch(self, command_id: str, sequence: int, run_id: str, deadline_s: float = 900.0) -> None:
        end = time.monotonic() + deadline_s
        while not self._closing.is_set() and time.monotonic() < end:
            snapshot = self.runtime.get(run_id) if hasattr(self.runtime, "get") else None
            if isinstance(snapshot, dict):
                self.report_progress(command_id, sequence, snapshot)
                if snapshot.get("state") in self._TERMINAL: return
            self._closing.wait(0.5)
    def _track(self, command_id: str, sequence: int, snapshot: Any) -> None:
        if not isinstance(snapshot, dict): return
        self.report_progress(command_id, sequence, snapshot)
        run_id = snapshot.get("runId")
        if snapshot.get("state") in self._TERMINAL or not isinstance(run_id, str) or self.config.get("watchProgress", True) is False: return
        thread = threading.Thread(target=self._watch, args=(command_id, sequence, run_id), daemon=True, name=f"iot-watch-{command_id[:8]}")
        self._watchers.append(thread); thread.start()
    def _remember_command(self, command_id: str, status: str, code: str | None) -> None:
        self._seen_commands[command_id] = (status, code)
        while len(self._seen_commands) > self._max_seen_commands: self._seen_commands.pop(next(iter(self._seen_commands)))
    def handle_command(self, command: Any) -> None:
        if not isinstance(command, dict) or command.get("schemaVersion") != 1 or command.get("kind") != "run": self._ack(command if isinstance(command, dict) else {}, "rejected", "command_invalid"); return
        command_id, robot_id, sequence, expires = command.get("commandId"), command.get("robotId"), command.get("sequence"), command.get("expiresAtMs")
        if not isinstance(command_id, str) or not command_id or robot_id != self.robot_id or not isinstance(sequence, int) or isinstance(sequence, bool) or not isinstance(expires, int): self._ack(command, "rejected", "command_identity_invalid"); return
        previous = self._seen_commands.get(command_id)
        if previous is not None: self._ack(command, *previous); return
        if expires <= self.clock(): self._ack(command, "rejected", "command_expired"); return
        if sequence <= self.last_sequence: self._ack(command, "rejected", "command_replayed"); return
        payload = command.get("payload")
        if not isinstance(payload, dict): self._ack(command, "rejected", "command_payload_invalid"); return
        self.last_sequence = sequence
        status, code = "rejected", "runtime_rejected"
        try:
            snapshot = self.runtime.submit(payload); state = snapshot.get("state") if isinstance(snapshot, dict) else None
            status, code = ("accepted" if state not in {"preflight_failed", "failed"} else "rejected"), (snapshot.get("errorCode") if isinstance(snapshot, dict) else "runtime_response_invalid")
        except Exception as error:
            LOG.warning("iot command rejected: %s", type(error).__name__)
        self._remember_command(command_id, status, code); self._ack(command, status, code)
        if status == "accepted": self._track(command_id, sequence, snapshot)
        self.publish_state()
    def publish_state(self) -> None:
        status = self.runtime.status()
        if self.config.get("deviceShadow", True) is not False: self._report_shadow(status)
        self._publish("status", {"schemaVersion": 1, "kind": "status", "robotId": self.robot_id, "atMs": self.clock(), "connection": "connected" if self.connected else "disconnected", "hardwareEnabled": status.get("hardwareEnabled") is True, "stopped": status.get("stopped") is True})
        if self.config.get("fakeRobot") is True: self._publish("telemetry", {"schemaVersion": 1, "kind": "telemetry", "robotId": self.robot_id, "source": "fake_follower", "atMs": self.clock(), "sequence": max(0, self.last_sequence), "jointState": {"shoulder_pan": 0, "shoulder_lift": 0, "elbow_flex": 0, "wrist_flex": 0, "wrist_roll": 0, "gripper": 0}})
    def connect(self, tls: TlsSettings, mqtt_factory: Callable[..., Any] | None = None) -> None:
        if mqtt_factory is None:
            try: import paho.mqtt.client as mqtt
            except ImportError as error: raise RuntimeError("paho-mqtt is required for AWS IoT transport") from error
            # paho-mqtt 2.x requires an explicit callback API version; MQTT 3.1.1 over mutual TLS with the Thing name as the client id.
            mqtt_factory = lambda client_id: mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id=client_id, protocol=mqtt.MQTTv311, clean_session=True)  # noqa: E731
        context = ssl.create_default_context(cafile=tls.ca_path); context.minimum_version = ssl.TLSVersion.TLSv1_2; context.load_cert_chain(tls.certificate_path, tls.private_key_path)
        client = mqtt_factory(client_id=tls.thing_name); client.tls_set_context(context); client.tls_insecure_set(False)
        client.on_connect, client.on_disconnect, client.on_message = self._on_connect, self._on_disconnect, self._on_message
        if self.config.get("deviceShadow", True) is not False and hasattr(client, "will_set"):
            # Last will: if the edge vanishes without a clean disconnect, IoT Core marks the shadow disconnected for it.
            client.will_set(self.shadow_topic(), json.dumps({"state": {"reported": {"connection": "disconnected", "runtimeKind": self._runtime_kind()}}}, separators=(",", ":")), qos=1)
        self._client = client; client.connect_async(tls.endpoint, 8883, keepalive=30); client.loop_start()
    def close(self) -> None:
        self._closing.set()
        if self._heartbeat_timer is not None: self._heartbeat_timer.cancel(); self._heartbeat_timer = None
        if self._client is not None: self._client.disconnect(); self._client.loop_stop(); self._client = None
        self.connected = False
    def _on_connect(self, client: Any, _userdata: Any, _flags: Any, reason_code: Any, _properties: Any = None) -> None:
        if int(getattr(reason_code, "value", reason_code)) != 0: LOG.warning("AWS IoT connection refused: %s", reason_code); return
        self.connected, self._retry_seconds = True, 1; client.subscribe(f"{self.topic_prefix}/commands", qos=1); self.publish_state(); self._schedule_heartbeat()
    def _on_disconnect(self, _client: Any, _userdata: Any, *_args: Any) -> None:
        self.connected = False
        if self._heartbeat_timer is not None: self._heartbeat_timer.cancel(); self._heartbeat_timer = None
        self._retry_seconds = min(30, max(1, self._retry_seconds * 2)); LOG.warning("AWS IoT disconnected; bounded reconnect backoff %ss", self._retry_seconds)
    def _on_message(self, _client: Any, _userdata: Any, message: Any) -> None:
        try: self.handle_command(json.loads(message.payload))
        except (UnicodeDecodeError, json.JSONDecodeError): self._ack({}, "rejected", "command_invalid_json")
