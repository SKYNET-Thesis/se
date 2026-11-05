import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateQuestionDto {
  @IsUUID() organizationId!: string;
  @IsString() @MaxLength(80) code!: string;
  @IsUUID() courseId!: string;
  @IsUUID() lessonId!: string;
  @IsOptional() @IsString() @MaxLength(120) domain?: string;
}

export class QuestionOptionDto {
  @IsString() @MaxLength(80) id!: string;
  @IsString() @MaxLength(2000) text!: string;
}

export class VersionContentDto {
  @IsIn(['single_choice', 'multiple_choice', 'true_false']) type!: string;
  @IsIn(['easy', 'medium', 'hard']) difficulty!: string;
  @IsIn(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']) cognitiveLevel!: string;
  @IsString() @MaxLength(10000) stem!: string;
  @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => QuestionOptionDto) options!: QuestionOptionDto[];
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsString({ each: true }) answerKey!: string[];
  @IsOptional() @IsString() @MaxLength(10000) explanation?: string;
  @IsOptional() @IsString() @MaxLength(1000) sourceReference?: string;
}

export class UpdateVersionDto {
  @IsOptional() @IsIn(['single_choice', 'multiple_choice', 'true_false']) type?: string;
  @IsOptional() @IsIn(['easy', 'medium', 'hard']) difficulty?: string;
  @IsOptional() @IsIn(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']) cognitiveLevel?: string;
  @IsOptional() @IsString() @MaxLength(10000) stem?: string;
  @IsOptional() @IsArray() @ArrayMinSize(2) @ValidateNested({ each: true }) @Type(() => QuestionOptionDto) options?: QuestionOptionDto[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsString({ each: true }) answerKey?: string[];
  @IsOptional() @IsString() @MaxLength(10000) explanation?: string;
  @IsOptional() @IsString() @MaxLength(1000) sourceReference?: string;
}

export class ObjectiveMappingDto {
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true }) objectiveIds!: string[];
}

export class QuestionSearchDto {
  @IsUUID() organizationId!: string;
  @IsOptional() @IsUUID() courseId?: string;
  @IsOptional() @IsUUID() lessonId?: string;
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @IsIn(['draft', 'in_review', 'published', 'archived']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class AddAssignmentQuestionDto {
  @IsUUID() questionVersionId!: string;
  @IsInt() @Min(1) ordinal!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) points!: number;
}

export class ReorderAssignmentQuestionsDto {
  @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) orderedVersionIds!: string[];
}
