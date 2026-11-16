import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

const nonBlank = { message: "Value cannot be empty or whitespace." };

export class UpdateCourseOfferingDto {
  @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(80) code?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(80) academicTerm?: string;
  @IsOptional() @IsInt() @Min(2000) @Max(9999) academicYear?: number;
}
