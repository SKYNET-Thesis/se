import { Controller, Get } from "@nestjs/common";
import { StatusService } from "./status.service";

@Controller("status")
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  getStatus(): { mqtt: { connected: boolean } } {
    return this.status.getStatus();
  }
}
