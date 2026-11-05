import { ArrayMinSize, ArrayUnique, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class KnowledgeCheckAnswerDto {
  @IsString() @MaxLength(100)
  questionId!: string;

  @IsOptional() @IsString() @MaxLength(100)
  optionId?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsString({ each: true })
  optionIds?: string[];
}

export class SubmitKnowledgeCheckDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => KnowledgeCheckAnswerDto)
  answers!: KnowledgeCheckAnswerDto[];
}
