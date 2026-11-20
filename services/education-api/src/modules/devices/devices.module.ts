import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { DeviceAuthGuard } from "./device-auth.guard";
import { DeviceProvisioningService } from "./device-provisioning.service";
import { DeviceController, DeviceManagementController } from "./devices.controller";
import { DeviceRateLimitGuard } from "./device-rate-limit.guard";

@Module({ imports: [IdentityModule], controllers: [DeviceManagementController, DeviceController], providers: [DeviceProvisioningService, DeviceAuthGuard, DeviceRateLimitGuard], exports: [DeviceProvisioningService] })
export class DevicesModule {}
