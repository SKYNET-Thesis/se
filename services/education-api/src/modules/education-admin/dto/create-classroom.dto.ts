import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from "class-validator";

const nonBlank = { message: "Value cannot be empty or whitespace." };

export class CreateClassroomDto {
  @IsUUID()
  offeringId!: string;

  @IsString()
  @Matches(/\S/, nonBlank)
  @MaxLength(160)
  name!: string;

  @IsString()
  @Matches(/\S/, nonBlank)
  @MaxLength(80)
  code!: string;

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
