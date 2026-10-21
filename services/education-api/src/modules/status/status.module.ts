import { Module } from "@nestjs/common";
import { StatusController } from "./status.controller";
import { StatusRepository } from "./status.repository";
import { StatusService } from "./status.service";

@Module({
  controllers: [StatusController],
  providers: [StatusRepository, StatusService],
})
export class StatusModule {}
