import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import mqtt, { MqttClient } from "mqtt";

@Injectable()
export class MqttConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttConnectionService.name);
  private client?: MqttClient;

  constructor(private readonly config: ConfigService) {}

  get isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  onModuleInit(): void {
    const host = this.config.get<string>("MQTT_HOST", "localhost");
    const port = this.config.get<number>("MQTT_PORT", 1883);

    this.client = mqtt.connect(`mqtt://${host}:${port}`, { connectTimeout: 5000 });
    this.client.on("connect", () => {
      this.logger.log(`Connected to MQTT broker at ${host}:${port}`);
    });
    this.client.on("error", (error) => {
      this.logger.warn(`Could not connect to MQTT broker at ${host}:${port}: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.endAsync();
      this.client = undefined;
    }
  }
}
