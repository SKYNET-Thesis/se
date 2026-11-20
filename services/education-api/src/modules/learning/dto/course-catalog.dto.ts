import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ACADEMIC_LEVELS } from '../course-academic';

const nonBlank = { message: 'Title cannot be empty or whitespace.' };

export class CreateCourseDto {
  @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  /** Optional; only honoured when it is one of the caller's own authoring schools. Never trusted for authorization. */
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsIn(ACADEMIC_LEVELS as unknown as string[]) level?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(32, { each: true }) tags?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsUUID('4', { each: true }) prerequisiteCourseIds?: string[];
}

export class UpdateCourseDto {
  @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(ACADEMIC_LEVELS as unknown as string[]) level?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(32, { each: true }) tags?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @IsUUID('4', { each: true }) prerequisiteCourseIds?: string[];
}
export class CreateLessonDto { @IsString() @Matches(/\S/, nonBlank) @MaxLength(240) title!: string; @IsOptional() content?: Record<string, unknown>; }
export class UpdateLessonDto { @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(240) title?: string; @IsOptional() content?: Record<string, unknown>; }
export class ReorderLessonsDto { @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) orderedIds!: string[]; }
export class LessonPrerequisitesDto { @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) prerequisiteLessonIds!: string[]; }

export class CourseListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
  @IsOptional() @IsIn(ACADEMIC_LEVELS as unknown as string[]) level?: string;
  @IsOptional() @IsString() @MaxLength(32) tag?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
