import { IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";

const nonBlank = { message: "Value cannot be empty or whitespace." };

export class UpdateCourseOfferingDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/\S/, nonBlank) @MaxLength(80) code?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(200) title?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) academicTerm?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(2000) @Max(9999) academicYear?: number;
}
