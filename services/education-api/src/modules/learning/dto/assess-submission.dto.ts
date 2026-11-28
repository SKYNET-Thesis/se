import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from "class-validator";

class AssessmentScoreDto {
  @IsUUID() criterionId!: string;
  /** Direct points (legacy / free entry). Optional when an achievement `level` is given: the server then computes level × (max/4). */
  @ValidateIf((o: AssessmentScoreDto) => o.level === undefined) @IsNumber() @Min(0) awardedPoints?: number;
  /** Migration T: achievement level 0 (graded, no points) … 4. */
  @IsOptional() @IsInt() @Min(0) @Max(4) level?: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class AssessSubmissionDto {
  @IsOptional() @IsString() @MaxLength(5000) overallFeedback?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => AssessmentScoreDto)
  scores!: AssessmentScoreDto[];
}
