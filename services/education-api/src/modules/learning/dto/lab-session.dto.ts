import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

export class StartLabSessionDto {
  @IsUUID() robotId!: string;
  @IsOptional() @IsInt() @Min(5) @Max(1440) durationMinutes?: number;
}
export class ExtendLabSessionDto {
  @IsInt() @Min(5) @Max(240) minutes!: number;
}
export class ForceEndLabSessionDto {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsBoolean() confirm!: boolean;
}
