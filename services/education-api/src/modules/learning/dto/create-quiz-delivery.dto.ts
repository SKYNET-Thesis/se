import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateQuizDeliveryDto {
  @IsUUID() canonicalAssignmentId!: string;
  @IsOptional() @IsDateString() availableFrom?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsDateString() closeAt?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) maxAttempts?: number;
}
