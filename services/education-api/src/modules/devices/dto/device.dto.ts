import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

export const DEVICE_KINDS = ["desktop_lab_station", "edge_runtime"] as const;
const nonBlank = { message: "Value cannot be empty or whitespace." };

export class RegisterDeviceDto {
  @IsString() @Matches(/\S/, nonBlank) @MaxLength(120) name!: string;
  @IsIn(DEVICE_KINDS as unknown as string[]) deviceKind!: (typeof DEVICE_KINDS)[number];
  /** Optional: the robot this device serves. It must be entitled to the organization. */
  @IsOptional() @IsUUID() robotId?: string;
}
export class DeviceReasonDto { @IsOptional() @IsString() @MaxLength(500) reason?: string; }
export class EnrollStartDto { @IsString() @Matches(/^[A-Za-z0-9_-]{24,80}$/) enrollmentCode!: string; }
export class EnrollCompleteDto {
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(80) nonce!: string;
  @IsString() @MaxLength(200) publicKey!: string;
  @IsString() @MaxLength(120) signature!: string;
}
export class AuthChallengeDto { @IsUUID() deviceId!: string; }
export class AuthTokenDto {
  @IsUUID() deviceId!: string;
  @IsString() @MaxLength(80) nonce!: string;
  @IsString() @MaxLength(120) signature!: string;
}
