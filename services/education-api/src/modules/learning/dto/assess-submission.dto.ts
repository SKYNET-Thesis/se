import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";

class AssessmentScoreDto {
  @IsUUID() criterionId!: string;
  @IsNumber() @Min(0) awardedPoints!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class AssessSubmissionDto {
  @IsOptional() @IsString() @MaxLength(5000) overallFeedback?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AssessmentScoreDto)
  scores!: AssessmentScoreDto[];
}
