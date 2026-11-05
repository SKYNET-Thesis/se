import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

const activityTypes = ['reading', 'video', 'demonstration', 'guided_practice', 'knowledge_check', 'simulation', 'challenge', 'physical_lab', 'result', 'reflection'] as const;

export class CreateSectionDto {
  @IsString() @MaxLength(200) title!: string;
  @IsInt() @Min(1) ordinal!: number;
}

export class UpdateSectionDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsInt() @Min(1) ordinal?: number;
}

export class CreateActivityDto {
  @IsString() @MaxLength(200) title!: string;
  @IsIn(activityTypes) type!: string;
  @IsInt() @Min(1) ordinal!: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsObject() contentRef!: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) objectiveIds?: string[];
}

export class UpdateActivityDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsIn(activityTypes) type?: string;
  @IsOptional() @IsInt() @Min(1) ordinal?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsObject() contentRef?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) objectiveIds?: string[];
}

export class ReorderCurriculumDto {
  @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) orderedIds!: string[];
}

export class CurriculumStatusDto {
  @IsIn(['draft', 'published']) status!: 'draft' | 'published';
}
