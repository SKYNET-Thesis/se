import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const STAFF_ROLES = ["school_admin", "instructor"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Direct creation or invitation of a School Administrator (System Admin only) or Instructor (School Admin of that school, or System Admin). */
export class CreateStaffAccountDto {
  @IsIn(["direct", "invite"]) method!: "direct" | "invite";
  @IsIn(STAFF_ROLES as unknown as string[]) role!: StaffRole;
  @IsString() @MinLength(2) @MaxLength(160) fullName!: string;
  @IsEmail() @MaxLength(254) email!: string;
  /** Required for instructors (same rule as the Instructor import). */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) employeeCode?: string;
}

export class StaffPasswordChangeDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword!: string;
}
