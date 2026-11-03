import { ArrayMinSize, IsArray, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class KnowledgeCheckAnswerDto {
  @IsString() @MaxLength(100)
  questionId!: string;

  @IsString() @MaxLength(100)
  optionId!: string;
}

export class SubmitKnowledgeCheckDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => KnowledgeCheckAnswerDto)
  answers!: KnowledgeCheckAnswerDto[];
}
