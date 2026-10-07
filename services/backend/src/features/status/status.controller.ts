import { Controller, Get, Query } from "@nestjs/common";
import { StatusRequestDto } from "./dto/status-request.dto";
import { StatusService } from "./status.service";

@Controller("status")
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  getStatus(@Query() _query: StatusRequestDto): { mqtt: { connected: boolean } } {
    return this.status.getStatus();
  }
}
