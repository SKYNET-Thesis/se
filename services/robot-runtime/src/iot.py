"""AWS IoT Core transport; MQTT only carries authorised high-level jobs."""
from __future__ import annotations
import json
import logging
import ssl
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
        self.last_sequence, self.acks, self._publications, self._client, self.connected = -1, [], [], None, False
        self._seen_commands: dict[str, tuple[str, str | None]] = {}
        self._max_seen_commands = max(1, int(config.get("commandDedupLimit", 1024)))
        self._retry_seconds = 1
    def _publish(self, suffix: str, value: dict[str, Any]) -> None:
        topic = f"{self.topic_prefix}/{suffix}"; self._publications.append((topic, value))
        if self._client is not None and self.connected: self._client.publish(topic, json.dumps(value, separators=(",", ":")), qos=1)
    def drain_publications(self) -> list[tuple[str, dict[str, Any]]]:
        result, self._publications = self._publications, []; return result
    def _ack(self, command: dict[str, Any], status: str, code: str | None = None) -> None:
        ack = {"schemaVersion": 1, "kind": "ack", "robotId": self.thing_name, "commandId": command.get("commandId"), "status": status, "atMs": self.clock()}
        if code: ack["code"] = code
        self.acks.append(ack); self._publish("ack", ack)
    def _remember_command(self, command_id: str, status: str, code: str | None) -> None:
        self._seen_commands[command_id] = (status, code)
        while len(self._seen_commands) > self._max_seen_commands: self._seen_commands.pop(next(iter(self._seen_commands)))
    def handle_command(self, command: Any) -> None:
        if not isinstance(command, dict) or command.get("schemaVersion") != 1 or command.get("kind") != "run": self._ack(command if isinstance(command, dict) else {}, "rejected", "command_invalid"); return
        command_id, robot_id, sequence, expires = command.get("commandId"), command.get("robotId"), command.get("sequence"), command.get("expiresAtMs")
        if not isinstance(command_id, str) or not command_id or robot_id != self.thing_name or not isinstance(sequence, int) or isinstance(sequence, bool) or not isinstance(expires, int): self._ack(command, "rejected", "command_identity_invalid"); return
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
        self.publish_state()
    def publish_state(self) -> None:
        status = self.runtime.status()
        self._publish("status", {"schemaVersion": 1, "kind": "status", "robotId": self.thing_name, "atMs": self.clock(), "connection": "connected" if self.connected else "disconnected", "hardwareEnabled": status.get("hardwareEnabled") is True, "stopped": status.get("stopped") is True})
        if self.config.get("fakeRobot") is True: self._publish("telemetry", {"schemaVersion": 1, "kind": "telemetry", "robotId": self.thing_name, "source": "fake_follower", "atMs": self.clock(), "sequence": max(0, self.last_sequence), "jointState": {"shoulder_pan": 0, "shoulder_lift": 0, "elbow_flex": 0, "wrist_flex": 0, "wrist_roll": 0, "gripper": 0}})
    def connect(self, tls: TlsSettings, mqtt_factory: Callable[..., Any] | None = None) -> None:
        if mqtt_factory is None:
            try: import paho.mqtt.client as mqtt
            except ImportError as error: raise RuntimeError("paho-mqtt is required for AWS IoT transport") from error
            mqtt_factory = mqtt.Client
        context = ssl.create_default_context(cafile=tls.ca_path); context.minimum_version = ssl.TLSVersion.TLSv1_2; context.load_cert_chain(tls.certificate_path, tls.private_key_path)
        client = mqtt_factory(client_id=tls.thing_name); client.tls_set_context(context); client.tls_insecure_set(False)
        client.on_connect, client.on_disconnect, client.on_message = self._on_connect, self._on_disconnect, self._on_message
        self._client = client; client.connect_async(tls.endpoint, 8883, keepalive=30); client.loop_start()
    def close(self) -> None:
        if self._client is not None: self._client.disconnect(); self._client.loop_stop(); self._client = None
        self.connected = False
    def _on_connect(self, client: Any, _userdata: Any, _flags: Any, reason_code: Any, _properties: Any = None) -> None:
        if int(reason_code) != 0: LOG.warning("AWS IoT connection refused: %s", reason_code); return
        self.connected, self._retry_seconds = True, 1; client.subscribe(f"{self.topic_prefix}/commands", qos=1); self.publish_state()
    def _on_disconnect(self, _client: Any, _userdata: Any, *_args: Any) -> None:
        self.connected = False; self._retry_seconds = min(30, max(1, self._retry_seconds * 2)); LOG.warning("AWS IoT disconnected; bounded reconnect backoff %ss", self._retry_seconds)
    def _on_message(self, _client: Any, _userdata: Any, message: Any) -> None:
        try: self.handle_command(json.loads(message.payload))
        except (UnicodeDecodeError, json.JSONDecodeError): self._ack({}, "rejected", "command_invalid_json")
