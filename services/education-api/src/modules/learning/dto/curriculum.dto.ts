import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from "class-validator";

const nonBlank = { message: "Title cannot be empty or whitespace." };

const activityTypes = ['reading', 'video', 'demonstration', 'guided_practice', 'knowledge_check', 'simulation', 'challenge', 'physical_lab', 'result', 'reflection'] as const;

export class CreateSectionDto {
  @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title!: string;
  @IsInt() @Min(1) ordinal!: number;
}

export class UpdateSectionDto {
  @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title?: string;
  @IsOptional() @IsInt() @Min(1) ordinal?: number;
}

export class CreateActivityDto {
  @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title!: string;
  @IsIn(activityTypes) type!: string;
  @IsInt() @Min(1) ordinal!: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsObject() contentRef!: Record<string, unknown>;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) objectiveIds?: string[];
}

export class UpdateActivityDto {
  @IsOptional() @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title?: string;
  @IsOptional() @IsIn(activityTypes) type?: string;
  @IsOptional() @IsInt() @Min(1) ordinal?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsObject() contentRef?: Record<string, unknown>;
  @IsOptional() @IsObject() content?: Record<string, unknown>;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) objectiveIds?: string[];
}

export class ReorderCurriculumDto {
  @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) orderedIds!: string[];
}

export class CurriculumStatusDto {
  @IsIn(['draft', 'published']) status!: 'draft' | 'published';
}

export class SaveProgrammingAssignmentDto {
  @IsString() @Matches(/\S/, nonBlank) @MaxLength(200) title!: string;
  @IsString() @MaxLength(10000) instructions!: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) allowedBlocks!: string[];
}
