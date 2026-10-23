import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

export class ImportClassroomStudentRowDto {
  @IsOptional() @IsString() @MaxLength(100) firstName!: string;
  @IsOptional() @IsString() @MaxLength(100) lastName!: string;
  @IsOptional() @IsString() @MaxLength(80) studentCode!: string;
  @IsOptional() @IsString() @MaxLength(80) gradeLevel!: string;
  @IsOptional() @IsString() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(320) guardianEmail?: string;
}
export class ImportClassroomStudentsDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportClassroomStudentRowDto)
  rows!: ImportClassroomStudentRowDto[];
}
