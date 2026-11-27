import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";

/** Existing `robots.status` values; `in_use` is system-derived and cannot be set by hand. */
export const SETTABLE_ROBOT_STATUSES = ["available", "maintenance", "retired"] as const;

export class CreateRobotResourceDto {
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/, { message: "serialNo must be 3-64 letters, digits, dot, underscore or hyphen." }) serialNo!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) modelName?: string;
  @IsOptional() @IsString() @MaxLength(60) firmwareVersion?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsUUID() ownerOrganizationId?: string;
}

export class UpdateRobotResourceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) modelName?: string;
  @IsOptional() @IsString() @MaxLength(60) firmwareVersion?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(SETTABLE_ROBOT_STATUSES as unknown as string[]) status?: (typeof SETTABLE_ROBOT_STATUSES)[number];
}

export class GrantRobotEntitlementDto {
  @IsUUID() organizationId!: string;
  @IsOptional() @IsISO8601() validTo?: string;
}
