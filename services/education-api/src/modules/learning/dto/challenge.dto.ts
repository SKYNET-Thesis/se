import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

export class ChallengeTargetDto {
  @IsIn(["left", "right"]) arm!: "left" | "right";
  @IsNumber() x!: number; @IsNumber() y!: number; @IsNumber() z!: number;
}
export class ChallengeConditionDto {
  @IsString() @MaxLength(60) ruleKey!: string;
  @IsObject() ruleConfig!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}
/** Create and partial update share this shape; the service enforces which fields are required. */
export class ChallengeBodyDto {
  @IsOptional() @IsString() @MaxLength(400) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) allowedBlocks?: string[];
  @IsOptional() @ValidateNested() @Type(() => ChallengeTargetDto) target?: ChallengeTargetDto | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ChallengeConditionDto) conditions?: ChallengeConditionDto[];
}
