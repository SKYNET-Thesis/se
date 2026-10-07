import { Controller, Get } from "@nestjs/common";
import { MqttConnectionService } from "../infrastructure/mqtt/mqtt-connection.service";

@Controller("status")
export class StatusController {
  constructor(private readonly mqtt: MqttConnectionService) {}

  @Get()
  getStatus(): { mqtt: { connected: boolean } } {
    return { mqtt: { connected: this.mqtt.isConnected } };
  }
}
