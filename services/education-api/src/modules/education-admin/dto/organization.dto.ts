import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const nonBlank = { message: "Value cannot be empty or whitespace." };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const ORGANIZATION_SEGMENTS = ["education", "research", "assistive", "hobby"] as const;
export const ORGANIZATION_STATUSES = ["active", "suspended", "closed"] as const;

export class CreateOrganizationDto {
  @IsString() @Matches(/\S/, nonBlank) @MaxLength(160) name!: string;
  /** Optional stable school code (letters, digits, dash); generated when omitted. */
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9-]{2,31}$/, { message: "School code must be 3-32 letters, digits or dashes." }) schoolCode?: string;
  @IsOptional() @IsIn(ORGANIZATION_SEGMENTS as unknown as string[]) segment?: (typeof ORGANIZATION_SEGMENTS)[number];
  @IsOptional() @IsString() @Matches(isoDate, { message: "Use YYYY-MM-DD." }) contractStart?: string;
  @IsOptional() @IsString() @Matches(isoDate, { message: "Use YYYY-MM-DD." }) contractEnd?: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(160) name?: string;
  @IsOptional() @IsIn(ORGANIZATION_SEGMENTS as unknown as string[]) segment?: (typeof ORGANIZATION_SEGMENTS)[number];
  @IsOptional() @IsIn(ORGANIZATION_STATUSES as unknown as string[]) status?: (typeof ORGANIZATION_STATUSES)[number];
  @IsOptional() @IsString() @Matches(isoDate, { message: "Use YYYY-MM-DD." }) contractStart?: string;
  @IsOptional() @IsString() @Matches(isoDate, { message: "Use YYYY-MM-DD." }) contractEnd?: string;
}

export class AssignOrganizationAdministratorDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(2) @Matches(/\S/, nonBlank) @MaxLength(160) fullName!: string;
}
