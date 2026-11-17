import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class RubricCriterionDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) maxPoints!: number;
}
export class ReplaceRubricDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => RubricCriterionDto) criteria!: RubricCriterionDto[];
}
export class UpdateScheduleDto {
  @IsOptional() @IsDateString() availableFrom?: string | null;
  @IsOptional() @IsDateString() dueAt?: string | null;
  @IsOptional() @IsDateString() closeAt?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxAttempts?: number | null;
}
export class ReopenGradingDto {
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}
