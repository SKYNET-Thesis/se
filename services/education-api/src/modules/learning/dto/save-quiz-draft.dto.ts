import { ArrayMaxSize, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { KnowledgeCheckAnswerDto } from "./submit-knowledge-check.dto";

/** A partial or complete set of answers saved WITHOUT grading. Never carries or returns answer keys. */
export class SaveQuizDraftDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => KnowledgeCheckAnswerDto)
  answers!: KnowledgeCheckAnswerDto[];
}
