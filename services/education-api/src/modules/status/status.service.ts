import { Injectable } from "@nestjs/common";
import { StatusRepository } from "./status.repository";

export interface SystemStatus {
  mqtt: {
    connected: boolean;
  };
}

@Injectable()
export class StatusService {
  constructor(private readonly repository: StatusRepository) {}

  getStatus(): SystemStatus {
    return {
      mqtt: {
        connected: this.repository.isMqttConnected(),
      },
    };
  }
}
