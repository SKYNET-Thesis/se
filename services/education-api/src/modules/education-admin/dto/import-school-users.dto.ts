import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateIf, ValidateNested } from "class-validator";

export class ImportSchoolUserRowDto {
  @IsString() @MaxLength(100) firstName!: string;
  @IsString() @MaxLength(100) lastName!: string;
  @IsOptional() @ValidateIf((_, value) => value !== "") @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(80) employeeCode?: string;
  @IsOptional() @IsString() @MaxLength(80) studentCode?: string;
  @IsOptional() @IsString() @MaxLength(80) gradeLevel?: string;
  @IsOptional() @ValidateIf((_, value) => value !== "") @IsEmail() guardianEmail?: string;
}

export class ImportSchoolUsersDto {
  @IsIn(["teachers", "students"])
  kind!: "teachers" | "students";

  @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ImportSchoolUserRowDto)
  rows!: ImportSchoolUserRowDto[];
}
