import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const nonBlank = { message: "Value cannot be empty or whitespace." };

/** Metadata that is safe to change without altering classroom membership or learning history. */
export class UpdateClassroomDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, nonBlank)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, nonBlank)
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  capacity?: number;
}
