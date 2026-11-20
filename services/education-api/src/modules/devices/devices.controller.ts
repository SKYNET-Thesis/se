import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { DeviceAuthGuard, type DeviceRequest } from "./device-auth.guard";
import { DeviceRateLimitGuard } from "./device-rate-limit.guard";
import { DeviceProvisioningService } from "./device-provisioning.service";
import { AuthChallengeDto, AuthTokenDto, DeviceReasonDto, EnrollCompleteDto, EnrollStartDto, RegisterDeviceDto } from "./dto/device.dto";

/** Management by a School Admin of the organization (or a System Administrator). */
@ApiTags("Device management") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller("education-admin/organizations/:organizationId/devices")
export class DeviceManagementController {
  constructor(private readonly devices: DeviceProvisioningService) {}
  @Post() register(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) org: string, @Body() dto: RegisterDeviceDto) { return this.devices.register(user, org, dto); }
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) org: string) { return this.devices.list(user, org); }
  @Get(":deviceId") get(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) org: string, @Param("deviceId", ParseUUIDPipe) id: string) { return this.devices.get(user, org, id); }
  @Post(":deviceId/suspend") @HttpCode(200) suspend(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) org: string, @Param("deviceId", ParseUUIDPipe) id: string, @Body() dto: DeviceReasonDto) { return this.devices.suspend(user, org, id, dto.reason); }
  @Post(":deviceId/resume") @HttpCode(200) resume(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) org: string, @Param("deviceId", ParseUUIDPipe) id: string) { return this.devices.resume(user, org, id); }
  @Post(":deviceId/revoke") @HttpCode(200) revoke(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) org: string, @Param("deviceId", ParseUUIDPipe) id: string, @Body() dto: DeviceReasonDto) { return this.devices.revoke(user, org, id, dto.reason); }
  @Post(":deviceId/rotate-credential") rotate(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) org: string, @Param("deviceId", ParseUUIDPipe) id: string) { return this.devices.rotate(user, org, id); }
}

/** Called by the device itself. No user session: identity is the device's own key. */
@ApiTags("Devices") @Controller("devices")
export class DeviceController {
  constructor(private readonly devices: DeviceProvisioningService) {}
  @Post("enroll/start") @UseGuards(DeviceRateLimitGuard) enrollStart(@Body() dto: EnrollStartDto) { return this.devices.enrollStart(dto.enrollmentCode); }
  @Post("enroll/complete") @UseGuards(DeviceRateLimitGuard) enrollComplete(@Body() dto: EnrollCompleteDto) { return this.devices.enrollComplete(dto); }
  @Post("auth/challenge") @HttpCode(200) @UseGuards(DeviceRateLimitGuard) authChallenge(@Body() dto: AuthChallengeDto) { return this.devices.authChallenge(dto); }
  @Post("auth/token") @HttpCode(200) @UseGuards(DeviceRateLimitGuard) authToken(@Body() dto: AuthTokenDto) { return this.devices.authToken(dto); }
  @Get("me") @UseGuards(DeviceAuthGuard) me(@Req() request: DeviceRequest) { return request.device; }
  @Post("me/heartbeat") @HttpCode(200) @UseGuards(DeviceAuthGuard) heartbeat(@Req() request: DeviceRequest) { return this.devices.heartbeat(request.device); }
}
