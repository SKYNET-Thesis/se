import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedDevice, DeviceProvisioningService } from "./device-provisioning.service";

export type DeviceRequest = Request & { device: AuthenticatedDevice };

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly devices: DeviceProvisioningService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer vd1.")) throw new UnauthorizedException("Device authentication failed.");
    request.device = await this.devices.authenticate(header.slice("Bearer ".length));
    return true;
  }
}
