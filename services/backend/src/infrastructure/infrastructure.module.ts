import { Module } from "@nestjs/common";
import { DatabaseService } from "./persistence/database.service";
import { MqttConnectionService } from "./mqtt/mqtt-connection.service";

@Module({
  providers: [DatabaseService, MqttConnectionService],
  exports: [DatabaseService, MqttConnectionService],
})
export class InfrastructureModule {}
