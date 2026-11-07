import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const nonBlank = { message: 'Title cannot be empty or whitespace.' };

export class CreateCourseDto {
  @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}
export class CreateLessonDto { @IsString() @Matches(/\S/, nonBlank) @MaxLength(240) title!: string; @IsOptional() content?: Record<string, unknown>; }
export class UpdateLessonDto { @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(240) title?: string; @IsOptional() content?: Record<string, unknown>; }
export class ReorderLessonsDto { @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) orderedIds!: string[]; }
export class LessonPrerequisitesDto { @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) prerequisiteLessonIds!: string[]; }
